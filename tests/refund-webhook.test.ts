import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  entitlement: vi.fn(),
  find: vi.fn(),
  reconcile: vi.fn(),
  access: vi.fn(),
  payment: vi.fn(),
  list: vi.fn(),
}));
vi.mock('../lib/db', () => ({
  ENTITLEMENTS: 'entitlements',
  getDb: async () => ({ collection: () => ({ findOne: mocks.entitlement }) }),
}));
vi.mock('../lib/stripe', () => ({
  getStripe: () => ({ paymentIntents: { retrieve: mocks.payment }, refunds: { list: mocks.list } }),
}));
vi.mock('../lib/refunds/store', () => ({
  mongoRefundStore: { find: mocks.find, applyAccess: mocks.access },
}));
vi.mock('../lib/refunds/service', () => ({ reconcileSavedRefund: mocks.reconcile }));
import { reconcileRefundWebhook } from '../lib/refunds/webhook';
const event = (type = 'refund.updated', id = 'pi_a') =>
  ({ type, data: { object: { payment_intent: id } } }) as any;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.entitlement.mockResolvedValue({
    accountId: 'a',
    kind: 'purchase',
    stripePaymentIntentId: 'pi_a',
    stripeCheckoutSessionId: 'cs_a',
  });
  mocks.find.mockResolvedValue(null);
  mocks.reconcile.mockResolvedValue(undefined);
  mocks.payment.mockResolvedValue({ status: 'succeeded', amount_received: 94900, currency: 'czk' });
  mocks.list.mockResolvedValue({
    data: [{ payment_intent: 'pi_a', amount: 94900, currency: 'czk', status: 'succeeded' }],
    has_more: false,
  });
  mocks.access.mockResolvedValue(undefined);
});
describe('refund webhooks', () => {
  it('ignores unrelated events and unknown payment intents', async () => {
    expect(await reconcileRefundWebhook(event('checkout.session.completed'))).toBe(false);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    mocks.entitlement.mockResolvedValue(null);
    expect(await reconcileRefundWebhook(event())).toBe(true);
    expect(mocks.payment).not.toHaveBeenCalled();
  });
  it('reconciles a saved request from fresh provider state and propagates failures for Stripe retry', async () => {
    mocks.find.mockResolvedValue({ _id: 'pi_a', accountId: 'a' });
    await reconcileRefundWebhook(event());
    expect(mocks.reconcile).toHaveBeenCalledWith({ _id: 'pi_a', accountId: 'a' });
    expect(mocks.payment).not.toHaveBeenCalled();
    mocks.reconcile.mockRejectedValue(new Error('temporary provider failure'));
    await expect(reconcileRefundWebhook(event())).rejects.toThrow('temporary');
  });
  it('revokes a matching external full refund without creating another refund', async () => {
    await reconcileRefundWebhook(event('charge.refunded'));
    expect(mocks.entitlement).toHaveBeenCalledWith({ stripePaymentIntentId: 'pi_a' });
    expect(mocks.access).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'pi_a', accountId: 'a', status: 'succeeded' })
    );
  });
  it('supports multiple completed partial refunds only when their total covers the full payment', async () => {
    mocks.list.mockResolvedValue({
      data: [40000, 54900].map((amount) => ({
        amount,
        payment_intent: 'pi_a',
        currency: 'czk',
        status: 'succeeded',
      })),
      has_more: false,
    });
    await reconcileRefundWebhook(event());
    expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded' }));
  });
  it('does not turn an external partial refund into full access termination', async () => {
    mocks.list.mockResolvedValue({
      data: [{ amount: 10000, payment_intent: 'pi_a', currency: 'czk', status: 'succeeded' }],
      has_more: false,
    });
    await reconcileRefundWebhook(event());
    expect(mocks.access).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', failureCode: 'provider_failed' })
    );
  });
  it('uses current provider status so an old pending event cannot undo a completed refund', async () => {
    await reconcileRefundWebhook({
      type: 'refund.created',
      data: { object: { payment_intent: 'pi_a', status: 'pending' } },
    } as any);
    expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded' }));
  });
  it('keeps a pending full refund distinct from success', async () => {
    mocks.list.mockResolvedValue({
      data: [{ amount: 94900, payment_intent: 'pi_a', currency: 'czk', status: 'pending' }],
      has_more: false,
    });
    await reconcileRefundWebhook(event());
    expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });
});
