// Entitlement = zdroj pravdy o přístupu. Nikdy se neodvozuje z návratu ze Stripe,
// z query parametrů ani ze stavu ve frontendu – zapisuje ho výhradně ověřený webhook.
//
// Zpracování události je napsané nad rozhraním `BillingStore`, aby šlo testovat bez databáze.

import { ACCOUNTS, CHECKOUT_SESSIONS, ENTITLEMENTS, STRIPE_EVENTS, getDb } from './db';
import { EXPORT_GRACE_DAYS, PURCHASE_POLICY_VERSION, purchaseDeadlines } from './purchase-policy';

export type EntitlementKind = 'purchase' | 'legacy' | 'manual';
export type EntitlementStatus = 'active' | 'revoked';

export interface Entitlement {
  accountId: string;
  kind: EntitlementKind;
  status: EntitlementStatus;
  stripeCustomerId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripePriceId?: string | null;
  paidAt?: Date | null;
  /** Only purchases explicitly sold under these terms have a fixed duration. */
  purchasePolicyVersion?: string | null;
  accessUntil?: Date | null;
  refundUntil?: Date | null;
  exportUntil?: Date | null;
  revokedReason?: string | null;
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Minimální podoba Stripe události, se kterou logika pracuje. */
export interface StripeEventInput {
  id: string;
  type: string;
  accountId?: string | null;
  /** Dotazník vyplněný před platbou; účet k němu vzniká až tady. */
  draftId?: string | null;
  /** E-mail z Checkoutu – jediný osobní údaj, který od Stripe přebíráme. */
  customerEmail?: string | null;
  checkoutSessionId?: string | null;
  customerId?: string | null;
  paymentIntentId?: string | null;
  priceId?: string | null;
  paymentStatus?: string | null;
  purchasePolicyVersion?: string | null;
  /** Time from the verified payment event, never from a browser request. */
  paidAt?: Date | null;
}

export interface BillingStore {
  /** false = událost už byla zpracovaná (duplicitní doručení). */
  recordEvent(eventId: string, type: string): Promise<boolean>;
  markEventDone(eventId: string, outcome: string): Promise<void>;
  markEventFailed?(eventId: string): Promise<void>;
  resolveDuplicatePayment?(
    accountId: string,
    event: StripeEventInput
  ): Promise<'already_active' | 'duplicate_purchase_refunded' | 'duplicate_purchase_review'>;
  grantEntitlement(input: {
    accountId: string;
    checkoutSessionId?: string | null;
    customerId?: string | null;
    paymentIntentId?: string | null;
    priceId?: string | null;
    purchasePolicyVersion?: string | null;
    paidAt?: Date | null;
  }): Promise<'created' | 'already_active'>;
  setCheckoutSessionStatus(sessionId: string, status: string): Promise<void>;
  advanceOnboarding(accountId: string, to: 'paid' | 'payment_pending' | 'unpaid'): Promise<boolean>;
  accountEmail(accountId: string): Promise<string | null>;
  notifyPaid?(email: string, accountId?: string): Promise<void>;
  /**
   * Z draftu (dotazník vyplněný před platbou) vyřeší účet i původ jeho vytvoření.
   * Musí být idempotentní – Stripe stejnou událost klidně doručí víckrát.
   */
  accountFromDraft?(
    draftId: string,
    email: string | null,
    checkoutSessionId?: string | null
  ): Promise<{ accountId: string; createdForDraft: boolean } | null>;
  /** Pozvánka k nastavení hesla pro čerstvě založený účet. */
  notifyAccountReady?(email: string, accountId?: string): Promise<void>;
}

export type EventOutcome =
  | 'duplicate'
  | 'granted'
  | 'already_active'
  | 'duplicate_purchase_refunded'
  | 'duplicate_purchase_review'
  | 'pending'
  | 'failed_payment'
  | 'expired'
  | 'ignored'
  | 'missing_account'
  /** Platba dorazila, ale draft ani účet se k ní nepodařilo najít – nutný ruční zásah. */
  | 'draft_unresolved';

/**
 * Idempotentní zpracování jedné Stripe události.
 * Duplicitní doručení skončí hned na `recordEvent`, takže se nikdy nevytvoří druhý entitlement.
 */
export async function handleStripeEvent(event: StripeEventInput, store: BillingStore): Promise<EventOutcome> {
  const fresh = await store.recordEvent(event.id, event.type);
  if (!fresh) return 'duplicate';

  try {
    const outcome = await processEvent(event, store);
    await store.markEventDone(event.id, outcome);
    return outcome;
  } catch (error) {
    await store.markEventFailed?.(event.id);
    throw error;
  }
}

async function processEvent(event: StripeEventInput, store: BillingStore): Promise<EventOutcome> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (event.checkoutSessionId) await store.setCheckoutSessionStatus(event.checkoutSessionId, 'completed');

