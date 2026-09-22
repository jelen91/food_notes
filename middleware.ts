import { NextRequest, NextResponse } from 'next/server';
import { ACCOUNT_COOKIE, cookieName, verifyAccountSession, verifySession } from './lib/session';
import { getLandingSlug } from './lib/landing-routes';

// Edge middleware nesmí sahat do databáze, takže tady se řeší jen podpis cookie. Skutečná
// autorizace (existence účtu, vlastnictví dat, entitlement) probíhá v Node routách znovu.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

const SLUG_PATH = /^\/t\/([a-z0-9]{6,40})(\/.*)?$/;

/**
 * Stránky dostupné bez přihlášení. Dotazník i platba jsou mezi nimi schválně: účet
 * vzniká až po zaplacení, takže první kroky musí jít projít bez něj.
 */
const PUBLIC_APP_PAGES = new Set([
  '/dotaznik',
  '/app/registrace',
  '/app/prihlaseni',
  '/app/overeni',
  '/app/zapomenute-heslo',
  '/app/nove-heslo',
  '/app/platba',
  '/app/platba/hotovo',
]);

/** API, které pracuje s účtem (ne s daty konkrétního deníku) – stačí session účtu. */
const ACCOUNT_API_PREFIXES = [
  '/api/billing/status',
  '/api/billing/refund',
  '/api/account/',
  '/api/tracker',
  '/api/journal-analysis',
];

/** Endpointy s vlastní autorizací (heslo, jednorázový token, podpis Stripe). */
const PUBLIC_API = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/verify-email',
  '/api/auth/request-reset',
  '/api/auth/reset-password',
  '/api/stripe/webhook',
  '/api/login',
  '/api/logout',
  // Dotazník i platba se obsluhují bez účtu; oprávnění si routa ověří sama
  // (cookie draftu, session účtu, podpis Stripe).
  '/api/questionnaire',
  '/api/billing/checkout',
  '/api/billing/claim',
]);

function deny(req: NextRequest, redirectTo: string) {
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const url = req.nextUrl.clone();
  url.pathname = redirectTo;
  url.search = '';
  return NextResponse.redirect(url);
}

async function accountSession(req: NextRequest) {
  return verifyAccountSession(process.env.AUTH_SECRET || '', req.cookies.get(ACCOUNT_COOKIE)?.value);
}

/** Do deníku pustíme tenant cookie i cookie účtu, pokud odkazuje na stejný workspace. */
async function canOpenTenant(req: NextRequest, slug: string): Promise<boolean> {
  const secret = process.env.AUTH_SECRET || '';
  const tenant = await verifySession(secret, req.cookies.get(cookieName(slug))?.value);
  if (tenant && tenant.s === slug) return true;
  const account = await accountSession(req);
  return Boolean(account && account.s === slug);
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (
    path === '/' ||
    path === '/podminky' ||
    path === '/jak-chranime-data' ||
    path === '/robots.txt' ||
    path === '/sitemap.xml' ||
    Boolean(getLandingSlug(path)) ||
    path.startsWith('/brand/') ||
    path.startsWith('/lp/') ||
    PUBLIC_API.has(path) ||
    PUBLIC_APP_PAGES.has(path)
  )
    return NextResponse.next();

  // Import z Health Auto Export se autorizuje vlastním klíčem v hlavičce, ne cookie.
  if (path === '/api/health' && req.method === 'POST') return NextResponse.next();

  if (path.startsWith('/api/')) {
    // Účtové endpointy potřebují jen platnou session účtu.
    if (ACCOUNT_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))) {
      return (await accountSession(req)) ? NextResponse.next() : deny(req, '/app/prihlaseni');
    }
    // Zbytek API pracuje s daty konkrétní aplikace.
    const slug = req.nextUrl.searchParams.get('t') || '';
    if (!/^[a-z0-9]{6,40}$/.test(slug)) return deny(req, '/app/prihlaseni');
    return (await canOpenTenant(req, slug)) ? NextResponse.next() : deny(req, '/app/prihlaseni');
  }

  if (path === '/app' || path.startsWith('/app/')) {
    return (await accountSession(req)) ? NextResponse.next() : deny(req, '/app/prihlaseni');
  }

  const match = path.match(SLUG_PATH);
  if (match) {
    const slug = match[1];
    if (path === `/t/${slug}/login`) return NextResponse.next();
    return (await canOpenTenant(req, slug)) ? NextResponse.next() : deny(req, `/t/${slug}/login`);
  }

  // Neznámou cestu nepouštíme dál: Next by mohl dekódovat např. /t/%61bcdef
  // jako existující tenant, přestože neprošla autorizací kanonické cesty výše.
  // Veřejná neznámá adresa zároveň musí vrátit skutečnou 404.
  return new NextResponse('Stránka nebyla nalezena.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
