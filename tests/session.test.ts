import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_COOKIE,
  accountCookie,
  clearAccountCookie,
  cookieName,
  signAccountSession,
  signSession,
  verifyAccountSession,
  verifySession,
} from '../lib/session';

const SECRET = 'testovaci-secret-dostatecne-dlouhy';

describe('session účtu', () => {
  it('podepsaná session se ověří', async () => {
    const token = await signAccountSession(SECRET, { a: 'acc_1', t: 'u_1', s: 'abcdefgh' });
    const session = await verifyAccountSession(SECRET, token);
    expect(session?.a).toBe('acc_1');
    expect(session?.s).toBe('abcdefgh');
  });

  it('cizí secret neprojde', async () => {
    const token = await signAccountSession(SECRET, { a: 'acc_1', t: 'u_1', s: 'abcdefgh' });
    expect(await verifyAccountSession('jiny-secret', token)).toBeNull();
  });

  it('pozměněný payload neprojde', async () => {
    const token = await signAccountSession(SECRET, { a: 'acc_1', t: 'u_1', s: 'abcdefgh' });
    const [body, sig] = token.split('.');
    const tampered = Buffer.from(JSON.stringify({ a: 'acc_2', t: 'u_2', s: 'zzzzzzzz', e: 9999999999 }))
      .toString('base64url');
    expect(await verifyAccountSession(SECRET, `${tampered}.${sig}`)).toBeNull();
    expect(body).not.toBe(tampered);
  });

  it('expirovaná session neprojde', async () => {
    const token = await signAccountSession(SECRET, { a: 'acc_1', t: 'u_1', s: 'abcdefgh' }, -10);
    expect(await verifyAccountSession(SECRET, token)).toBeNull();
  });

  it('tenant session se nedá použít jako session účtu', async () => {
    const tenantToken = await signSession(SECRET, { t: 'roman', s: 'qm4x7btp', u: 'owner', r: 'owner' });
    expect(await verifyAccountSession(SECRET, tenantToken)).toBeNull();
  });

  it('session účtu se nedá použít jako tenant session', async () => {
    const accountToken = await signAccountSession(SECRET, { a: 'acc_1', t: 'u_1', s: 'abcdefgh' });
    expect(await verifySession(SECRET, accountToken)).toBeNull();
  });

  it('cookie účtu je oddělená od cookie zákazníka', () => {
    expect(ACCOUNT_COOKIE).not.toBe(cookieName('abcdefgh'));
  });

  it('cookie je HttpOnly, SameSite a v produkci Secure', () => {
    const cookie = accountCookie('token', true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(clearAccountCookie(true)).toContain('Max-Age=0');
  });
});
