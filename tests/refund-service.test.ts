import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entitlement } from '../lib/billing';
import { PURCHASE_POLICY_VERSION } from '../lib/purchase-policy';
import { PaymentVerificationError, type ProviderRefund, type RefundProvider } from '../lib/refunds/provider';
import { getRefundStatus, receiveWithdrawal, requestGuaranteeRefund } from '../lib/refunds/service';
import {
  REFUND_LEASE_MS,
  REFUND_RETRY_WINDOW_MS,
  type RefundRecord,
  type RefundStore,
  type WithdrawalRecord,
} from '../lib/refunds/store';
import { WITHDRAWAL_STATEMENT, type WithdrawalReceipt } from '../lib/refunds/types';
import { withdrawalReceiptText } from '../lib/refunds/email';

// All payment calls and storage are in memory. These tests cannot contact Stripe or MongoDB.
const PAID = new Date('2026-09-12T10:00:00.000Z');
let now: Date;
let rows: Map<string, RefundRecord>;
let withdrawals: Map<string, WithdrawalRecord>;
let entitlement: Entitlement;
let provider: RefundProvider;
let store: RefundStore;
let sendReceipt: ReturnType<typeof vi.fn>;
const context = () => ({ accountId: 'account_a', email: 'a@example.test', entitlement });
const deps = () => ({ store, provider, now: () => new Date(now), sendReceipt });
const providerResult = (patch: Partial<ProviderRefund> = {}): ProviderRefund => ({
  id: 're_a',
  paymentIntentId: 'pi_a',
  amount: 94900,
  currency: 'czk',
  status: 'succeeded',
  reference: 'VR-test',
  ...patch,
});

beforeEach(() => {
  now = new Date(PAID.getTime() + 3600000);
  rows = new Map();
  withdrawals = new Map();
  entitlement = {
    accountId: 'account_a',
    kind: 'purchase',
    status: 'active',
    paidAt: PAID,
    stripeCheckoutSessionId: 'cs_a',
    stripePaymentIntentId: 'pi_a',
    purchasePolicyVersion: PURCHASE_POLICY_VERSION,
    createdAt: PAID,
    updatedAt: PAID,
  };
  provider = {
    verify: vi.fn().mockResolvedValue({ amount: 94900, currency: 'czk' }),
    list: vi.fn().mockResolvedValue([]),
    retrieve: vi.fn().mockResolvedValue(providerResult()),
    create: vi.fn().mockResolvedValue(providerResult()),
  };
  sendReceipt = vi.fn().mockResolvedValue('unavailable');
  store = {
    async find(id, accountId) {
      const row = rows.get(id);
      return row?.accountId === accountId ? { ...row } : null;
    },
    async reserve(input, at) {
      let row = rows.get(input._id);
      if (
        row &&
        (row.accountId !== input.accountId ||
          !['processing', 'failed'].includes(row.status) ||
          row.failureCode === 'provider_failed' ||
          at.getTime() - row.requestedAt.getTime() >= REFUND_RETRY_WINDOW_MS ||
          (row.leaseUntil && row.leaseUntil > at))
      )
        return { record: row.accountId === input.accountId ? { ...row } : null, acquired: false };
      const token = `token-${at.getTime()}`;
      row = {
        ...(row ?? { ...input, reference: 'VR-test' }),
        status: 'processing',
        updatedAt: at,
        leaseToken: token,
        leaseUntil: new Date(at.getTime() + REFUND_LEASE_MS),
      };
      rows.set(row._id, row);
      return { record: { ...row }, acquired: true, token };
    },
    async update(record, fields, token) {
      const row = rows.get(record._id);
      if (
        !row ||
        (token && row.leaseToken !== token) ||
        (fields.status !== 'succeeded' && row.status === 'succeeded')
      )
        return row ? { ...row } : record;
      rows.set(record._id, { ...row, ...fields });
      return { ...rows.get(record._id) };
    },
    applyAccess: vi.fn().mockResolvedValue(undefined),
    async findWithdrawal(id, accountId) {
      const row = withdrawals.get(id);
      return row?.accountId === accountId ? row : null;
    },
    async receiveWithdrawal(id, accountId, receipt, at) {
      if (!withdrawals.has(id))
        withdrawals.set(id, {
          _id: id,
          accountId,
          receipt: { ...receipt, reference: 'OD-test' },
          createdAt: at,
          updatedAt: at,
        });
      return withdrawals.get(id);
    },
    async setWithdrawalEmail(record, emailStatus, at) {
      const updated = { ...record, receipt: { ...record.receipt, emailStatus }, updatedAt: at };
      withdrawals.set(record._id, updated);
      return updated;
    },
  };
});

