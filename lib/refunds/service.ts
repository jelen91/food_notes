import type { Entitlement } from '../billing';
import { PURCHASE_POLICY_VERSION, purchaseDeadlines } from '../purchase-policy';
import {
  PaymentVerificationError,
  stripeRefundProvider,
  type ProviderRefund,
  type RefundProvider,
} from './provider';
import { sendWithdrawalReceipt } from './email';
import {
  mongoRefundStore,
  REFUND_RETRY_WINDOW_MS,
  type RefundRecord,
  type RefundStore,
  type WithdrawalRecord,
} from './store';
import { STATUTORY_NOTICE, WITHDRAWAL_STATEMENT, type RefundResponse, type WithdrawalReceipt } from './types';

export interface RefundContext {
  accountId: string;
  email: string;
  entitlement: Entitlement | null;
}
interface Dependencies {
  store: RefundStore;
  provider: RefundProvider;
  now: () => Date;
  sendReceipt: (to: string, receipt: WithdrawalReceipt) => Promise<WithdrawalReceipt['emailStatus']>;
}
const defaults: Dependencies = {
  store: mongoRefundStore,
  provider: stripeRefundProvider,
  now: () => new Date(),
  sendReceipt: sendWithdrawalReceipt,
};

function validDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}
function deadline(entitlement: Entitlement | null): Date | null {
  const paidAt = validDate(entitlement?.paidAt);
  return entitlement?.kind === 'purchase' &&
    entitlement.purchasePolicyVersion === PURCHASE_POLICY_VERSION &&
    paidAt
    ? purchaseDeadlines(paidAt).refundUntil
    : null;
}
function purchase(entitlement: Entitlement | null): boolean {
  return entitlement?.kind === 'purchase' && Boolean(entitlement.stripeCheckoutSessionId);
}
function eligible(entitlement: Entitlement | null, now: Date): boolean {
  const until = deadline(entitlement);
  const paidAt = validDate(entitlement?.paidAt);
  return Boolean(
    purchase(entitlement) &&
    entitlement?.status === 'active' &&
    entitlement.stripePaymentIntentId &&
    until &&
    paidAt &&
    now >= paidAt &&
    now < until
  );
}
function retryable(record: RefundRecord | null, now: Date): boolean {
  return Boolean(
    record &&
    ['processing', 'failed'].includes(record.status) &&
    record.failureCode !== 'provider_failed' &&
    (!record.leaseUntil || record.leaseUntil <= now) &&
    now.getTime() - record.requestedAt.getTime() < REFUND_RETRY_WINDOW_MS
  );
}
function response(
  context: RefundContext,
  record: RefundRecord | null,
  withdrawal: WithdrawalRecord | null,
  now: Date
): RefundResponse {
  const canRetry = retryable(record, now);
  let status: RefundResponse['status'] =
    record?.status ??
    (withdrawal ? 'withdrawal_requested' : eligible(context.entitlement, now) ? 'available' : 'unavailable');
  if (record?.status === 'processing' && canRetry) status = 'failed';
  if (
    record &&
    ['processing', 'failed'].includes(record.status) &&
    record.failureCode !== 'provider_failed' &&
    now.getTime() - record.requestedAt.getTime() >= REFUND_RETRY_WINDOW_MS
  )
    status = 'review_required';
  const messages: Record<RefundResponse['status'], string> = {
    available:
      'V rámci třídenní garance můžete požádat o vrácení celé zaplacené částky bez udání důvodu. Po přijetí vrácení platby poskytovatelem se přístup k deníku ukončí.',
    unavailable:
      'Automatické vrácení v rámci třídenní garance teď není dostupné. Vaše případná zákonná práva tím nejsou dotčena.',
    processing:
      'Požadavek na vrácení peněz je uložený a ověřujeme jeho zpracování. Nezadávejte novou platbu; stav můžete obnovit.',
    pending:
      'Stripe přijal vrácení platby a ještě je zpracovává. Přístup k deníku je pozastavený. Peníze nemusí být ještě připsané na vašem účtu.',
    succeeded:
      'Stripe potvrdil vrácení celé platby. Přístup k deníku je ukončený. Připsání peněz na váš účet závisí na bance.',
    failed:
      record?.failureCode === 'provider_failed'
        ? 'Poskytovatel vrácení platby nedokončil. Váš požadavek zůstává uložený a je potřeba jej dořešit; lhůta původního podání je zachovaná.'
        : 'Požadavek jsme uložili, ale výsledek vrácení platby zatím není potvrzený. Můžete bezpečně zkontrolovat stav nebo opakovat tentýž požadavek.',
    review_required:
      'Požadavek na vrácení peněz je uložený a vyžaduje dořešení provozovatelem. Čas původního podání zůstává zachovaný. Vrácení peněz zatím není potvrzené.',
    withdrawal_requested:
      'Odstoupení od smlouvy bylo přijato. Potvrzení si můžete uložit. Vypořádání platby se posuzuje podle zákona; toto potvrzení neznamená, že peníze již byly vráceny.',
  };
  return {
    status,
    accountEmail: context.email,
    paidAt: validDate(context.entitlement?.paidAt)?.toISOString() ?? null,
    guarantee: {
      eligible: record ? canRetry : eligible(context.entitlement, now),
      endsAt: deadline(context.entitlement)?.toISOString() ?? null,
      hours: 72,
    },
    canRequestWithdrawal: purchase(context.entitlement) && !withdrawal,
    statutoryNotice: STATUTORY_NOTICE,
    withdrawalStatement: WITHDRAWAL_STATEMENT,
    ...(withdrawal ? { withdrawalReceipt: withdrawal.receipt } : {}),
    ...(record
      ? { requestedAt: record.requestedAt.toISOString(), updatedAt: record.updatedAt.toISOString() }
      : {}),
    retryable: canRetry,
    message: messages[status],
  };
}

