import { createHash } from 'crypto';
import type { StripeEventInput } from './billing';
import { CHECKOUT_SESSIONS, ENTITLEMENTS, getDb } from './db';
import { getStripe } from './stripe';

/** A second checkout must never silently charge for a renewal we do not offer. */
export async function resolveDuplicatePayment(
  accountId: string,
  event: StripeEventInput
): Promise<'already_active' | 'duplicate_purchase_refunded' | 'duplicate_purchase_review'> {
  const db = await getDb();
  const current = await db.collection(ENTITLEMENTS).findOne({ accountId });
  if (!current) throw new Error('entitlement_missing_after_grant');
  if (
    (event.checkoutSessionId && current.stripeCheckoutSessionId === event.checkoutSessionId) ||
    (event.paymentIntentId && current.stripePaymentIntentId === event.paymentIntentId)
  )
    return 'already_active';
  if (!event.paymentIntentId || !event.checkoutSessionId) return 'duplicate_purchase_review';
  const local = await db.collection(CHECKOUT_SESSIONS).findOne({ sessionId: event.checkoutSessionId });
  if (!local || !(local.accountId === accountId || (event.draftId && local.draftId === event.draftId)))
    return 'duplicate_purchase_review';
  const now = new Date();
  await db
    .collection(CHECKOUT_SESSIONS)
    .updateOne(
      { sessionId: event.checkoutSessionId, duplicateRefundRequestedAt: { $exists: false } },
      { $set: { duplicateRefundRequestedAt: now, duplicateRefundStatus: 'processing' } }
    );
  const saved = await db.collection(CHECKOUT_SESSIONS).findOne({ sessionId: event.checkoutSessionId });
  if (!saved) throw new Error('duplicate_checkout_missing_after_claim');
  const requestedAt = new Date(saved.duplicateRefundRequestedAt);
  const review = async () => {
    await db
      .collection(CHECKOUT_SESSIONS)
      .updateOne(
        { sessionId: event.checkoutSessionId },
        { $set: { duplicateRefundStatus: 'review_required' } }
      );
    return 'duplicate_purchase_review' as const;
  };
  // Do not send another financial request when the retry-window origin is corrupt.
  if (!Number.isFinite(requestedAt.getTime()) || requestedAt.getTime() > now.getTime()) return review();
  const stripe = getStripe();
  const options = { timeout: 8_000, maxNetworkRetries: 0 };
  const session = await stripe.checkout.sessions.retrieve(event.checkoutSessionId, {}, options);
  const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (
    session.id !== event.checkoutSessionId ||
    session.mode !== 'payment' ||
    pi !== event.paymentIntentId ||
    session.payment_status !== 'paid'
  )
    return review();
  const payment = await stripe.paymentIntents.retrieve(pi, {}, options);
  if (
    payment.id !== pi ||
    payment.status !== 'succeeded' ||
    !Number.isSafeInteger(payment.amount_received) ||
    payment.amount_received <= 0 ||
    payment.amount_received !== session.amount_total ||
    payment.currency !== session.currency
  )
    return review();
  const refunds = await stripe.refunds.list({ payment_intent: pi, limit: 100 }, options);
  const matchesPayment = (candidate: (typeof refunds.data)[number]) => {
    const refundPayment =
      typeof candidate.payment_intent === 'string' ? candidate.payment_intent : candidate.payment_intent?.id;
    return (
      refundPayment === pi &&
      candidate.amount === payment.amount_received &&
      candidate.currency === payment.currency
    );
  };
  let refund =
    !refunds.has_more && refunds.data.length === 1 && matchesPayment(refunds.data[0])
      ? refunds.data[0]
      : null;
  if (
    !refund &&
    (refunds.data.length || refunds.has_more || now.getTime() - requestedAt.getTime() >= 23 * 3600_000)
  ) {
    return review();
  }
  if (!refund)
    refund = await stripe.refunds.create(
      {
        payment_intent: pi,
        amount: payment.amount_received,
        reason: 'duplicate',
        metadata: { reason: 'duplicate_diary_purchase' },
      },
      { ...options, idempotencyKey: `duplicate-diary-${createHash('sha256').update(pi).digest('hex')}` }
    );
  if (!matchesPayment(refund)) return review();
  // requires_action needs someone to act; it must not look like a resolved refund.
  const accepted = ['pending', 'succeeded'].includes(refund.status ?? '');
  await db
    .collection(CHECKOUT_SESSIONS)
    .updateOne(
      { sessionId: event.checkoutSessionId },
      {
        $set: {
          duplicateRefundStatus: accepted ? refund.status : 'review_required',
          duplicateRefundId: refund.id,
        },
      }
    );
  // The original entitlement and report allowance remain untouched.
  return accepted ? 'duplicate_purchase_refunded' : 'duplicate_purchase_review';
}