      // Odložené platby (bankovní převod) mají session dokončenou, ale platbu ještě ne.
      // U platby bez účtu nemáme koho posunout – účet vznikne až po doplacení.
      const settled =
        !event.paymentStatus ||
        event.paymentStatus === 'paid' ||
        event.paymentStatus === 'no_payment_required';
      if (!settled) {
        if (event.accountId) await store.advanceOnboarding(event.accountId, 'payment_pending');
        return 'pending';
      }

      // Účet buď existuje (starší flow), nebo teprve vzniká z draftu.
      let accountId = event.accountId ?? null;
      let freshAccount = false;
      if (!accountId && event.draftId && store.accountFromDraft) {
        const resolved = await store.accountFromDraft(
          event.draftId,
          event.customerEmail ?? null,
          event.checkoutSessionId
        );
        accountId = resolved?.accountId ?? null;
        freshAccount = resolved?.createdForDraft === true;
      }
      if (!accountId) return event.draftId ? 'draft_unresolved' : 'missing_account';

      const result = await store.grantEntitlement({
        accountId,
        checkoutSessionId: event.checkoutSessionId,
        customerId: event.customerId,
        paymentIntentId: event.paymentIntentId,
        priceId: event.priceId,
        purchasePolicyVersion: event.purchasePolicyVersion,
        paidAt: event.paidAt,
      });
      if (result === 'already_active' && store.resolveDuplicatePayment) {
        const duplicateOutcome = await store.resolveDuplicatePayment(accountId, event);
        if (duplicateOutcome !== 'already_active') return duplicateOutcome;
      }
      // Účet z draftu má dotazník vyplněný ještě před platbou, takže je rovnou dál než `paid`.
      if (!freshAccount) await store.advanceOnboarding(accountId, 'paid');

      if (result === 'created') {
        const email = (await store.accountEmail(accountId)) ?? event.customerEmail ?? null;
        // Nepovedený e-mail nesmí shodit webhook – Stripe by ho pak posílal znovu.
        if (email && freshAccount && store.notifyAccountReady) {
          await store.notifyAccountReady(email, accountId).catch(() => undefined);
        } else if (email && store.notifyPaid) {
          await store.notifyPaid(email, accountId).catch(() => undefined);
        }
      }
      return result === 'created' ? 'granted' : 'already_active';
    }

    case 'checkout.session.async_payment_failed': {
      if (event.checkoutSessionId)
        await store.setCheckoutSessionStatus(event.checkoutSessionId, 'payment_failed');
      if (event.accountId) await store.advanceOnboarding(event.accountId, 'unpaid');
      return 'failed_payment';
    }

    case 'checkout.session.expired': {
      if (event.checkoutSessionId) await store.setCheckoutSessionStatus(event.checkoutSessionId, 'expired');
      if (event.accountId) await store.advanceOnboarding(event.accountId, 'unpaid');
      return 'expired';
    }

    default:
      return 'ignored';
  }
}

// ---------- implementace nad MongoDB ----------

