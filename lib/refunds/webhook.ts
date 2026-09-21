import type Stripe from 'stripe';
import type { Entitlement } from '../billing';
import { ENTITLEMENTS, getDb } from '../db';
import { getStripe } from '../stripe';
import { reconcileSavedRefund } from './service';
import { mongoRefundStore, type RefundRecord } from './store';

export const REFUND_WEBHOOK_EVENTS = ['refund.created', 'refund.updated', 'refund.failed', 'charge.refunded'];
const OPTIONS = { timeout: 8_000, maxNetworkRetries: 0 };
const idOf = (value: unknown) =>
  typeof value === 'string' ? value : ((value as { id?: string })?.id ?? null);

/** Call only AFTER verifying the Stripe signature. This function never starts a refund. */
export async function reconcileRefundWebhook(event: Stripe.Event): Promise<boolean> {
  if (!REFUND_WEBHOOK_EVENTS.includes(event.type)) return false;
  const paymentIntentId = idOf((event.data.object as Stripe.Refund | Stripe.Charge).payment_intent);
  if (!paymentIntentId) return true;
  const db = await getDb();
  const entitlement = await db
    .collection<Entitlement>(ENTITLEMENTS)
    .findOne({ stripePaymentIntentId: paymentIntentId });
  if (!entitlement || entitlement.kind !== 'purchase') return true;
  const saved = await mongoRefundStore.find(paymentIntentId, entitlement.accountId);
  if (saved) {
    await reconcileSavedRefund(saved);
    return true;
  }

  // A refund can also be initiated by the operator in Stripe. Read current provider state,
  // rather than trusting event ordering, and revoke only if the WHOLE payment is refunded.
  const stripe = getStripe();
  const payment = await stripe.paymentIntents.retrieve(paymentIntentId, {}, OPTIONS);
  const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 }, OPTIONS);
  if (refunds.has_more) throw new Error('refund_reconciliation_requires_more_history');
  if (
    payment.status !== 'succeeded' ||
    !Number.isSafeInteger(payment.amount_received) ||
    payment.amount_received <= 0
  )
    return true;
  const matching = refunds.data.filter(
    (refund) => idOf(refund.payment_intent) === paymentIntentId && refund.currency === payment.currency
  );
  const succeeded = matching
    .filter((refund) => refund.status === 'succeeded')
    .reduce((total, refund) => total + refund.amount, 0);
  const pending = matching
    .filter((refund) => ['pending', 'requires_action'].includes(refund.status))
    .reduce((total, refund) => total + refund.amount, 0);
  const status =
    succeeded >= payment.amount_received
      ? 'succeeded'
      : succeeded + pending >= payment.amount_received
        ? 'pending'
        : 'failed';
  const now = new Date();
  const record: RefundRecord = {
    _id: paymentIntentId,
    accountId: entitlement.accountId,
    checkoutSessionId: entitlement.stripeCheckoutSessionId ?? '',
    reference: 'external',
    policyVersion: entitlement.purchasePolicyVersion ?? '',
    requestedAt: now,
    updatedAt: now,
    status,
    ...(status === 'failed' ? { failureCode: 'provider_failed' } : {}),
  };
  // applyAccess has a payment-intent filter and only restores a refund_pending revocation.
  // The synthetic record is not inserted into the customer's voluntary-guarantee ledger.
  await mongoRefundStore.applyAccess(record);
  return true;
}
