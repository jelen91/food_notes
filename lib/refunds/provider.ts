import type Stripe from 'stripe';
import { CHECKOUT_SESSIONS, DRAFTS, getDb } from '../db';
import { getStripe } from '../stripe';
import type { RefundRecord } from './store';

export interface PaymentProof {
  amount: number;
  currency: string;
}
export interface ProviderRefund {
  id: string;
  paymentIntentId: string | null;
  amount: number;
  currency: string;
  status: string | null;
  reference: string | null;
}
export interface RefundProvider {
  verify(record: RefundRecord): Promise<PaymentProof>;
  list(record: RefundRecord): Promise<ProviderRefund[]>;
  retrieve(id: string): Promise<ProviderRefund>;
  create(record: RefundRecord, proof: PaymentProof): Promise<ProviderRefund>;
}
const REQUEST_OPTIONS = { timeout: 8_000, maxNetworkRetries: 0 };
const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null);
const dto = (refund: Stripe.Refund): ProviderRefund => ({
  id: refund.id,
  paymentIntentId: idOf(refund.payment_intent),
  amount: refund.amount,
  currency: refund.currency,
  status: refund.status,
  reference: refund.metadata?.foodNotesRefund ?? null,
});
export class PaymentVerificationError extends Error {}

export const stripeRefundProvider: RefundProvider = {
  async verify(record) {
    const db = await getDb();
    // Read only ownership metadata, never questionnaire or health content.
    const checkout = await db
      .collection(CHECKOUT_SESSIONS)
      .findOne({ sessionId: record.checkoutSessionId }, { projection: { accountId: 1, draftId: 1 } });
    let owner = checkout?.accountId === record.accountId;
    if (!owner && checkout?.draftId)
      owner = Boolean(
        await db
          .collection(DRAFTS)
          .findOne({ draftId: checkout.draftId, accountId: record.accountId }, { projection: { _id: 1 } })
      );
    if (!owner) throw new PaymentVerificationError('payment_owner_mismatch');
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(record.checkoutSessionId, {}, REQUEST_OPTIONS);
    if (
      session.mode !== 'payment' ||
      session.payment_status !== 'paid' ||
      idOf(session.payment_intent) !== record._id ||
      (session.metadata?.accountId && session.metadata.accountId !== record.accountId) ||
      (session.metadata?.draftId && session.metadata.draftId !== checkout?.draftId)
    ) {
      throw new PaymentVerificationError('payment_session_mismatch');
    }
    const payment = await stripe.paymentIntents.retrieve(record._id, {}, REQUEST_OPTIONS);
    if (
      payment.status !== 'succeeded' ||
      !Number.isSafeInteger(payment.amount_received) ||
      payment.amount_received <= 0 ||
      payment.amount_received !== session.amount_total ||
      payment.currency !== session.currency
    ) {
      throw new PaymentVerificationError('payment_amount_mismatch');
    }
    return { amount: payment.amount_received, currency: payment.currency };
  },
  async list(record) {
    const refunds = await getStripe().refunds.list(
      { payment_intent: record._id, limit: 100 },
      REQUEST_OPTIONS
    );
    if (refunds.has_more) throw new PaymentVerificationError('too_many_refunds');
    return refunds.data.map(dto);
  },
  async retrieve(id) {
    return dto(await getStripe().refunds.retrieve(id, {}, REQUEST_OPTIONS));
  },
  async create(record, proof) {
    return dto(
      await getStripe().refunds.create(
        {
          payment_intent: record._id,
          amount: proof.amount,
          reason: 'requested_by_customer',
          metadata: { foodNotesRefund: record.reference, policyVersion: record.policyVersion },
        },
        { ...REQUEST_OPTIONS, idempotencyKey: `food-notes-refund-v1:${record.reference}` }
      )
    );
  },
};
