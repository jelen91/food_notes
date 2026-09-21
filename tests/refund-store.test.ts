import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ entitlement: null as any }));
function matches(record: any, filter: any): boolean {
  return Object.entries(filter).every(([key, value]: [string, any]) => {
    if (key === '$or') return value.some((branch: any) => matches(record, branch));
    if (value && typeof value === 'object') {
      if ('$exists' in value) return (record[key] !== undefined) === value.$exists;
      if ('$in' in value) return value.$in.includes(record[key]);
      if ('$ne' in value) return record[key] !== value.$ne;
    }
    return record[key] === value;
  });
}
vi.mock('../lib/db', () => ({
  ENTITLEMENTS: 'entitlements',
  REFUND_REQUESTS: 'refunds',
  WITHDRAWAL_REQUESTS: 'withdrawals',
  getDb: async () => ({
    collection: () => ({
      async updateOne(filter: any, update: any) {
        if (!mocks.entitlement || !matches(mocks.entitlement, filter)) return { matchedCount: 0 };
        Object.assign(mocks.entitlement, update.$set ?? {});
        Object.keys(update.$unset ?? {}).forEach((key) => delete mocks.entitlement[key]);
        return { matchedCount: 1 };
      },
    }),
  }),
}));
import { mongoRefundStore, type RefundRecord } from '../lib/refunds/store';
const record = (patch: Partial<RefundRecord> = {}): RefundRecord => ({
  _id: 'pi_a',
  accountId: 'a',
  checkoutSessionId: 'cs_a',
  reference: 'VR-a',
  policyVersion: 'test',
  requestedAt: new Date(),
  updatedAt: new Date(),
  status: 'pending',
  ...patch,
});
beforeEach(() => {
  mocks.entitlement = { accountId: 'a', stripePaymentIntentId: 'pi_a', status: 'active' };
});
describe('refund access state transitions', () => {
  it('terminates only the matching payment, never a newer purchase', async () => {
    mocks.entitlement.stripePaymentIntentId = 'pi_new';
    await mongoRefundStore.applyAccess(record());
    expect(mocks.entitlement.status).toBe('active');
    expect(mocks.entitlement.revokedAt).toBeUndefined();
  });
  it('sets one stable revocation time across pending, success and duplicate delivery', async () => {
    await mongoRefundStore.applyAccess(record());
    const first = mocks.entitlement.revokedAt;
    expect(first).toBeInstanceOf(Date);
    expect(mocks.entitlement.revokedReason).toBe('refund_pending');
    await mongoRefundStore.applyAccess(record({ status: 'succeeded' }));
    expect(mocks.entitlement.revokedAt).toBe(first);
    expect(mocks.entitlement.revokedReason).toBe('refunded');
    await mongoRefundStore.applyAccess(record({ status: 'succeeded' }));
    expect(mocks.entitlement.revokedAt).toBe(first);
  });
  it('restores only access revoked for a pending refund that subsequently failed', async () => {
    await mongoRefundStore.applyAccess(record());
    await mongoRefundStore.applyAccess(record({ status: 'failed', failureCode: 'provider_failed' }));
    expect(mocks.entitlement.status).toBe('active');
    expect(mocks.entitlement.revokedAt).toBeUndefined();
    expect(mocks.entitlement.revokedReason).toBeUndefined();
  });
  it('a late pending observation cannot downgrade a completed refund and reopen access', async () => {
    await mongoRefundStore.applyAccess(record({ status: 'succeeded' }));
    await mongoRefundStore.applyAccess(record({ status: 'pending' }));
    await mongoRefundStore.applyAccess(record({ status: 'failed', failureCode: 'provider_failed' }));
    expect(mocks.entitlement.revokedReason).toBe('refunded');
    expect(mocks.entitlement.status).toBe('revoked');
  });
  it.each(['manual_revocation', 'refunded'])(
    'never restores a %s revocation on a failed request',
    async (revokedReason) => {
      mocks.entitlement.status = 'revoked';
      mocks.entitlement.revokedReason = revokedReason;
      await mongoRefundStore.applyAccess(record({ status: 'failed', failureCode: 'provider_failed' }));
      expect(mocks.entitlement.status).toBe('revoked');
      expect(mocks.entitlement.revokedReason).toBe(revokedReason);
    }
  );
  it('does not revoke access merely because an unconfirmed provider call timed out', async () => {
    await mongoRefundStore.applyAccess(record({ status: 'failed', failureCode: 'provider_unconfirmed' }));
    expect(mocks.entitlement.status).toBe('active');
  });
});