export const mongoBillingStore: BillingStore = {
  async recordEvent(eventId, type) {
    const db = await getDb();
    try {
      await db
        .collection(STRIPE_EVENTS)
        .insertOne({ eventId, type, status: 'processing', receivedAt: new Date() });
      return true;
    } catch (err: any) {
      if (err?.code === 11000) {
        const retry = await db
          .collection(STRIPE_EVENTS)
          .updateOne(
            {
              eventId,
              $or: [
                { status: 'failed' },
                { status: 'processing', receivedAt: { $lt: new Date(Date.now() - 5 * 60_000) } },
              ],
            },
            { $set: { status: 'processing', receivedAt: new Date() } }
          );
        return retry.modifiedCount === 1;
      }
      throw err;
    }
  },

  async markEventDone(eventId, outcome) {
    const db = await getDb();
    await db
      .collection(STRIPE_EVENTS)
      .updateOne({ eventId }, { $set: { status: 'processed', outcome, processedAt: new Date() } });
  },

  async markEventFailed(eventId) {
    const db = await getDb();
    await db
      .collection(STRIPE_EVENTS)
      .updateOne({ eventId, status: 'processing' }, { $set: { status: 'failed' } });
  },
  async resolveDuplicatePayment(accountId, event) {
    const { resolveDuplicatePayment } = await import('./duplicate-payment');
    return resolveDuplicatePayment(accountId, event);
  },

  async grantEntitlement(input) {
    const db = await getDb();
    const now = new Date();
    const result = await db.collection(ENTITLEMENTS).updateOne(
      { accountId: input.accountId },
      {
        $setOnInsert: {
          accountId: input.accountId,
          kind: 'purchase' as EntitlementKind,
          status: 'active' as EntitlementStatus,
          stripeCustomerId: input.customerId ?? null,
          stripeCheckoutSessionId: input.checkoutSessionId ?? null,
          stripePaymentIntentId: input.paymentIntentId ?? null,
          stripePriceId: input.priceId ?? null,
          ...purchaseEntitlementFields(input, now),
          createdAt: now,
        },
        $set: { updatedAt: now },
      },
      { upsert: true }
    );
    return result.upsertedCount === 1 ? 'created' : 'already_active';
  },

  async setCheckoutSessionStatus(sessionId, status) {
    const db = await getDb();
    await db
      .collection(CHECKOUT_SESSIONS)
      .updateOne({ sessionId }, { $set: { status, updatedAt: new Date() } });
  },

  async advanceOnboarding(accountId, to) {
    const { advance } = await import('./onboarding');
    return advance(accountId, to);
  },

  async accountEmail(accountId) {
    const db = await getDb();
    const doc = await db.collection(ACCOUNTS).findOne({ accountId }, { projection: { email: 1 } });
    return doc?.email ?? null;
  },

  async notifyPaid(email, accountId) {
    const { sendPaymentConfirmationEmail } = await import('./email');
    await sendPaymentConfirmationEmail(email, accountId);
  },

  async accountFromDraft(draftId, email, checkoutSessionId) {
    if (!email) return null;
    const { getDraft, claimDraft } = await import('./drafts');
    const { createAccountForPurchase } = await import('./accounts');

    const draft = await getDraft(draftId);
    if (!draft) return null;
    // Opakované doručení stejné platby – účet už z tohohle draftu vznikl.
    if (draft.accountId) {
      return { accountId: draft.accountId, createdForDraft: draft.autoSignInAccountId === draft.accountId };
    }

    const { account, created } = await createAccountForPurchase(email, {
      tenantId: draft.tenantId,
      slug: draft.slug,
    });

    // E-mail v Checkoutu může zadat kdokoliv. Existující účet smí dostat zakoupený
    // přístup, ale jeho workspace ani přihlašovací oprávnění takto měnit nesmíme.
    await claimDraft(draftId, account.accountId, { accountCreated: created, checkoutSessionId });
    // Při souběžných webhookách rozhoduje atomicky uložená vazba, ne lokální výsledek vytvoření účtu.
    const claimed = await getDraft(draftId);
    if (!claimed?.accountId) return null;
    return {
      accountId: claimed.accountId,
      createdForDraft: claimed.autoSignInAccountId === claimed.accountId,
    };
  },

  async notifyAccountReady(email) {
    const { findAccountByEmail } = await import('./accounts');
    const { issueToken } = await import('./tokens');
    const { sendAccountReadyEmail } = await import('./email');
    const account = await findAccountByEmail(email);
    if (!account) return;
    const token = await issueToken(account.accountId, 'set_password');
    await sendAccountReadyEmail(email, token, account.accountId);
  },
};

// ---------- čtení pro aplikaci ----------

export async function getEntitlement(accountId: string): Promise<Entitlement | null> {
  const db = await getDb();
  return (await db.collection(ENTITLEMENTS).findOne({ accountId })) as unknown as Entitlement | null;
}