async function applyProviderResult(
  record: RefundRecord,
  refund: ProviderRefund,
  deps: Dependencies,
  token?: string
): Promise<RefundRecord> {
  if (
    refund.paymentIntentId !== record._id ||
    refund.amount !== record.amount ||
    refund.currency !== record.currency
  ) {
    throw new PaymentVerificationError('refund_mismatch');
  }
  const status =
    refund.status === 'succeeded'
      ? 'succeeded'
      : ['pending', 'requires_action'].includes(refund.status)
        ? 'pending'
        : ['failed', 'canceled'].includes(refund.status)
          ? 'failed'
          : 'review_required';
  const updated = await deps.store.update(
    record,
    {
      status,
      providerRefundId: refund.id,
      updatedAt: deps.now(),
      leaseUntil: deps.now(),
      ...(status === 'failed' ? { failureCode: 'provider_failed' } : {}),
    },
    token
  );
  await deps.store.applyAccess(updated);
  return updated;
}

async function existingRefund(record: RefundRecord, deps: Dependencies): Promise<ProviderRefund | null> {
  if (record.providerRefundId) return deps.provider.retrieve(record.providerRefundId);
  const refunds = await deps.provider.list(record);
  const own = refunds.find((refund) => refund.reference === record.reference);
  if (own) return own;
  // A full refund performed in Stripe is recognized, never duplicated. Partial or multiple
  // refunds need human reconciliation because their aggregate state can change asynchronously.
  if (
    refunds.length === 1 &&
    ['succeeded', 'pending', 'requires_action'].includes(refunds[0].status) &&
    refunds[0].amount === record.amount &&
    refunds[0].currency === record.currency
  )
    return refunds[0];
  if (refunds.length) throw new PaymentVerificationError('existing_partial_or_multiple_refunds');
  return null;
}

/** Webhook reconciliation reads fresh provider state; failures propagate so Stripe can retry. */
export async function reconcileSavedRefund(
  record: RefundRecord,
  overrides: Partial<Dependencies> = {}
): Promise<void> {
  const deps = { ...defaults, ...overrides };
  if (record.status === 'succeeded') {
    await deps.store.applyAccess(record);
    return;
  }
  if (!record.amount || !record.currency) return;
  const found = await existingRefund(record, deps);
  if (found) await applyProviderResult(record, found, deps);
}

async function readRecords(context: RefundContext, deps: Dependencies) {
  const entitlement = context.entitlement;
  const [record, withdrawal] = await Promise.all([
    entitlement?.stripePaymentIntentId
      ? deps.store.find(entitlement.stripePaymentIntentId, context.accountId)
      : null,
    entitlement?.stripeCheckoutSessionId
      ? deps.store.findWithdrawal(entitlement.stripeCheckoutSessionId, context.accountId)
      : null,
  ]);
  return { record, withdrawal };
}

