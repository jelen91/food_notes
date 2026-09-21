import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  account: { accountId: 'account_session', email: 'owner@example.test' } as any,
  origin: true,
  limit: true,
  requireAccount: vi.fn(),
  getEntitlement: vi.fn(),
  read: vi.fn(),
  guarantee: vi.fn(),
  withdrawal: vi.fn(),
}));
vi.mock('../lib/apiAuth', () => ({ requireAccount: mocks.requireAccount }));
vi.mock('../lib/billing', () => ({ getEntitlement: mocks.getEntitlement }));
vi.mock('../lib/rateLimit', () => ({
  requireSameOrigin: (_req: any, res: any) => {
    if (!mocks.origin) res.status(403).json({ error: 'origin' });
    return mocks.origin;
  },
  enforceRateLimit: async (_req: any, res: any) => {
    if (!mocks.limit) res.status(429).json({ error: 'limit' });
    return mocks.limit;
  },
}));
vi.mock('../lib/refunds/service', () => ({
  getRefundStatus: mocks.read,
  requestGuaranteeRefund: mocks.guarantee,
  receiveWithdrawal: mocks.withdrawal,
}));
import handler from '../pages/api/billing/refund';

async function request(method = 'GET', body: any = undefined, headers: Record<string, string> = {}) {
  const req = {
    method,
    body,
    query: { accountId: 'attacker_choice' },
    headers: { 'content-type': 'application/json', ...headers },
    cookies: {},
  } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;
  await handler(req, res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.origin = true;
  mocks.limit = true;
  mocks.requireAccount.mockImplementation(async (_req, res) => {
    if (!mocks.account) res.status(401).json({ error: 'auth' });
    return mocks.account;
  });
  mocks.account = { accountId: 'account_session', email: 'owner@example.test' };
  mocks.getEntitlement.mockResolvedValue({ accountId: 'account_session', kind: 'purchase' });
  mocks.read.mockResolvedValue({ status: 'available' });
  mocks.guarantee.mockResolvedValue({ status: 'pending' });
  mocks.withdrawal.mockResolvedValue({ status: 'withdrawal_requested' });
});

describe('refund endpoint security', () => {
  it('requires authentication before reading billing records', async () => {
    mocks.account = null;
    expect((await request()).status).toHaveBeenCalledWith(401);
    expect(mocks.getEntitlement).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('uses identity and payment solely from the signed account session', async () => {
    await request('POST', {
      operation: 'guarantee_refund',
      accountId: 'victim',
      paymentIntentId: 'pi_victim',
      amount: 999999,
      currency: 'usd',
    });
    expect(mocks.getEntitlement).toHaveBeenCalledWith('account_session');
    expect(mocks.guarantee).toHaveBeenCalledWith({
      accountId: 'account_session',
      email: 'owner@example.test',
      entitlement: { accountId: 'account_session', kind: 'purchase' },
    });
    expect(JSON.stringify(mocks.guarantee.mock.calls)).not.toContain('victim');
  });
  it('GET only reads the status and disables response caching', async () => {
    const res = await request();
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.guarantee).not.toHaveBeenCalled();
    expect(mocks.withdrawal).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
  it('rejects cross-origin mutations before touching account data', async () => {
    mocks.origin = false;
    expect((await request('POST', { operation: 'guarantee_refund' })).status).toHaveBeenCalledWith(403);
    expect(mocks.requireAccount).not.toHaveBeenCalled();
    expect(mocks.guarantee).not.toHaveBeenCalled();
  });
  it('rejects form submissions and rate-limited mutations', async () => {
    expect(
      (
        await request(
          'POST',
          { operation: 'guarantee_refund' },
          { 'content-type': 'application/x-www-form-urlencoded' }
        )
      ).status
    ).toHaveBeenCalledWith(415);
    mocks.limit = false;
    expect((await request('POST', { operation: 'guarantee_refund' })).status).toHaveBeenCalledWith(429);
    expect(mocks.guarantee).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation of the legal declaration', async () => {
    expect((await request('POST', { operation: 'withdrawal_request' })).status).toHaveBeenCalledWith(400);
    expect(mocks.withdrawal).not.toHaveBeenCalled();
    await request('POST', { operation: 'withdrawal_request', confirm: true });
    expect(mocks.withdrawal).toHaveBeenCalledTimes(1);
  });
  it('rejects unsupported methods and operations without a financial effect', async () => {
    expect((await request('DELETE')).status).toHaveBeenCalledWith(405);
    expect((await request('POST', { operation: 'refund_everything' })).status).toHaveBeenCalledWith(400);
    expect(mocks.guarantee).not.toHaveBeenCalled();
  });
  it('does not expose database or provider exceptions', async () => {
    mocks.guarantee.mockRejectedValue(new Error('provider secret customer_email=private@example.test'));
    const res = await request('POST', { operation: 'guarantee_refund' });
    expect(res.status).toHaveBeenCalledWith(503);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private@example.test');
  });
});
