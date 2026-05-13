import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, AUTH_COOKIE } from './lib/auth';

// Chrání všechno kromě login stránky, _next assets a favicon.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
};

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Login/logout endpointy nesmí být chráněny (jinak by se nedalo přihlásit).
  if (path === '/api/login' || path === '/api/logout') return NextResponse.next();

  // POST /api/health (Health Auto Export) – pouští se přes vlastní x-health-key, ne přes cookie.
  if (path === '/api/health' && req.method === 'POST') return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const ok = await verifyToken(process.env.AUTH_SECRET || '', token);
  if (ok) return NextResponse.next();

  // API → 401 JSON, HTML → redirect na /login
  if (path.startsWith('/api/')) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  return NextResponse.redirect(loginUrl);
}
