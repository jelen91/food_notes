import { describe, expect, it } from 'vitest';
import { addCalendarMonths, PURCHASE_POLICY_VERSION, purchaseDeadlines } from '../lib/purchase-policy';
import { canExport, Entitlement, hasAccess, purchaseEntitlementFields, toBillingStatus } from '../lib/billing';
import { analysisEligibility } from '../lib/analysis/eligibility';

const paidAt = new Date('2024-02-29T11:15:42.321Z');
function purchased(): Entitlement {
  return {
    accountId: 'test', kind: 'purchase', status: 'active', createdAt: paidAt, updatedAt: paidAt,
    ...purchaseEntitlementFields({ paidAt, purchasePolicyVersion: PURCHASE_POLICY_VERSION }, paidAt),
  };
}

describe('versioned one-year purchase terms', () => {
  it('preserves payment time while clamping a leap day to February 28', () => {
    expect(purchaseDeadlines(paidAt)).toEqual({
      accessUntil: new Date('2025-02-28T11:15:42.321Z'),
      refundUntil: new Date('2024-03-03T11:15:42.321Z'),
      exportUntil: new Date('2025-03-30T11:15:42.321Z'),
    });
    expect(addCalendarMonths(new Date('2026-09-12T22:15:00Z'), 12).toISOString()).toBe('2027-09-12T22:15:00.000Z');
  });
  it('uses verified payment time, not delayed webhook delivery time', () => {
    const fields = purchaseEntitlementFields({ paidAt, purchasePolicyVersion: PURCHASE_POLICY_VERSION }, new Date('2024-03-15'));
    expect(fields.paidAt).toEqual(paidAt);
    expect(fields.accessUntil).toEqual(new Date('2025-02-28T11:15:42.321Z'));
  });
  it('does not retroactively impose deadlines on an unversioned purchase', () => {
    const legacy = { ...purchased(), purchasePolicyVersion: undefined };
    expect(hasAccess(legacy, new Date('2040-01-01'))).toBe(true);
    expect(canExport(legacy, new Date('2040-01-01'))).toBe(true);
    expect(toBillingStatus(legacy).accessUntil).toBeNull();
    expect(purchaseEntitlementFields({ paidAt }, new Date())).toEqual({ paidAt });
    for (const kind of ['legacy', 'manual'] as const) {
      expect(hasAccess({ ...purchased(), kind }, new Date('2040-01-01'))).toBe(true);
    }
  });
  it('expires exactly at the anniversary and offers export for only another 30 days', () => {
    const entitlement = purchased();
    const until = entitlement.accessUntil!.getTime();
    expect(hasAccess(entitlement, new Date(until - 1))).toBe(true);
    expect(hasAccess(entitlement, new Date(until))).toBe(false);
    expect(canExport(entitlement, new Date(until))).toBe(true);
    expect(canExport(entitlement, new Date(entitlement.exportUntil!.getTime() - 1))).toBe(true);
    expect(canExport(entitlement, entitlement.exportUntil!)).toBe(false);
    expect(toBillingStatus(entitlement, new Date(until))).toMatchObject({ access: false, expired: true, exportAvailable: true });
  });
  it('never grants access or grace export to revoked purchases', () => {
    const entitlement = { ...purchased(), status: 'revoked' as const };
    expect(hasAccess(entitlement, paidAt)).toBe(false);
    expect(canExport(entitlement, paidAt)).toBe(false);
    expect(canExport(entitlement, entitlement.accessUntil!)).toBe(false);
  });
  it('allows refunded owners a strictly bounded data-only export, never for unrelated revocations', () => {
    const revokedAt = new Date('2024-03-01T11:00:00Z');
    const exportUntil = new Date('2024-03-31T11:00:00Z');
    for (const revokedReason of ['refunded', 'refund_pending']) {
      const entitlement = { ...purchased(), status: 'revoked' as const, revokedReason, revokedAt };
      expect(hasAccess(entitlement, revokedAt)).toBe(false);
      expect(canExport(entitlement, new Date(revokedAt.getTime() - 1))).toBe(false);
      expect(canExport(entitlement, revokedAt)).toBe(true);
      expect(canExport(entitlement, new Date(exportUntil.getTime() - 1))).toBe(true);
      expect(canExport(entitlement, exportUntil)).toBe(false);
      expect(toBillingStatus(entitlement, revokedAt).exportUntil).toEqual(exportUntil);
    }
    expect(canExport({ ...purchased(), status: 'revoked', revokedReason: 'refunded' }, revokedAt)).toBe(false);
    expect(canExport({ ...purchased(), status: 'revoked', revokedReason: 'security', revokedAt }, revokedAt)).toBe(false);
  });
  it('fails closed if a versioned record has missing or malformed deadlines', () => {
    expect(hasAccess({ ...purchased(), accessUntil: null }, paidAt)).toBe(false);
    expect(hasAccess({ ...purchased(), accessUntil: new Date('invalid') }, paidAt)).toBe(false);
    expect(canExport({ ...purchased(), accessUntil: null, exportUntil: null }, paidAt)).toBe(false);
  });
  it('rejects analysis after expiry even when both 21-day conditions are satisfied', () => {
    const entitlement = purchased();
    const dates = Array.from({ length: 21 }, (_, i) => `2024-03-${String(i + 1).padStart(2, '0')}`);
    expect(analysisEligibility(entitlement, dates, new Date('2024-04-01')).eligible).toBe(true);
    const expired = analysisEligibility(entitlement, dates, entitlement.accessUntil!);
    expect(expired).toMatchObject({ eligible: false, hasPurchase: true, recordedDays: 21, remainingDays: 0 });
  });
});
