import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  account: vi.fn(),
  entitlement: vi.fn(),
  draft: vi.fn(),
  create: vi.fn(),
  insert: vi.fn(),
  advance: vi.fn(),
  origin: true,
  limit: true,
}));
vi.mock('../lib/session', () => ({ ACCOUNT_COOKIE: 'hj_session', verifyAccountSession: mocks.session }));
vi.mock('../lib/accounts', () => ({ findAccountById: mocks.account }));
vi.mock('../lib/billing', () => ({
  getEntitlement: mocks.entitlement,
  hasAccess: (entitlement: any) => entitlement?.status === 'active' && !entitlement.expired,
}));
vi.mock('../lib/drafts', () => ({
  DRAFT_COOKIE: 'hj_draft',
  draftIdFromCookie: (value: string) => value,
  getDraft: mocks.draft,
}));
vi.mock('../lib/stripe', () => ({ getStripe: () => ({ checkout: { sessions: { create: mocks.create } } }) }));
vi.mock('../lib/db', () => ({
  CHECKOUT_SESSIONS: 'checkouts',
  getDb: async () => ({ collection: () => ({ insertOne: mocks.insert }) }),
}));
vi.mock('../lib/onboarding', () => ({ advance: mocks.advance }));
vi.mock('../lib/rateLimit', () => ({
  clientIp: () => 'test-client',
  requireSameOrigin: (_req: any, res: any) => {
    if (!mocks.origin) res.status(403).json({ error: 'origin' });
    return mocks.origin;
  },
  enforceRateLimit: async (_req: any, res: any) => {
    if (!mocks.limit) res.status(429).json({ error: 'limit' });
    return mocks.limit;
  },
}));
import handler from '../pages/api/billing/checkout';
import { IMMEDIATE_SERVICE_REQUEST, PURCHASE_SUMMARY } from '../lib/purchase-consent';
import { PURCHASE_POLICY_VERSION } from '../lib/purchase-policy';