/** Deadline fields are server-created when payment is confirmed, never on login. */
export function purchaseEntitlementFields(
  input: { paidAt?: Date | null; purchasePolicyVersion?: string | null },
  now: Date
): {
  paidAt: Date;
  purchasePolicyVersion?: string;
  accessUntil?: Date;
  refundUntil?: Date;
  exportUntil?: Date;
} {
  const supplied = input.paidAt ? new Date(input.paidAt) : null;
  const paidAt = supplied && Number.isFinite(supplied.getTime()) ? supplied : new Date(now);
  if (input.purchasePolicyVersion !== PURCHASE_POLICY_VERSION) return { paidAt };
  return { paidAt, purchasePolicyVersion: PURCHASE_POLICY_VERSION, ...purchaseDeadlines(paidAt) };
}

function hasFixedTerm(entitlement: Entitlement | null): boolean {
  return entitlement?.kind === 'purchase' && entitlement.purchasePolicyVersion === PURCHASE_POLICY_VERSION;
}

function deadline(value: Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function hasAccess(entitlement: Entitlement | null, now = new Date()): boolean {
  if (!entitlement || entitlement.status !== 'active') return false;
  // Do not retroactively shorten purchases, manual access, or legacy contracts.
  if (!hasFixedTerm(entitlement)) return true;
  const until = deadline(entitlement.accessUntil);
  return Boolean(until && now.getTime() < until.getTime());
}

function refundExportUntil(entitlement: Entitlement | null): Date | null {
  if (
    entitlement?.status !== 'revoked' ||
    entitlement.kind !== 'purchase' ||
    !['refund_pending', 'refunded'].includes(entitlement.revokedReason ?? '')
  )
    return null;
  const revokedAt = deadline(entitlement.revokedAt);
  return revokedAt ? new Date(revokedAt.getTime() + EXPORT_GRACE_DAYS * 24 * 60 * 60 * 1000) : null;
}

/** After the paid term only data export and the saved report remain for 30 days. */
export function canExport(entitlement: Entitlement | null, now = new Date()): boolean {
  if (hasAccess(entitlement, now)) return true;
  const refundedUntil = refundExportUntil(entitlement);
  if (refundedUntil)
    return (
      now.getTime() >= new Date(entitlement.revokedAt).getTime() && now.getTime() < refundedUntil.getTime()
    );
  if (!entitlement || entitlement.status !== 'active' || !hasFixedTerm(entitlement)) return false;
  const accessUntil = deadline(entitlement.accessUntil);
  const until = deadline(entitlement.exportUntil);
  return Boolean(
    accessUntil && until && now.getTime() >= accessUntil.getTime() && now.getTime() < until.getTime()
  );
}

/** DTO pro obrazovku s platbou – žádné syrové Stripe objekty. */
export function toBillingStatus(entitlement: Entitlement | null, now = new Date()) {
  const fixed = hasFixedTerm(entitlement);
  const accessUntil = fixed ? deadline(entitlement.accessUntil) : null;
  return {
    access: hasAccess(entitlement, now),
    kind: entitlement?.kind ?? null,
    paidAt: entitlement?.paidAt ?? null,
    customerRef: entitlement?.stripeCustomerId ?? null,
    purchasePolicyVersion: fixed ? entitlement.purchasePolicyVersion : null,
    accessUntil,
    refundUntil: fixed ? deadline(entitlement.refundUntil) : null,
    exportUntil: refundExportUntil(entitlement) ?? (fixed ? deadline(entitlement.exportUntil) : null),
    expired: Boolean(
      entitlement?.status === 'active' && accessUntil && now.getTime() >= accessUntil.getTime()
    ),
    exportAvailable: canExport(entitlement, now),
  };
}

/** Legacy zákazníci (ruční onboarding) – přístup bez platby. */
export async function grantLegacyEntitlement(accountId: string): Promise<'created' | 'already_active'> {
  const db = await getDb();
  const now = new Date();
  const result = await db.collection(ENTITLEMENTS).updateOne(
    { accountId },
    {
      $setOnInsert: {
        accountId,
        kind: 'legacy' as EntitlementKind,
        status: 'active' as EntitlementStatus,
        paidAt: null,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true }
  );
  return result.upsertedCount === 1 ? 'created' : 'already_active';
}
