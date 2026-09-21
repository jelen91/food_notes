import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import tracker from '../pages/api/tracker';
import day from '../pages/api/tracker-day';
import exportDiary from '../pages/api/tracker-export';
import { purchaseEntitlementFields } from '../lib/billing';
import { PURCHASE_POLICY_VERSION } from '../lib/purchase-policy';

const mocks = vi.hoisted(() => ({
  requireAccount: vi.fn(), getEntitlement: vi.fn(), getTenantSecrets: vi.fn(),
  getActiveTracker: vi.fn(), listDays: vi.fn(), enforceRateLimit: vi.fn(),
}));
vi.mock('../lib/apiAuth', () => ({ requireAccount: mocks.requireAccount }));
vi.mock('../lib/billing', async (original) => ({ ...await original<object>(), getEntitlement: mocks.getEntitlement }));
vi.mock('../lib/store', async (original) => ({ ...await original<object>(), getTenantSecrets: mocks.getTenantSecrets, listDays: mocks.listDays }));
vi.mock('../lib/tracker/store', async (original) => ({ ...await original<object>(), getActiveTracker: mocks.getActiveTracker }));
vi.mock('../lib/rateLimit', async (original) => ({ ...await original<object>(), enforceRateLimit: mocks.enforceRateLimit }));

const paidAt = new Date('2026-09-12T09:00:00Z');
const entitlement = {
  accountId: 'term_test', kind: 'purchase', status: 'active', createdAt: paidAt, updatedAt: paidAt,
  ...purchaseEntitlementFields({ paidAt, purchasePolicyVersion: PURCHASE_POLICY_VERSION }, paidAt),
};

function response() {
  const res: any = { code: 200, body: undefined, setHeader: vi.fn() };
  res.status = vi.fn((code: number) => { res.code = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; return res; });
  res.send = vi.fn((body: unknown) => { res.body = body; return res; });
  return res;
}

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(entitlement.accessUntil!);
  mocks.requireAccount.mockResolvedValue({ accountId: 'term_test', tenantId: 'term_tenant' });
  mocks.getEntitlement.mockResolvedValue(entitlement);
  mocks.getTenantSecrets.mockResolvedValue({ dek: Buffer.alloc(32, 1) });
  mocks.enforceRateLimit.mockResolvedValue(true);
  mocks.getActiveTracker.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe('paid term enforced at diary API boundaries', () => {
  it.each([
    ['tracker read', tracker, 'GET'], ['tracker generation', tracker, 'POST'],
    ['day read', day, 'GET'], ['day write', day, 'POST'],
  ] as const)('denies %s at expiry before decrypting data', async (_name, handler, method) => {
    const res = response();
    await handler({ method, query: {}, body: {} } as any, res);
    expect(res.code).toBe(403);
    expect(res.body.next).toBe('/app/ucet');
    expect(mocks.getTenantSecrets).not.toHaveBeenCalled();
  });
  it('allows the dedicated export route during grace and denies it exactly 30 days later', async () => {
    const grace = response();
    await exportDiary({ method: 'GET', query: {} } as any, grace);
    expect(grace.code).toBe(409); // Export passes the access gate; this fixture has no tracker.
    expect(mocks.getTenantSecrets).toHaveBeenCalledWith('term_tenant');
    vi.setSystemTime(entitlement.exportUntil!);
    mocks.getTenantSecrets.mockClear();
    const after = response();
    await exportDiary({ method: 'GET', query: {} } as any, after);
    expect(after.code).toBe(403);
    expect(mocks.getTenantSecrets).not.toHaveBeenCalled();
  });
});
