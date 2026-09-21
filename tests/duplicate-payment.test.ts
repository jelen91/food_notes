import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDuplicatePayment } from '../lib/duplicate-payment';
import { CHECKOUT_SESSIONS, ENTITLEMENTS, STRIPE_EVENTS } from '../lib/db';
import { mongoBillingStore, StripeEventInput } from '../lib/billing';

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), getStripe: vi.fn() }));
vi.mock('../lib/db', async (original) => ({ ...(await original<object>()), getDb: mocks.getDb }));
vi.mock('../lib/stripe', () => ({ getStripe: mocks.getStripe }));
const now = new Date('2026-09-12T10:00:00Z');
const event: StripeEventInput = {
  id: 'evt_duplicate',
  type: 'checkout.session.completed',
  accountId: 'acc_original',
  checkoutSessionId: 'cs_second',
  paymentIntentId: 'pi_second',
  paymentStatus: 'paid',
};
let entitlement: any;
let checkout: any;
let entitlementCollection: any;
let eventCollection: any;
let checkoutCollection: any;
let stripe: any;
const fullRefund = (status = 'succeeded') => ({
  id: 're_second',
  payment_intent: 'pi_second',
  amount: 94900,
  currency: 'czk',
  status,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  entitlement = {
    accountId: 'acc_original',
    stripeCheckoutSessionId: 'cs_original',
    stripePaymentIntentId: 'pi_original',
    status: 'revoked',
    paidAt: new Date('2025-01-01'),
  };
  checkout = { sessionId: 'cs_second', accountId: 'acc_original' };
  entitlementCollection = { findOne: vi.fn(async () => ({ ...entitlement })), updateOne: vi.fn() };
  checkoutCollection = {
    findOne: vi.fn(async () => (checkout ? { ...checkout } : null)),
    updateOne: vi.fn(async (filter, update) => {
      if (
        !checkout ||
        (filter.duplicateRefundRequestedAt && Object.hasOwn(checkout, 'duplicateRefundRequestedAt'))
      )
        return { modifiedCount: 0 };
      Object.assign(checkout, update.$set);
      return { modifiedCount: 1 };
    }),
  };
  eventCollection = { insertOne: vi.fn(), updateOne: vi.fn() };
  mocks.getDb.mockResolvedValue({
    collection: (name) =>
      name === ENTITLEMENTS
        ? entitlementCollection
        : name === CHECKOUT_SESSIONS
          ? checkoutCollection
          : name === STRIPE_EVENTS
            ? eventCollection
            : undefined,
  });
  stripe = {
    checkout: {
      sessions: {
        retrieve: vi.fn(async () => ({
          id: 'cs_second',
          mode: 'payment',
          payment_intent: 'pi_second',
          payment_status: 'paid',
          amount_total: 94900,
          currency: 'czk',
        })),
      },
    },
    paymentIntents: {
      retrieve: vi.fn(async () => ({
        id: 'pi_second',
        status: 'succeeded',
        amount_received: 94900,
        currency: 'czk',
      })),
    },
    refunds: {
      list: vi.fn(async () => ({ data: [], has_more: false })),
      create: vi.fn(async () => fullRefund()),
    },
  };
  mocks.getStripe.mockReturnValue(stripe);
});
afterEach(() => vi.useRealTimers());

