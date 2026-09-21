import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  checkout: vi.fn(),
  draft: vi.fn(),
  session: vi.fn(),
  payment: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  retrieve: vi.fn(),
}));
vi.mock('../lib/db', () => ({
  CHECKOUT_SESSIONS: 'checkouts',
  DRAFTS: 'drafts',
  getDb: async () => ({
    collection: (name: string) => ({ findOne: name === 'checkouts' ? mocks.checkout : mocks.draft }),
  }),
}));
vi.mock('../lib/stripe', () => ({
  getStripe: () => ({
    checkout: { sessions: { retrieve: mocks.session } },
    paymentIntents: { retrieve: mocks.payment },
    refunds: { list: mocks.list, create: mocks.create, retrieve: mocks.retrieve },
  }),
}));
import { stripeRefundProvider } from '../lib/refunds/provider';
import type { RefundRecord } from '../lib/refunds/store';
const record: RefundRecord = {
  _id: 'pi_a',
  accountId: 'a',
  checkoutSessionId: 'cs_a',
  reference: 'VR-a',
  policyVersion: 'test',
  requestedAt: new Date(),
  updatedAt: new Date(),
  status: 'processing',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkout.mockResolvedValue({ accountId: 'a', draftId: null });
  mocks.draft.mockResolvedValue(null);
  mocks.session.mockResolvedValue({
    mode: 'payment',
    payment_status: 'paid',
    payment_intent: 'pi_a',
    amount_total: 94900,
    currency: 'czk',
    metadata: { accountId: 'a' },
  });
  mocks.payment.mockResolvedValue({ status: 'succeeded', amount_received: 94900, currency: 'czk' });
  mocks.list.mockResolvedValue({ data: [], has_more: false });
  mocks.create.mockResolvedValue({
    id: 're_a',
    payment_intent: 'pi_a',
    amount: 94900,
    currency: 'czk',
    status: 'succeeded',
    metadata: {},
  });
});
describe('Stripe refund payment verification', () => {
  it('cross-checks server checkout ownership and paid provider amount/currency', async () => {
    expect(await stripeRefundProvider.verify(record)).toEqual({ amount: 94900, currency: 'czk' });
    expect(mocks.checkout).toHaveBeenCalledWith(
      { sessionId: 'cs_a' },
      { projection: { accountId: 1, draftId: 1 } }
    );
    expect(mocks.session).toHaveBeenCalledWith('cs_a', {}, { timeout: 8000, maxNetworkRetries: 0 });
  });
  it('supports a server-linked draft purchase without reading questionnaire contents', async () => {
    mocks.checkout.mockResolvedValue({ accountId: null, draftId: 'draft_a' });
    mocks.draft.mockResolvedValue({ _id: 'draft' });
    mocks.session.mockResolvedValue({
      mode: 'payment',
      payment_status: 'paid',
      payment_intent: 'pi_a',
      amount_total: 94900,
      currency: 'czk',
      metadata: { draftId: 'draft_a' },
    });
    await stripeRefundProvider.verify(record);
    expect(mocks.draft).toHaveBeenCalledWith(
      { draftId: 'draft_a', accountId: 'a' },
      { projection: { _id: 1 } }
    );
  });
  it('rejects an unowned local checkout before any provider request', async () => {
    mocks.checkout.mockResolvedValue({ accountId: 'victim' });
    await expect(stripeRefundProvider.verify(record)).rejects.toThrow('owner');
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each([
    { payment_status: 'unpaid' },
    { payment_intent: 'pi_victim' },
    { metadata: { accountId: 'victim' } },
    { amount_total: 100 },
    { currency: 'usd' },
  ])('rejects inconsistent provider checkout data %j', async (patch) => {
    const current = await mocks.session();
    mocks.session.mockResolvedValue({ ...current, ...patch });
    await expect(stripeRefundProvider.verify(record)).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('never silently truncates a large refund history', async () => {
    mocks.list.mockResolvedValue({ data: [], has_more: true });
    await expect(stripeRefundProvider.list(record)).rejects.toThrow('too_many_refunds');
  });
  it('uses one immutable idempotency key and explicit full verified amount with no automatic network retries', async () => {
    await stripeRefundProvider.create(record, { amount: 94900, currency: 'czk' });
    await stripeRefundProvider.create(record, { amount: 94900, currency: 'czk' });
    expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
    expect(mocks.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_a',
        amount: 94900,
        reason: 'requested_by_customer',
        metadata: { foodNotesRefund: 'VR-a', policyVersion: 'test' },
      },
      { timeout: 8000, maxNetworkRetries: 0, idempotencyKey: 'food-notes-refund-v1:VR-a' }
    );
  });
});
