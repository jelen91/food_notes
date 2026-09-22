import type { GetServerSidePropsContext } from 'next';
import type { LandingPageContent } from './landing-pages';
import type { LandingProps } from '../components/marketing/LandingPage';
import { getPublicOffer } from './offer';
import { BRAND } from './brand';
import { getLandingPath } from './landing-routes';

async function resumePath(cookies: Record<string, string>): Promise<LandingProps['resume']> {
  const { ACCOUNT_COOKIE, verifyAccountSession } = await import('./session');
  const session = await verifyAccountSession(process.env.AUTH_SECRET || '', cookies[ACCOUNT_COOKIE]);
  if (session) {
    const { findAccountById } = await import('./accounts');
    const { getEntitlement, hasAccess } = await import('./billing');
    const { nextStepPath } = await import('./onboarding');
    const account = await findAccountById(session.a);
    if (account && account.status !== 'deleted') {
      const access = hasAccess(await getEntitlement(account.accountId));
      return {
        href: nextStepPath(account.onboarding, access, account.slug),
        label: access ? 'Můj deník' : 'Dokončit objednávku',
      };
    }
  }
  const { DRAFT_COOKIE, draftIdFromCookie, getDraft } = await import('./drafts');
  const draft = await getDraft(draftIdFromCookie(cookies[DRAFT_COOKIE]));
  if (draft && !draft.accountId)
    return {
      href: draft.submittedAt ? '/app/platba' : '/dotaznik',
      label: draft.submittedAt ? 'Dokončit objednávku' : 'Dokončit dotazník',
    };
  return null;
}

export async function landingProps(
  ctx: GetServerSidePropsContext,
  content: LandingPageContent
): Promise<LandingProps> {
  ctx.res.setHeader('Cache-Control', 'private, no-store');
  const [resume, offer] = await Promise.all([
    resumePath(ctx.req.cookies ?? {}).catch(() => null),
    getPublicOffer(),
  ]);
  // Marketing vždy odkazuje na hlavní doménu. APP_URL zůstává runtime nastavením
  // návratů z plateb a odkazů v e-mailech, včetně izolovaného lokálního testování.
  const canonical = `${BRAND.origin}${getLandingPath(content.slug)}`;
  return { content, offer, resume, canonical };
}
