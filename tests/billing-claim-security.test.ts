import { beforeEach, describe, expect, it, vi } from 'vitest';

// Veškeré úložiště i podpis session jsou nahrazené. Tento test nikdy nepotřebuje MongoDB ani Stripe.
const mocks = vi.hoisted(() => ({
  drafts: new Map<string, any>(),
  checkouts: new Map<string, any>(),
  entitlements: new Map<string, any>(),
  createAccountForPurchase: vi.fn(),
  findAccountById: vi.fn(),
  setWorkspace: vi.fn(),
  signAccountSession: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  ACCOUNTS: 'accounts',
  CHECKOUT_SESSIONS: 'checkouts',
  ENTITLEMENTS: 'entitlements',
  STRIPE_EVENTS: 'events',
  DRAFTS: 'drafts',
  QUESTIONNAIRES: 'questionnaires',
  TENANTS: 'tenants',
  TRACKERS: 'trackers',
  DAYS: 'days',
  getDb: async () => ({
    collection(name: string) {
      if (name === 'drafts') return {
        async findOne({ draftId }: { draftId: string }) {
          const value = mocks.drafts.get(draftId);
          return value ? { ...value } : null;
        },
        async updateOne(filter: any, update: any) {
          const value = mocks.drafts.get(filter.draftId);
          if (!value || value.accountId !== filter.accountId) return { modifiedCount: 0 };
          mocks.drafts.set(filter.draftId, { ...value, ...update.$set });
          return { modifiedCount: 1 };
        },
      };
      if (name === 'checkouts') return {
        async findOne({ sessionId }: { sessionId: string }) { return mocks.checkouts.get(sessionId) ?? null; },
      };
      if (name === 'entitlements') return {
        async findOne({ accountId }: { accountId: string }) { return mocks.entitlements.get(accountId) ?? null; },
      };
      throw new Error(`Neočekávaný přístup k úložišti: ${name}`);
    },
  }),
}));
vi.mock('../lib/accounts', () => ({
  createAccountForPurchase: mocks.createAccountForPurchase,
  findAccountById: mocks.findAccountById,
  setWorkspace: mocks.setWorkspace,
}));
vi.mock('../lib/store', () => ({ createTenantSecrets: vi.fn() }));
vi.mock('../lib/rateLimit', () => ({
  clientIp: () => 'test-ip',
  enforceRateLimit: async () => true,
  requireSameOrigin: () => true,
}));
vi.mock('../lib/session', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/session')>(),
  signAccountSession: mocks.signAccountSession,
}));

import { handleStripeEvent, mongoBillingStore, type BillingStore } from '../lib/billing';
import { claimDraft, type Draft } from '../lib/drafts';
import handler from '../pages/api/billing/claim';

const DRAFT_ID = '0123456789abcdef01234567';
const SESSION_ID = 'cs_purchase';
const ACCOUNT_ID = 'acc_customer';

function draft(patch: Partial<Draft> = {}): Draft {
  return {
    draftId: DRAFT_ID, tenantId: 'u_draft', slug: 'draftslug',
    accountId: null, submittedAt: new Date(), createdAt: new Date(), expiresAt: new Date(),
    ...patch,
  };
}

function account(patch: Record<string, unknown> = {}) {
  return {
    accountId: ACCOUNT_ID, email: 'customer@example.com', status: 'active',
    tenantId: 'u_draft', slug: 'draftslug', onboarding: 'questionnaire_completed', ...patch,
  };
}

function settledPurchase() {
  mocks.checkouts.set(SESSION_ID, { sessionId: SESSION_ID, draftId: DRAFT_ID, status: 'completed' });
  mocks.entitlements.set(ACCOUNT_ID, {
    accountId: ACCOUNT_ID, kind: 'purchase', status: 'active', stripeCheckoutSessionId: SESSION_ID,
  });
}

async function requestClaim(body: Record<string, unknown> = {}) {
  const req = {
    method: 'POST', cookies: { hj_draft: DRAFT_ID },
    body: { sessionId: SESSION_ID, ...body }, headers: {},
  } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;
  await handler(req, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.drafts.clear();
  mocks.checkouts.clear();
  mocks.entitlements.clear();
  mocks.drafts.set(DRAFT_ID, draft());
  mocks.findAccountById.mockResolvedValue(account());
  mocks.createAccountForPurchase.mockReset();
  mocks.signAccountSession.mockResolvedValue('signed-account-session');
});

