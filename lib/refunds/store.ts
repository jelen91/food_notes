import { randomBytes } from 'crypto';
import { ENTITLEMENTS, REFUND_REQUESTS, WITHDRAWAL_REQUESTS, getDb } from '../db';
import type { WithdrawalReceipt } from './types';

export type StoredRefundStatus = 'processing' | 'pending' | 'succeeded' | 'failed' | 'review_required';
export interface RefundRecord {
  _id: string;
  accountId: string;
  checkoutSessionId: string;
  reference: string;
  policyVersion: string;
  requestedAt: Date;
  updatedAt: Date;
  status: StoredRefundStatus;
  leaseToken?: string;
  leaseUntil?: Date;
  providerRefundId?: string;
  amount?: number;
  currency?: string;
  failureCode?: string;
}
export interface WithdrawalRecord {
  _id: string;
  accountId: string;
  receipt: WithdrawalReceipt;
  createdAt: Date;
  updatedAt: Date;
}

export const REFUND_LEASE_MS = 120_000;
// Stripe may prune idempotency keys after 24 hours. Never recreate after this conservative limit.
export const REFUND_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export interface RefundStore {
  find(paymentIntentId: string, accountId: string): Promise<RefundRecord | null>;
  reserve(
    input: Omit<RefundRecord, 'reference' | 'updatedAt' | 'status'>,
    now: Date
  ): Promise<{
    record: RefundRecord | null;
    acquired: boolean;
    token?: string;
  }>;
  update(record: RefundRecord, fields: Partial<RefundRecord>, token?: string): Promise<RefundRecord>;
  applyAccess(record: RefundRecord): Promise<void>;
  findWithdrawal(checkoutSessionId: string, accountId: string): Promise<WithdrawalRecord | null>;
  receiveWithdrawal(
    checkoutSessionId: string,
    accountId: string,
    receipt: WithdrawalReceipt,
    now: Date
  ): Promise<WithdrawalRecord>;
  setWithdrawalEmail(
    record: WithdrawalRecord,
    status: WithdrawalReceipt['emailStatus'],
    now: Date
  ): Promise<WithdrawalRecord>;
}

function reference(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString('hex').toUpperCase()}`;
}

export const mongoRefundStore: RefundStore = {
  async find(paymentIntentId, accountId) {
    return (await (
      await getDb()
    )
      .collection<RefundRecord>(REFUND_REQUESTS)
      .findOne({ _id: paymentIntentId, accountId })) as RefundRecord | null;
  },
  async reserve(input, now) {
    const coll = (await getDb()).collection<RefundRecord>(REFUND_REQUESTS);
    const token = randomBytes(16).toString('hex');
    const fields = { leaseToken: token, leaseUntil: new Date(now.getTime() + REFUND_LEASE_MS) };
    try {
      const record: RefundRecord = {
        ...input,
        reference: reference('VR'),
        status: 'processing',
        updatedAt: now,
        ...fields,
      };
      await coll.insertOne(record);
      return { record, acquired: true, token };
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
    const existing = await coll.findOne({ _id: input._id, accountId: input.accountId });
    if (!existing) return { record: null, acquired: false };
    if (
      !['processing', 'failed'].includes(existing.status) ||
      existing.failureCode === 'provider_failed' ||
      now.getTime() - existing.requestedAt.getTime() >= REFUND_RETRY_WINDOW_MS
    ) {
      return { record: existing, acquired: false };
    }
    const record = await coll.findOneAndUpdate(
      {
        _id: input._id,
        accountId: input.accountId,
        status: { $in: ['processing', 'failed'] },
        $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }],
      },
      { $set: { ...fields, status: 'processing', updatedAt: now } },
      { returnDocument: 'after' }
    );
    return { record: record ?? existing, acquired: Boolean(record), ...(record ? { token } : {}) };
  },
  async update(record, fields, token) {
    const coll = (await getDb()).collection<RefundRecord>(REFUND_REQUESTS);
    const filter: any = { _id: record._id, accountId: record.accountId };
    if (token) filter.leaseToken = token;
    // A delayed GET or failed job cannot regress a confirmed successful refund.
    if (fields.status !== 'succeeded') filter.status = { $ne: 'succeeded' };
    const updated = await coll.findOneAndUpdate(filter, { $set: fields }, { returnDocument: 'after' });
    return updated ?? (await coll.findOne({ _id: record._id, accountId: record.accountId })) ?? record;
  },
  async applyAccess(record) {
    const coll = (await getDb()).collection(ENTITLEMENTS);
    const filter = { accountId: record.accountId, stripePaymentIntentId: record._id };
    if (record.status === 'pending' || record.status === 'succeeded') {
      // A refund for an older purchase can never revoke a different, newer entitlement.
      const reasons = record.status === 'succeeded' ? ['refund_pending', 'refunded'] : ['refund_pending'];
      await coll.updateOne(
        {
          ...filter,
          revokedAt: { $exists: false },
          $or: [{ status: 'active' }, { revokedReason: { $in: reasons } }],
        },
        { $set: { revokedAt: new Date() } }
      );
      await coll.updateOne(
        { ...filter, $or: [{ status: 'active' }, { revokedReason: { $in: reasons } }] },
        {
          $set: {
            status: 'revoked',
            revokedReason: record.status === 'succeeded' ? 'refunded' : 'refund_pending',
            updatedAt: new Date(),
          },
        }
      );
    } else if (record.status === 'failed' && record.failureCode === 'provider_failed') {
      await coll.updateOne(
        { ...filter, status: 'revoked', revokedReason: 'refund_pending' },
        { $set: { status: 'active', updatedAt: new Date() }, $unset: { revokedReason: '', revokedAt: '' } }
      );
    }
  },
  async findWithdrawal(checkoutSessionId, accountId) {
    return (await getDb())
      .collection<WithdrawalRecord>(WITHDRAWAL_REQUESTS)
      .findOne({ _id: checkoutSessionId, accountId });
  },
  async receiveWithdrawal(checkoutSessionId, accountId, receipt, now) {
    const coll = (await getDb()).collection<WithdrawalRecord>(WITHDRAWAL_REQUESTS);
    const record: WithdrawalRecord = {
      _id: checkoutSessionId,
      accountId,
      receipt: { ...receipt, reference: reference('OD') },
      createdAt: now,
      updatedAt: now,
    };
    try {
      await coll.insertOne(record);
      return record;
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
    const existing = await coll.findOne({ _id: checkoutSessionId, accountId });
    if (!existing) throw new Error('withdrawal_owner_mismatch');
    return existing;
  },
  async setWithdrawalEmail(record, status, now) {
    const coll = (await getDb()).collection<WithdrawalRecord>(WITHDRAWAL_REQUESTS);
    const updated = await coll.findOneAndUpdate(
      { _id: record._id, accountId: record.accountId, 'receipt.emailStatus': { $ne: 'sent' } },
      { $set: { 'receipt.emailStatus': status, updatedAt: now } },
      { returnDocument: 'after' }
    );
    return updated ?? (await coll.findOne({ _id: record._id, accountId: record.accountId })) ?? record;
  },
};