describe('three-day voluntary guarantee and statutory withdrawal are separate', () => {
  it('opens exactly 72 hours after a paid purchase and does not shorten an older contract', async () => {
    expect((await getRefundStatus(context(), deps())).guarantee).toEqual({
      eligible: true,
      endsAt: '2026-09-15T10:00:00.000Z',
      hours: 72,
    });
    now = new Date('2026-09-15T09:59:59.999Z');
    expect((await getRefundStatus(context(), deps())).guarantee.eligible).toBe(true);
    now = new Date('2026-09-15T10:00:00.000Z');
    const expired = await getRefundStatus(context(), deps());
    expect(expired.guarantee.eligible).toBe(false);
    expect(expired.canRequestWithdrawal).toBe(true);
    expect(expired.statutoryNotice).toContain('Neomezuje');
    entitlement.purchasePolicyVersion = undefined;
    now = new Date(PAID.getTime() + 1000);
    const old = await getRefundStatus(context(), deps());
    expect(old.guarantee.eligible).toBe(false);
    expect(old.canRequestWithdrawal).toBe(true);
  });
  it.each(['legacy', 'manual'] as const)('does not automatically refund a %s entitlement', async (kind) => {
    entitlement.kind = kind;
    const result = await requestGuaranteeRefund(context(), deps());
    expect(result.status).toBe('unavailable');
    expect(provider.create).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
  });
  it('does not refund a future, unpaid or revoked entitlement', async () => {
    entitlement.paidAt = new Date(now.getTime() + 1000);
    expect((await requestGuaranteeRefund(context(), deps())).guarantee.eligible).toBe(false);
    entitlement.paidAt = PAID;
    entitlement.status = 'revoked';
    expect((await requestGuaranteeRefund(context(), deps())).guarantee.eligible).toBe(false);
    expect(provider.create).not.toHaveBeenCalled();
  });
  it('accepts a legal withdrawal beyond the voluntary deadline and preserves the declaration', async () => {
    now = new Date('2026-09-20T12:00:00.000Z');
    const result = await receiveWithdrawal(context(), deps());
    expect(result.status).toBe('withdrawal_requested');
    expect(result.canRequestWithdrawal).toBe(false);
    expect(result.withdrawalReceipt).toMatchObject({
      acceptedAt: now.toISOString(),
      statement: WITHDRAWAL_STATEMENT,
      emailStatus: 'unavailable',
    });
    expect(result.message).toContain('bylo přijato');
    expect(result.message).toContain('neznamená');
    expect(provider.create).not.toHaveBeenCalled();
    expect(withdrawalReceiptText(result.withdrawalReceipt)).toContain(WITHDRAWAL_STATEMENT);
  });
  it('does not retract acceptance on mail failure or alter the original receipt on retry', async () => {
    sendReceipt.mockRejectedValue(new Error('mail unavailable'));
    const first = await receiveWithdrawal(context(), deps());
    expect(first.withdrawalReceipt.emailStatus).toBe('failed');
    now = new Date(now.getTime() + 3600000);
    sendReceipt.mockResolvedValue('sent');
    const second = await receiveWithdrawal(context(), deps());
    expect(second.withdrawalReceipt.acceptedAt).toBe(first.withdrawalReceipt.acceptedAt);
    expect(second.withdrawalReceipt.reference).toBe(first.withdrawalReceipt.reference);
    expect(second.withdrawalReceipt.emailStatus).toBe('sent');
    await receiveWithdrawal(context(), deps());
    expect(sendReceipt).toHaveBeenCalledTimes(2);
    expect(withdrawals.size).toBe(1);
  });
});

