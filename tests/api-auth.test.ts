import { describe, expect, it, vi } from 'vitest';
import { isValidEmail, normalizeEmail, passwordProblem, toPublicAccount } from '../lib/accounts';
import { sameOrigin } from '../lib/rateLimit';

describe('validace účtu', () => {
  it('e-mail se normalizuje', () => {
    expect(normalizeEmail('  Test@Example.COM ')).toBe('test@example.com');
  });

  it('nesmyslné e-maily neprojdou', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
    expect(isValidEmail('bez-zavinace')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });

  it('krátké heslo se odmítne', () => {
    expect(passwordProblem('kratke')).toBeTruthy();
    expect(passwordProblem('dostatecne-dlouhe-heslo')).toBeNull();
    expect(passwordProblem('x'.repeat(300))).toBeTruthy();
  });

  it('veřejná podoba účtu neobsahuje hash hesla ani interní pole', () => {
    const dto = toPublicAccount({
      accountId: 'acc_1',
      email: 'a@b.cz',
      passwordHash: 'scrypt$sul$hash',
      emailVerifiedAt: null,
      status: 'active',
      onboarding: 'unpaid',
      tenantId: 'u_1',
      slug: 'abcdefgh',
      createdAt: new Date(),
      updatedAt: new Date(),
      failedAttempts: 3,
      lockedUntil: null,
    });
    const serialized = JSON.stringify(dto);
    expect(serialized).not.toContain('scrypt');
    expect(serialized).not.toContain('failedAttempts');
    expect(serialized).not.toContain('u_1');
    expect(dto.email).toBe('a@b.cz');
  });
});

describe('ochrana proti cizímu původu požadavku', () => {
  const req = (origin?: string, host = 'app.example.com') =>
    ({ headers: { origin, host } } as any);

  it('stejný původ projde', () => {
    expect(sameOrigin(req('https://app.example.com'))).toBe(true);
  });

  it('cizí původ neprojde', () => {
    expect(sameOrigin(req('https://utocnik.example'))).toBe(false);
  });

  it('serverové volání bez hlavičky Origin projde', () => {
    expect(sameOrigin(req(undefined))).toBe(true);
  });
});

describe('autorizace API rout', () => {
  it('billing status bez session vrací 401 a nic neprozradí', async () => {
    vi.resetModules();
    const handler = (await import('../pages/api/billing/status')).default;
    const req = { method: 'GET', cookies: {}, query: {}, headers: {} } as any;
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json, setHeader: vi.fn() } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('acc_');
  });

  it('accountId poslaný prohlížečem autorizaci neobejde', async () => {
    vi.resetModules();
    const handler = (await import('../pages/api/billing/status')).default;
    // Podvržené ID v query i v těle – identita se bere výhradně z podepsané cookie.
    const req = {
      method: 'GET',
      cookies: {},
      query: { accountId: 'acc_obet' },
      body: { accountId: 'acc_obet' },
      headers: {},
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('checkout bez dotazníku i bez přihlášení nevytvoří platbu', async () => {
    vi.resetModules();
    const handler = (await import('../pages/api/billing/checkout')).default;
    const req = { method: 'POST', cookies: {}, query: {}, body: {}, headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;

    await handler(req, res);

    // Nová cesta začíná dotazníkem: bez draftu ani bez účtu není koho účtovat.
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ next: '/dotaznik' }));
  });

  it('vyzvednutí platby bez session ID a bez draftu selže', async () => {
    vi.resetModules();
    const handler = (await import('../pages/api/billing/claim')).default;
    const req = { method: 'POST', cookies: {}, query: {}, body: {}, headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;

    await handler(req, res);

    // Návrat ze Stripe sám o sobě nic neodemyká – chybí důkaz, že platba patří tomuhle prohlížeči.
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.setHeader).not.toHaveBeenCalledWith('Set-Cookie', expect.anything());
  });

  it('checkout odmítne jinou metodu než POST', async () => {
    vi.resetModules();
    const handler = (await import('../pages/api/billing/checkout')).default;
    const req = { method: 'GET', cookies: {}, query: {}, headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});

describe('Stripe webhook', () => {
  it('bez podpisu se nic nezpracuje', async () => {
    vi.resetModules();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const handler = (await import('../pages/api/stripe/webhook')).default;
    const req = { method: 'POST', headers: {}, cookies: {}, query: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('neplatný podpis se odmítne', async () => {
    vi.resetModules();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    const handler = (await import('../pages/api/stripe/webhook')).default;

    async function* body() {
      yield Buffer.from(JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }));
    }
    const req = Object.assign(body(), {
      method: 'POST',
      headers: { 'stripe-signature': 'podvrzeny-podpis' },
    }) as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() } as any;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid signature' });
  });
});