describe('duplicate checkout payment backstop', () => {
  it('refunds only the second verified payment in full and preserves the original entitlement', async () => {
    expect(await resolveDuplicatePayment('acc_original', event)).toBe('duplicate_purchase_refunded');
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_second',
        amount: 94900,
        reason: 'duplicate',
        metadata: { reason: 'duplicate_diary_purchase' },
      },
      expect.objectContaining({
        maxNetworkRetries: 0,
        timeout: 8000,
        idempotencyKey: expect.stringMatching(/^duplicate-diary-[0-9a-f]{64}$/),
      })
    );
    expect(entitlementCollection.updateOne).not.toHaveBeenCalled();
    expect(checkout).toMatchObject({
      duplicateRefundStatus: 'succeeded',
      duplicateRefundId: 're_second',
      duplicateRefundRequestedAt: now,
    });
  });
  it('recognizes repeated events for the original session or payment without a financial call', async () => {
    for (const patch of [{ checkoutSessionId: 'cs_original' }, { paymentIntentId: 'pi_original' }]) {
      expect(await resolveDuplicatePayment('acc_original', { ...event, ...patch })).toBe('already_active');
    }
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });
  it('does not mistake two absent session identifiers for the original purchase', async () => {
    delete entitlement.stripeCheckoutSessionId;
    expect(
      await resolveDuplicatePayment('acc_original', {
        ...event,
        checkoutSessionId: undefined,
        paymentIntentId: undefined,
      })
    ).toBe('duplicate_purchase_review');
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });
  it('requires the stored second checkout to belong to the resolved account or the verified draft', async () => {
    checkout.accountId = 'acc_other';
    expect(await resolveDuplicatePayment('acc_original', event)).toBe('duplicate_purchase_review');
    expect(mocks.getStripe).not.toHaveBeenCalled();
    checkout = { sessionId: 'cs_second', draftId: 'draft_second' };
    expect(
      await resolveDuplicatePayment('acc_original', { ...event, accountId: null, draftId: 'draft_second' })
    ).toBe('duplicate_purchase_refunded');
  });
  it('verifies payment and checkout amounts and currency before refunding', async () => {
    stripe.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_second',
      status: 'succeeded',
      amount_received: 95000,
      currency: 'czk',
    });
    expect(await resolveDuplicatePayment('acc_original', event)).toBe('duplicate_purchase_review');
    expect(stripe.refunds.list).not.toHaveBeenCalled();
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('never refunds an unpaid session or a mismatched payment intent', async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_second',
      mode: 'payment',
      payment_intent: 'pi_other',
      payment_status: 'paid',
    });
    expect(await resolveDuplicatePayment('acc_original', event)).toBe('duplicate_purchase_review');
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
  it('reconciles an existing full pending or successful refund without creating another', async () => {
    for (const status of ['pending', 'succeeded']) {
      stripe.refunds.list.mockResolvedValue({ data: [fullRefund(status)], has_more: false });
      expect(await resolveDuplicatePayment('acc_original', event)).toBe('duplicate_purchase_refunded');
    }
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('requires review for partial, multiple, failed or action-required refunds', async () => {
    for (const data of [
      [{ ...fullRefund(), amount: 100 }],
      [fullRefund(), fullRefund()],
      [fullRefund('failed')],
      [fullRefund('requires_action')],
    ]) {
      stripe.refunds.list.mockResolvedValue({ data, has_more: false });
      expect(await resolveDuplicatePayment('acc_original', event)).toBe('duplicate_purchase_review');
    }
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('does not treat an incomplete refund-list page as proof of a full refund', async () => {
    stripe.refunds.list.mockResolvedValue({ data: [fullRefund()], has_more: true });
    expect(await resolveDuplicatePayment('acc_original', event)).toBe('duplicate_purchase_review');
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
  it('uses one stable idempotency key across concurrent requests', async () => {
    await Promise.all([
      resolveDuplicatePayment('acc_original', event),
      resolveDuplicatePayment('acc_original', event),
    ]);
    expect(stripe.refunds.create).toHaveBeenCalledTimes(2);
    expect(stripe.refunds.create.mock.calls[0][1].idempotencyKey).toBe(
      stripe.refunds.create.mock.calls[1][1].idempotencyKey
    );
    expect(checkout.duplicateRefundRequestedAt).toEqual(now);
  });
  it('allows safe retry after ambiguous network failure with the same key, but never after 23 hours', async () => {
    stripe.refunds.create.mockRejectedValueOnce(new Error('network_timeout'));
    await expect(resolveDuplicatePayment('acc_original', event)).rejects.toThrow('network_timeout');
    await resolveDuplicatePayment('acc_original', event);
    expect(stripe.refunds.create.mock.calls[0][1].idempotencyKey).toBe(
      stripe.refunds.create.mock.calls[1][1].idempotencyKey
    );
    vi.setSystemTime(new Date(now.getTime() + 23 * 3600000));
    expect(await resolveDuplicatePayment('acc_original', event)).toBe('duplicate_purchase_review');
    expect(stripe.refunds.create).toHaveBeenCalledTimes(2);
  });
  it('fails closed for a corrupted retry-window timestamp', async () => {
    checkout.duplicateRefundRequestedAt = 'invalid';
    expect(await resolveDuplicatePayment('acc_original', event)).toBe('duplicate_purchase_review');
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });
});

describe('webhook processing recovery claims', () => {
  it('inserts a fresh processing event exactly once', async () => {
    eventCollection.insertOne.mockResolvedValue({ acknowledged: true });
    expect(await mongoBillingStore.recordEvent('evt_1', 'checkout.session.completed')).toBe(true);
    expect(eventCollection.updateOne).not.toHaveBeenCalled();
  });
  it('reclaims failed or stale processing events but not completed or still-running events', async () => {
    eventCollection.insertOne.mockRejectedValue({ code: 11000 });
    eventCollection.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 0 });
    expect(await mongoBillingStore.recordEvent('evt_1', 'checkout.session.completed')).toBe(true);
    expect(await mongoBillingStore.recordEvent('evt_1', 'checkout.session.completed')).toBe(false);
    expect(eventCollection.updateOne.mock.calls[0][0]).toEqual({
      eventId: 'evt_1',
      $or: [
        { status: 'failed' },
        { status: 'processing', receivedAt: { $lt: new Date(now.getTime() - 5 * 60000) } },
      ],
    });
  });
  it('surfaces database failures instead of falsely acknowledging the webhook', async () => {
    eventCollection.insertOne.mockRejectedValue(new Error('database_unavailable'));
    await expect(mongoBillingStore.recordEvent('evt_1', 'checkout.session.completed')).rejects.toThrow(
      'database_unavailable'
    );
    expect(eventCollection.updateOne).not.toHaveBeenCalled();
  });
});