describe('financial side effects and recovery', () => {
  it('GET never creates a refund or reserves a request', async () => {
    expect((await getRefundStatus(context(), deps())).status).toBe('available');
    expect(rows.size).toBe(0);
    expect(provider.create).not.toHaveBeenCalled();
    expect(provider.verify).not.toHaveBeenCalled();
  });
  it('refunds the verified actual payment once, not a client-supplied or advertised amount', async () => {
    vi.mocked(provider.verify).mockResolvedValue({ amount: 12345, currency: 'eur' });
    vi.mocked(provider.create).mockResolvedValue(providerResult({ amount: 12345, currency: 'eur' }));
    const result = await requestGuaranteeRefund(context(), deps());
    expect(result.status).toBe('succeeded');
    expect(provider.create).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'account_a', _id: 'pi_a' }),
      { amount: 12345, currency: 'eur' }
    );
    await requestGuaranteeRefund(context(), deps());
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('pi_a');
    expect(JSON.stringify(result)).not.toContain('cs_a');
  });
  it('reserves atomically so parallel clicks cannot issue two financial operations', async () => {
    let release: () => void;
    vi.mocked(provider.verify).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ amount: 94900, currency: 'czk' });
        })
    );
    const first = requestGuaranteeRefund(context(), deps());
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect((await requestGuaranteeRefund(context(), deps())).status).toBe('processing');
    release();
    await first;
    expect(provider.create).toHaveBeenCalledTimes(1);
  });
  it('records a timely request before contacting the provider and keeps its deadline on outage', async () => {
    now = new Date('2026-09-15T09:59:59.999Z');
    const requestedAt = new Date(now);
    vi.mocked(provider.verify).mockImplementation(async () => {
      expect(rows.get('pi_a').requestedAt).toEqual(requestedAt);
      now = new Date('2026-09-15T10:00:10.000Z');
      throw new Error('provider timeout');
    });
    const first = await requestGuaranteeRefund(context(), deps());
    expect(first.status).toBe('failed');
    expect(first.retryable).toBe(true);
    vi.mocked(provider.verify).mockResolvedValue({ amount: 94900, currency: 'czk' });
    const second = await requestGuaranteeRefund(context(), deps());
    expect(second.status).toBe('succeeded');
    expect(rows.get('pi_a').requestedAt).toEqual(requestedAt);
  });
  it('recovers a lost create response by reading the existing provider refund', async () => {
    vi.mocked(provider.create).mockRejectedValue(new Error('connection lost after create'));
    expect((await requestGuaranteeRefund(context(), deps())).status).toBe('failed');
    vi.mocked(provider.list).mockResolvedValue([providerResult()]);
    expect((await getRefundStatus(context(), deps())).status).toBe('succeeded');
    expect(provider.create).toHaveBeenCalledTimes(1);
    expect(store.applyAccess).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded' }));
  });
  it('does not create again after the provider idempotency retention window', async () => {
    vi.mocked(provider.create).mockRejectedValue(new Error('timeout'));
    await requestGuaranteeRefund(context(), deps());
    now = new Date(now.getTime() + REFUND_RETRY_WINDOW_MS);
    expect((await requestGuaranteeRefund(context(), deps())).status).toBe('review_required');
    expect(provider.create).toHaveBeenCalledTimes(1);
    // A later reconciliation may still discover success; only reads are allowed then.
    vi.mocked(provider.list).mockResolvedValue([providerResult()]);
    expect((await getRefundStatus(context(), deps())).status).toBe('succeeded');
  });
  it('does not refund when ownership verification fails', async () => {
    vi.mocked(provider.verify).mockRejectedValue(new PaymentVerificationError('different owner'));
    expect((await requestGuaranteeRefund(context(), deps())).status).toBe('review_required');
    expect(provider.create).not.toHaveBeenCalled();
    expect(store.applyAccess).not.toHaveBeenCalled();
  });
  it('recognizes an existing full manual refund and does not create another', async () => {
    vi.mocked(provider.list).mockResolvedValue([providerResult({ reference: null })]);
    expect((await requestGuaranteeRefund(context(), deps())).status).toBe('succeeded');
    expect(provider.create).not.toHaveBeenCalled();
  });
  it('requires reconciliation for an existing partial refund', async () => {
    vi.mocked(provider.list).mockResolvedValue([providerResult({ reference: null, amount: 10000 })]);
    expect((await requestGuaranteeRefund(context(), deps())).status).toBe('review_required');
    expect(provider.create).not.toHaveBeenCalled();
  });
  it.each([{ paymentIntentId: 'pi_other' }, { amount: 100 }, { currency: 'usd' }])(
    'rejects a mismatched provider result %j',
    async (patch) => {
      vi.mocked(provider.create).mockResolvedValue(providerResult(patch));
      expect((await requestGuaranteeRefund(context(), deps())).status).toBe('review_required');
      expect(store.applyAccess).not.toHaveBeenCalled();
    }
  );
  it('does not describe pending as money received and reconciles eventual provider failure', async () => {
    vi.mocked(provider.create).mockResolvedValue(providerResult({ status: 'pending' }));
    const pending = await requestGuaranteeRefund(context(), deps());
    expect(pending.status).toBe('pending');
    expect(pending.message).toContain('nemusí být ještě připsané');
    vi.mocked(provider.retrieve).mockResolvedValue(providerResult({ status: 'failed' }));
    const failed = await getRefundStatus(context(), deps());
    expect(failed.status).toBe('failed');
    expect(failed.retryable).toBe(false);
    expect(store.applyAccess).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed', failureCode: 'provider_failed' })
    );
    await requestGuaranteeRefund(context(), deps());
    expect(provider.create).toHaveBeenCalledTimes(1);
  });
  it('does not reveal or mutate another account refund ledger', async () => {
    await requestGuaranteeRefund(context(), deps());
    const other = { ...context(), accountId: 'account_other' };
    const result = await requestGuaranteeRefund(other, deps());
    expect(result.requestedAt).toBeUndefined();
    expect(provider.create).toHaveBeenCalledTimes(1);
  });
});
