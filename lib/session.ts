// Přihlašovací session. Bez session storage – cookie nese podepsaný payload,
// server jen ověří podpis. Musí fungovat i v Edge runtime (middleware), takže
// jen WebCrypto, žádné node:crypto.

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface Session {
  /** interní ID zákazníka (nikdy se neobjeví v URL) */
  t: string;
  /** slug v URL – aby cookie nešla použít na jiného zákazníka */
  s: string;
  /** ID uživatele v rámci zákazníka */
  u: string;
  /** role: owner | editor | viewer */
  r: string;
  /** expirace (unix sekundy) */
  e: number;
}

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dní

/** Session samoobslužného účtu. Workspace (`t`/`s`) může chybět, dokud není hotový tracker. */
export interface AccountSession {
  a: string;
  t?: string | null;
  s?: string | null;
  e: number;
  /** Druh tokenu – brání záměně session účtu a session zákazníka. */
  k?: 'a';
}

/** Cookie účtu je jedna pro celou appku; tenant cookie zůstává vedle ní kvůli starým zákazníkům. */
export const ACCOUNT_COOKIE = 'hj_session';

/** Každý zákazník má vlastní cookie, takže v jednom prohlížeči jde být přihlášený do víc appek. */
export function cookieName(slug: string): string {
  return `hj_${slug}`;
}

async function getKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  let p = s.replace(/-/g, '+').replace(/_/g, '/');
  while (p.length % 4) p += '=';
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** "<payloadBase64Url>.<podpis>" */
export async function signSession(secret: string, session: Omit<Session, 'e'>, ttl = SESSION_TTL_SECONDS): Promise<string> {
  const payload: Session = { ...session, e: Math.floor(Date.now() / 1000) + ttl };
  const body = toBase64Url(enc.encode(JSON.stringify(payload)));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySession(secret: string, token: string | undefined | null): Promise<Session | null> {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sigStr = token.slice(dot + 1);
  try {
    const key = await getKey(secret);
    const sig = fromBase64Url(sigStr);
    // Podpis se předává jako Uint8Array – ArrayBuffer z Edge sandboxu neprojde kontrolou typu.
    const ok = await crypto.subtle.verify('HMAC', key, sig as unknown as BufferSource, enc.encode(body));
    if (!ok) return null;
    const session = JSON.parse(dec.decode(fromBase64Url(body))) as Session;
    if (!session?.t || !session?.s || typeof session.e !== 'number') return null;
    // Session účtu má vlastní ověřovací cestu a sem se nesmí dostat, ani když ji někdo
    // přepíše do cookie zákazníka. (Tokeny vydané starší verzí `k` nemají – ty projdou.)
    if ((session as any).a || (session as any).k === 'a') return null;
    if (session.e < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export async function signAccountSession(
  secret: string,
  session: Omit<AccountSession, 'e'>,
  ttl = SESSION_TTL_SECONDS
): Promise<string> {
  const payload: AccountSession = { ...session, k: 'a', e: Math.floor(Date.now() / 1000) + ttl };
  const body = toBase64Url(enc.encode(JSON.stringify(payload)));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyAccountSession(
  secret: string,
  token: string | undefined | null
): Promise<AccountSession | null> {
  if (!token || !secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  try {
    const key = await getKey(secret);
    const sig = fromBase64Url(token.slice(dot + 1));
    const ok = await crypto.subtle.verify('HMAC', key, sig as unknown as BufferSource, enc.encode(body));
    if (!ok) return null;
    const session = JSON.parse(dec.decode(fromBase64Url(body))) as AccountSession;
    // Tenant session (má `s` a `t`, ale ne `a`) se sem nesmí propašovat.
    if (!session?.a || typeof session.e !== 'number') return null;
    if (session.e < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export function accountCookie(token: string, isProd: boolean): string {
  return [
    `${ACCOUNT_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    isProd ? 'Secure' : '',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearAccountCookie(isProd: boolean): string {
  return [`${ACCOUNT_COOKIE}=`, 'Path=/', 'HttpOnly', isProd ? 'Secure' : '', 'SameSite=Lax', 'Max-Age=0']
    .filter(Boolean)
    .join('; ');
}

export function sessionCookie(slug: string, token: string, isProd: boolean): string {
  return [
    `${cookieName(slug)}=${token}`,
    'Path=/',
    'HttpOnly',
    isProd ? 'Secure' : '',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearCookie(slug: string, isProd: boolean): string {
  return [`${cookieName(slug)}=`, 'Path=/', 'HttpOnly', isProd ? 'Secure' : '', 'SameSite=Lax', 'Max-Age=0']
    .filter(Boolean)
    .join('; ');
}