describe('převzetí nákupu neověřuje vlastnictví existujícího e-mailu', () => {
  it('platící útočník s e-mailem oběti nedostane její session ani nezmění její workspace', async () => {
    const victim = account({ tenantId: 'u_victim', slug: 'victimslug', onboarding: 'tracker_ready' });
    mocks.createAccountForPurchase.mockResolvedValue({ account: victim, created: false });
    mocks.findAccountById.mockResolvedValue(victim);

    const resolved = await mongoBillingStore.accountFromDraft!(DRAFT_ID, victim.email, SESSION_ID);
    expect(resolved).toEqual({ accountId: ACCOUNT_ID, createdForDraft: false });
    expect(mocks.setWorkspace).not.toHaveBeenCalled();
    settledPurchase();

    // Podvržené klientské příznaky nesmí nahradit serverový důkaz.
    const res = await requestClaim({ autoSignInAccountId: ACCOUNT_ID, accountCreated: true });
    expect(res.json).toHaveBeenCalledWith({ requiresLogin: true, next: '/app/prihlaseni' });
    expect(mocks.signAccountSession).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(victim.email);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(victim.slug);
  });

  it('nový účet může získat session jen pro nákup a workspace, které ho vytvořily', async () => {
    mocks.createAccountForPurchase.mockResolvedValue({ account: account(), created: true });
    expect(await mongoBillingStore.accountFromDraft!(DRAFT_ID, 'customer@example.com', SESSION_ID))
      .toEqual({ accountId: ACCOUNT_ID, createdForDraft: true });
    settledPurchase();

    const res = await requestClaim();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, email: 'customer@example.com' }));
    expect(mocks.signAccountSession).toHaveBeenCalledWith(expect.any(String), {
      a: ACCOUNT_ID, t: 'u_draft', s: 'draftslug',
    });
    expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', [
      expect.stringContaining('hj_session=signed-account-session;'),
      expect.stringContaining('hj_draft=;'),
    ]);
  });

  it.each([
    ['starší draft bez důkazu', {}],
    ['výslovně existující účet', { autoSignInAccountId: null, claimedCheckoutSessionId: SESSION_ID }],
    ['jiný nově vytvořený účet', { autoSignInAccountId: 'acc_other', claimedCheckoutSessionId: SESSION_ID }],
    ['jiná platba stejného draftu', { autoSignInAccountId: ACCOUNT_ID, claimedCheckoutSessionId: 'cs_other' }],
  ])('%s vyžádá přihlášení', async (_label, proof) => {
    mocks.drafts.set(DRAFT_ID, draft({ accountId: ACCOUNT_ID, ...proof }));
    settledPurchase();
    const res = await requestClaim();
    expect(res.json).toHaveBeenCalledWith({ requiresLogin: true, next: '/app/prihlaseni' });
    expect(mocks.signAccountSession).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('ani správný draft nedává session k účtu, jehož workspace se změnil', async () => {
    await claimDraft(DRAFT_ID, ACCOUNT_ID, { accountCreated: true, checkoutSessionId: SESSION_ID });
    mocks.findAccountById.mockResolvedValue(account({ tenantId: 'u_different' }));
    settledPurchase();
    const res = await requestClaim();
    expect(res.json).toHaveBeenCalledWith({ requiresLogin: true, next: '/app/prihlaseni' });
    expect(mocks.signAccountSession).not.toHaveBeenCalled();
  });

  it('aktivní přístup pocházející z jiné platby nestačí', async () => {
    await claimDraft(DRAFT_ID, ACCOUNT_ID, { accountCreated: true, checkoutSessionId: SESSION_ID });
    settledPurchase();
    mocks.entitlements.get(ACCOUNT_ID).stripeCheckoutSessionId = 'cs_other';
    const res = await requestClaim();
    expect(res.json).toHaveBeenCalledWith({ requiresLogin: true, next: '/app/prihlaseni' });
    expect(mocks.signAccountSession).not.toHaveBeenCalled();
  });

  it('cizí Checkout Session se odmítne ještě před čtením účtu', async () => {
    settledPurchase();
    mocks.checkouts.get(SESSION_ID).draftId = 'anotherdraft0123456789';
    const res = await requestClaim();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.findAccountById).not.toHaveBeenCalled();
    expect(mocks.signAccountSession).not.toHaveBeenCalled();
  });

  it.each(['checkout', 'draft', 'entitlement'])('před potvrzením %s zůstává požadavek pending', async (missing) => {
    await claimDraft(DRAFT_ID, ACCOUNT_ID, { accountCreated: true, checkoutSessionId: SESSION_ID });
    settledPurchase();
    if (missing === 'checkout') mocks.checkouts.get(SESSION_ID).status = 'open';
    if (missing === 'draft') mocks.drafts.set(DRAFT_ID, draft());
    if (missing === 'entitlement') mocks.entitlements.clear();
    const res = await requestClaim();
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ pending: true });
    expect(mocks.signAccountSession).not.toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('smazaný účet nedostane session', async () => {
    await claimDraft(DRAFT_ID, ACCOUNT_ID, { accountCreated: true, checkoutSessionId: SESSION_ID });
    settledPurchase();
    mocks.findAccountById.mockResolvedValue(account({ status: 'deleted' }));
    const res = await requestClaim();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.signAccountSession).not.toHaveBeenCalled();
  });
});