const NOW = new Date('2026-09-12T11:22:33.000Z');
const REQUIRED_LIVE = [
  'SELLER_NAME',
  'SELLER_ICO',
  'SELLER_ADDRESS',
  'SUPPORT_EMAIL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
];
const validConsent = () => ({
  purchasePolicyVersion: PURCHASE_POLICY_VERSION,
  acceptedTerms: true,
  requestImmediateService: true,
});
async function request(body: any = validConsent(), method = 'POST') {
  const req = {
    method,
    body,
    headers: { 'content-type': 'application/json' },
    cookies: { hj_session: 'session_cookie', hj_draft: 'draft_a' },
  } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;
  await handler(req, res);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.origin = true;
  mocks.limit = true;
  mocks.session.mockResolvedValue({ a: 'account_a' });
  mocks.account.mockResolvedValue({ accountId: 'account_a', email: 'owner@example.test', status: 'active' });
  mocks.entitlement.mockResolvedValue(null);
  mocks.draft.mockResolvedValue({ draftId: 'draft_a', submittedAt: NOW, accountId: null });
  mocks.create.mockResolvedValue({
    id: 'cs_new',
    url: 'https://checkout.example.test/new',
    amount_total: 94900,
    currency: 'czk',
  });
  mocks.insert.mockResolvedValue({ insertedId: 'cs_new' });
  mocks.advance.mockResolvedValue(true);
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_not_a_real_key');
  vi.stubEnv('STRIPE_PRICE_ID', 'price_test');
  vi.stubEnv('APP_URL', 'https://denik.example.test');
  vi.stubEnv('AUTH_SECRET', 'test_auth_secret');
  REQUIRED_LIVE.forEach((key) => vi.stubEnv(key, ''));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('purchase checkout consent and fixed-term contract', () => {
  it.each([
    undefined,
    {},
    { purchasePolicyVersion: PURCHASE_POLICY_VERSION },
    { ...validConsent(), purchasePolicyVersion: 'old-policy' },
    { ...validConsent(), acceptedTerms: false },
    { ...validConsent(), requestImmediateService: false },
    { ...validConsent(), acceptedTerms: 'true' },
    { ...validConsent(), requestImmediateService: 'true' },
  ])('does not create a Stripe session without both explicit current consents: %j', async (body) => {
    // Explicit undefined uses an empty body rather than the request helper's valid default.
    const res = await request(body ?? null);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('creates a current-policy checkout and stores the exact accepted terms snapshot', async () => {
    const res = await request({
      ...validConsent(),
      acceptedAt: '1990-01-01T00:00:00.000Z',
      accountId: 'victim',
      priceId: 'price_attacker',
      answers: { health: 'private' },
    });
    expect(res.json).toHaveBeenCalledWith({ url: 'https://checkout.example.test/new' });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        line_items: [{ price: 'price_test', quantity: 1 }],
        client_reference_id: 'account_a',
        customer_email: 'owner@example.test',
        metadata: {
          accountId: 'account_a',
          purchasePolicyVersion: PURCHASE_POLICY_VERSION,
          acceptedAt: NOW.toISOString(),
          priceId: 'price_test',
        },
        success_url: 'https://denik.example.test/app/platba/hotovo?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://denik.example.test/app/platba',
      })
    );
    expect(mocks.insert).toHaveBeenCalledWith({
      sessionId: 'cs_new',
      accountId: 'account_a',
      draftId: null,
      status: 'created',
      priceId: 'price_test',
      amountTotal: 94900,
      currency: 'czk',
      createdAt: NOW,
      purchaseConsent: {
        purchasePolicyVersion: PURCHASE_POLICY_VERSION,
        acceptedAt: NOW.toISOString(),
        acceptedTerms: true,
        requestImmediateService: true,
        termsText: PURCHASE_SUMMARY,
        immediateServiceText: IMMEDIATE_SERVICE_REQUEST,
      },
    });
    expect(mocks.advance).toHaveBeenCalledWith('account_a', 'checkout_started');
    expect(JSON.stringify(mocks.create.mock.calls)).not.toContain('private');
    expect(JSON.stringify(mocks.create.mock.calls)).not.toContain('victim');
  });
  it('communicates duration and guarantee without inventing paid dates before payment', async () => {
    await request();
    const input = mocks.create.mock.calls[0][0];
    expect(input.custom_text.submit.message).toContain('12 měsíců');
    expect(input.custom_text.submit.message).toContain('72 hodin');
    expect(input.metadata).not.toHaveProperty('paidAt');
    expect(input.metadata).not.toHaveProperty('accessUntil');
    expect(input.metadata).not.toHaveProperty('refundUntil');
    // Actual deadlines belong to the verified payment webhook, never to browser consent timestamps.
    expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty('paidAt');
  });
  it('binds an anonymous submitted questionnaire to its server-side draft', async () => {
    mocks.session.mockResolvedValue(null);
    await request({ ...validConsent(), draftId: 'victim' });
    expect(mocks.draft).toHaveBeenCalledWith('draft_a');
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: 'draft_a',
        metadata: {
          draftId: 'draft_a',
          purchasePolicyVersion: PURCHASE_POLICY_VERSION,
          acceptedAt: NOW.toISOString(),
          priceId: 'price_test',
        },
      })
    );
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('customer_email');
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: 'draft_a', accountId: null })
    );
    expect(mocks.advance).not.toHaveBeenCalled();
  });
  it.each([
    { kind: 'purchase', status: 'active' },
    { kind: 'purchase', status: 'revoked' },
    { kind: 'purchase', status: 'active', expired: true },
    { kind: 'legacy', status: 'active' },
  ])(
    'rejects an account with an existing entitlement, including expired or revoked: %j',
    async (entitlement) => {
      mocks.entitlement.mockResolvedValue(entitlement);
      const res = await request();
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ next: '/app/ucet' }));
      expect(mocks.create).not.toHaveBeenCalled();
    }
  );
  it('rejects an unfinished or already purchased draft before creating a checkout', async () => {
    mocks.session.mockResolvedValue(null);
    mocks.draft.mockResolvedValue({ draftId: 'draft_a', accountId: null, submittedAt: null });
    expect((await request()).status).toHaveBeenCalledWith(400);
    mocks.draft.mockResolvedValue({ draftId: 'draft_a', accountId: 'existing', submittedAt: NOW });
    expect((await request()).status).toHaveBeenCalledWith(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('live checkout readiness and request guards', () => {
  it.each(REQUIRED_LIVE)('blocks live checkout while %s is missing', async (missing) => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_not_a_real_key');
    REQUIRED_LIVE.forEach((key) => vi.stubEnv(key, key === missing ? '  ' : 'test-config-value'));
    expect((await request()).status).toHaveBeenCalledWith(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('permits a fully configured live-mode request without calling a real provider in the test', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_not_a_real_key');
    REQUIRED_LIVE.forEach((key) => vi.stubEnv(key, 'test-config-value'));
    await request();
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it.each(['sk_test_not_a_real_key', 'rk_test_not_a_real_key'])(
    'keeps test-mode checkout usable without fabricated seller data: %s',
    async (key) => {
      vi.stubEnv('STRIPE_SECRET_KEY', key);
      await request();
      expect(mocks.create).toHaveBeenCalledTimes(1);
    }
  );
  it('rejects unsupported methods, cross-origin requests and exhausted rate limits', async () => {
    expect((await request(validConsent(), 'GET')).status).toHaveBeenCalledWith(405);
    mocks.origin = false;
    expect((await request()).status).toHaveBeenCalledWith(403);
    mocks.origin = true;
    mocks.limit = false;
    expect((await request()).status).toHaveBeenCalledWith(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
