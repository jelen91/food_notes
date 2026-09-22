import { describe, expect, it, vi } from 'vitest';
import type { GetServerSidePropsContext } from 'next';
import { getServerSideProps as publicLanding } from '../pages/[landing]';
import { getServerSideProps as legacyLanding } from '../pages/lp/[slug]';
import { getLandingPage, questionnaireHref } from '../lib/landing-pages';
import { getLandingPath, getLandingSlug, LANDING_ROUTES } from '../lib/landing-routes';
import { landingProps } from '../lib/landing-server';

vi.mock('../components/marketing/LandingPage', () => ({ default: () => null }));
vi.mock('../lib/landing-server', () => ({
  landingProps: vi.fn(async (_ctx, content) => ({ content, offer: {}, resume: null, canonical: '' })),
}));

function context(params: Record<string, string | string[]>, resolvedUrl: string) {
  return { params, resolvedUrl } as unknown as GetServerSidePropsContext;
}

describe('public topic routes and legacy links', () => {
  it.each(Object.entries(LANDING_ROUTES))('serves the friendly URL while retaining the %s questionnaire theme', async (slug, path) => {
    const ctx = context({ landing: path.slice(1) }, path);
    expect(getLandingSlug(path)).toBe(slug);
    expect(getLandingPath(slug)).toBe(path);
    const result = await publicLanding(ctx);
    expect(result).toHaveProperty('props.content.slug', slug);
    expect(landingProps).toHaveBeenCalledWith(ctx, getLandingPage(slug));
    expect(questionnaireHref(slug)).toBe(`/dotaznik?tema=${slug}`);
  });

  it.each(Object.entries(LANDING_ROUTES))('permanently redirects old %s links with all attribution parameters intact', async (slug, path) => {
    const query = '?utm_source=google&utm_campaign=tr%C3%A1ven%C3%AD&gclid=A%2BB&tag=one&tag=two';
    const result = await legacyLanding(context({ slug }, `/lp/${slug}${query}`));
    expect(result).toEqual({ redirect: { destination: `${path}${query}`, permanent: true } });
  });

  it('does not render an unknown public topic or turn it into a homepage redirect', async () => {
    for (const landing of ['nezname-tema', 'traveni', 'toString', ['potize-s-travenim']]) {
      expect(await publicLanding(context({ landing }, '/nezname-tema'))).toEqual({ notFound: true });
    }
    for (const slug of ['nezname-tema', 'toString', ['traveni']]) {
      expect(await legacyLanding(context({ slug }, '/lp/nezname-tema'))).toEqual({ notFound: true });
    }
    expect(getLandingPath('')).toBe('/');
    expect(() => getLandingPath('toString')).toThrow('Unknown landing page');
    expect(getLandingSlug('/app/denik')).toBeUndefined();
  });
});