describe('serverový důkaz vytvoření účtu', () => {
  it('opakovaný webhook nezvýší oprávnění draftu propojeného s existujícím účtem', async () => {
    await claimDraft(DRAFT_ID, ACCOUNT_ID, { accountCreated: false, checkoutSessionId: SESSION_ID });
    expect(await claimDraft(DRAFT_ID, ACCOUNT_ID, { accountCreated: true, checkoutSessionId: 'cs_other' })).toBe('already');
    expect(mocks.drafts.get(DRAFT_ID).autoSignInAccountId).toBeNull();
    expect(await mongoBillingStore.accountFromDraft!(DRAFT_ID, 'customer@example.com', SESSION_ID))
      .toEqual({ accountId: ACCOUNT_ID, createdForDraft: false });
    expect(mocks.createAccountForPurchase).not.toHaveBeenCalled();
  });

  it('bez identifikátoru platby se automatické přihlášení nepovolí', async () => {
    await claimDraft(DRAFT_ID, ACCOUNT_ID, { accountCreated: true });
    expect(mocks.drafts.get(DRAFT_ID).autoSignInAccountId).toBeNull();
  });

  it('souběžný webhook nemůže přepsat již propojený účet ani jeho oprávnění', async () => {
    mocks.createAccountForPurchase.mockImplementation(async () => {
      // Druhý webhook získal vazbu, zatímco první ještě zakládal účet.
      await claimDraft(DRAFT_ID, 'acc_winner', { accountCreated: false, checkoutSessionId: 'cs_winner' });
      return { account: account(), created: true };
    });
    expect(await mongoBillingStore.accountFromDraft!(DRAFT_ID, 'customer@example.com', SESSION_ID))
      .toEqual({ accountId: 'acc_winner', createdForDraft: false });
    expect(mocks.drafts.get(DRAFT_ID).autoSignInAccountId).toBeNull();
    expect(mocks.drafts.get(DRAFT_ID).claimedCheckoutSessionId).toBe('cs_winner');
  });

  it('existujícímu účtu se pošle potvrzení platby, nikoli pozvánka pro nově založený účet', async () => {
    mocks.createAccountForPurchase.mockResolvedValue({ account: account(), created: false });
    const notifyAccountReady = vi.fn().mockResolvedValue(undefined);
    const notifyPaid = vi.fn().mockResolvedValue(undefined);
    const advanceOnboarding = vi.fn().mockResolvedValue(true);
    const store: BillingStore = {
      recordEvent: async () => true, markEventDone: async () => {},
      setCheckoutSessionStatus: async () => {}, grantEntitlement: async () => 'created',
      accountEmail: async () => 'customer@example.com',
      accountFromDraft: mongoBillingStore.accountFromDraft,
      advanceOnboarding, notifyAccountReady, notifyPaid,
    };
    expect(await handleStripeEvent({
      id: 'evt_paid', type: 'checkout.session.completed', draftId: DRAFT_ID,
      checkoutSessionId: SESSION_ID, customerEmail: 'customer@example.com', paymentStatus: 'paid',
    }, store)).toBe('granted');
    expect(notifyPaid).toHaveBeenCalledWith('customer@example.com', ACCOUNT_ID);
    expect(notifyAccountReady).not.toHaveBeenCalled();
    expect(advanceOnboarding).toHaveBeenCalledWith(ACCOUNT_ID, 'paid');
  });
});