export async function getRefundStatus(
  context: RefundContext,
  overrides: Partial<Dependencies> = {}
): Promise<RefundResponse> {
  const deps = { ...defaults, ...overrides };
  let { record, withdrawal } = await readRecords(context, deps);
  if (record?.status === 'succeeded') await deps.store.applyAccess(record);
  else if (
    record &&
    record.amount &&
    record.currency &&
    (record.status === 'pending' || !record.leaseUntil || record.leaseUntil <= deps.now())
  ) {
    try {
      const found = await existingRefund(record, deps);
      if (found) record = await applyProviderResult(record, found, deps);
    } catch (error) {
      // A read request never creates a refund. Temporary provider outages preserve the saved state.
      if (error instanceof PaymentVerificationError)
        record = await deps.store.update(record, {
          status: 'review_required',
          failureCode: 'verification_failed',
          updatedAt: deps.now(),
        });
    }
  }
  return response(context, record, withdrawal, deps.now());
}

export async function requestGuaranteeRefund(
  context: RefundContext,
  overrides: Partial<Dependencies> = {}
): Promise<RefundResponse> {
  const deps = { ...defaults, ...overrides };
  const now = deps.now();
  const { record: existing, withdrawal } = await readRecords(context, deps);
  const entitlement = context.entitlement;
  if (!eligible(entitlement, now) && !existing) return response(context, null, withdrawal, now);
  if (!entitlement?.stripePaymentIntentId || !entitlement.stripeCheckoutSessionId)
    return response(context, existing, withdrawal, now);
  // Preserve the original timestamp BEFORE contacting Stripe. A provider outage cannot make a
  // request submitted inside the guarantee window expire while waiting for the network.
  const reserved = await deps.store.reserve(
    {
      _id: entitlement.stripePaymentIntentId,
      accountId: context.accountId,
      checkoutSessionId: entitlement.stripeCheckoutSessionId,
      requestedAt: existing?.requestedAt ?? now,
      policyVersion: existing?.policyVersion ?? entitlement.purchasePolicyVersion,
    },
    now
  );
  let record = reserved.record;
  if (!record || !reserved.acquired) return response(context, record, withdrawal, deps.now());
  try {
    const proof = await deps.provider.verify(record);
    if (
      (record.amount !== undefined && record.amount !== proof.amount) ||
      (record.currency !== undefined && record.currency !== proof.currency)
    )
      throw new PaymentVerificationError('payment_changed');
    record = await deps.store.update(record, { ...proof, updatedAt: deps.now() }, reserved.token);
    const found = await existingRefund(record, deps);
    const refund = found ?? (await deps.provider.create(record, proof));
    record = await applyProviderResult(record, refund, deps, reserved.token);
  } catch (error) {
    record = await deps.store.update(
      record,
      {
        status: error instanceof PaymentVerificationError ? 'review_required' : 'failed',
        failureCode:
          error instanceof PaymentVerificationError ? 'verification_failed' : 'provider_unconfirmed',
        updatedAt: deps.now(),
        leaseUntil: deps.now(),
      },
      reserved.token
    );
  }
  return response(context, record, withdrawal, deps.now());
}

export async function receiveWithdrawal(
  context: RefundContext,
  overrides: Partial<Dependencies> = {}
): Promise<RefundResponse> {
  const deps = { ...defaults, ...overrides };
  const now = deps.now();
  let { record, withdrawal } = await readRecords(context, deps);
  if (!purchase(context.entitlement)) return response(context, record, withdrawal, now);
  if (!withdrawal)
    withdrawal = await deps.store.receiveWithdrawal(
      context.entitlement.stripeCheckoutSessionId,
      context.accountId,
      {
        reference: '',
        accountEmail: context.email,
        operation: 'withdrawal_request',
        acceptedAt: now.toISOString(),
        statement: WITHDRAWAL_STATEMENT,
        paidAt: validDate(context.entitlement.paidAt)?.toISOString() ?? null,
        emailStatus: 'pending',
      },
      now
    );
  if (withdrawal.receipt.emailStatus !== 'sent') {
    const emailStatus = await deps
      .sendReceipt(context.email, withdrawal.receipt)
      .catch(() => 'failed' as const);
    // Acceptance is durable even if the mail provider or the email-status update fails.
    withdrawal = await deps.store.setWithdrawalEmail(withdrawal, emailStatus, deps.now()).catch(() => ({
      ...withdrawal,
      receipt: { ...withdrawal.receipt, emailStatus },
    }));
  }
  return response(context, record, withdrawal, deps.now());
}
