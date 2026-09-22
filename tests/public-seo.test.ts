import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GetServerSidePropsContext } from 'next';
import { NextRequest } from 'next/server';
import { getServerSideProps as sitemap } from '../pages/sitemap.xml';
import { getServerSideProps as robots } from '../pages/robots.txt';
import { landingProps } from '../lib/landing-server';
import { LANDING_PAGES } from '../lib/landing-pages';
import { getLandingPath, LANDING_ROUTES } from '../lib/landing-routes';
import { BRAND } from '../lib/brand';
import { middleware } from '../middleware';
import nextConfig from '../next.config';

vi.mock('../lib/session', () => ({
  ACCOUNT_COOKIE: 'hj_account',
  verifyAccountSession: vi.fn(async () => null),
  cookieName: vi.fn((slug: string) => `hj_${slug}`),
  verifySession: vi.fn(async () => null),
}));
vi.mock('../lib/drafts', () => ({
  DRAFT_COOKIE: 'hj_draft',
  draftIdFromCookie: vi.fn(() => null),
  getDraft: vi.fn(async () => null),
}));
vi.mock('../lib/offer', () => ({ getPublicOffer: vi.fn(async () => ({ available: false })) }));

afterEach(() => vi.unstubAllEnvs());

function context() {
  return {
    req: { cookies: { hj_account: 'private-cookie' }, headers: { host: 'preview.example.test' } },
    res: { setHeader: vi.fn(), end: vi.fn() },
    query: { email: 'private@example.test', tema: 'private-questionnaire-value' },
  };
}

describe('public discovery and private application routes', () => {
  it('lists only public marketing pages on the brand domain, regardless of request and runtime origin', async () => {
    vi.stubEnv('APP_URL', 'https://preview.example.test');
    const ctx = context();
    await sitemap(ctx as unknown as GetServerSidePropsContext);
    const xml = String(ctx.res.end.mock.calls[0][0]);
    const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => new URL(match[1]));
    expect(urls.length).toBe(LANDING_PAGES.length + 3);
    expect(urls.every((url) => url.origin === BRAND.origin && !url.search)).toBe(true);
    expect(urls.map((url) => url.pathname)).toEqual([
      '/', ...LANDING_PAGES.map(({ slug }) => getLandingPath(slug)), '/podminky', '/jak-chranime-data',
    ]);
    expect(xml).not.toContain('/lp/');
    expect(xml).not.toContain('private');
    expect(ctx.res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/xml; charset=utf-8');
  });

  it('publishes crawler restrictions and leaves every authenticated route protected', async () => {
    const ctx = context();
    await robots(ctx as unknown as GetServerSidePropsContext);
    const body = String(ctx.res.end.mock.calls[0][0]);
    for (const path of ['/app', '/api/', '/dotaznik', '/t/']) {
      expect(body).toContain(`Disallow: ${path}\n`);
    }
    expect(body).toContain(`Sitemap: ${BRAND.origin}/sitemap.xml`);
    for (const path of ['/robots.txt', '/sitemap.xml', '/brand/favicon.svg', '/lp/nezname-tema', ...Object.values(LANDING_ROUTES)]) {
      const response = await middleware(new NextRequest(`${BRAND.origin}${path}`));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
    for (const path of ['/app/denik', '/t/abcdef', '/t/abcdef/labs']) {
      const response = await middleware(new NextRequest(`${BRAND.origin}${path}`));
      expect(response.status).toBe(307);
    }
    const api = await middleware(new NextRequest(`${BRAND.origin}/api/notes`));
    expect(api.status).toBe(401);
    for (const path of ['/nezname-tema', '/brand-private/secrets']) {
      const response = await middleware(new NextRequest(`${BRAND.origin}${path}`));
      expect(response.status).toBe(404);
      expect(response.headers.has('x-middleware-next')).toBe(false);
      expect(response.headers.has('location')).toBe(false);
    }
  });

  it.each([
    ['/t/%61bcdef', 404],
    ['/%74/abcdef/labs', 404],
    ['/%61pp/denik', 404],
    ['/app/%64enik', 307],
    ['/%61pi/notes?t=abcdef', 404],
    ['/api/%6eotes?t=abcdef', 401],
  ])('does not let encoded private route %s bypass authorization', async (path, status) => {
    const response = await middleware(new NextRequest(`${BRAND.origin}${path}`));
    expect(response.status).toBe(status);
    expect(response.headers.has('x-middleware-next')).toBe(false);
    expect(response.headers.has('x-middleware-rewrite')).toBe(false);
  });

  it('adds noindex response headers to all account, diary, API and questionnaire routes', async () => {
    const headers = await nextConfig.headers();
    for (const source of ['/app/:path*', '/t/:path*', '/api/:path*', '/dotaznik']) {
      expect(headers.find((entry) => entry.source === source)?.headers).toContainEqual({
        key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive',
      });
    }
  });

  it('keeps personalized landing responses private and builds canonical without query or preview URL', async () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    const ctx = context();
    const result = await landingProps(ctx as unknown as GetServerSidePropsContext, LANDING_PAGES[0]);
    expect(result.canonical).toBe(`${BRAND.origin}${getLandingPath(LANDING_PAGES[0].slug)}`);
    expect(ctx.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
});
