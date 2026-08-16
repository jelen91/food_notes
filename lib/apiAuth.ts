// Rozřešení zákazníka a session pro Node API routy.
//
// Zákazník se určuje z parametru ?t=<slug> a session cookie musí patřit právě jemu –
// middleware sice cookie ověřuje taky, ale routa se na to nespoléhá (obrana do hloubky).

import type { NextApiRequest, NextApiResponse } from 'next';
import { ACCOUNT_COOKIE, cookieName, verifyAccountSession, verifySession, Session } from './session';
import { getTenantBySlug } from './tenant/registry';
import { getTenantSecrets } from './store';
import { TenantConfig } from './tenant/types';
import { Account, findAccountById } from './accounts';

export interface TenantContext {
  config: TenantConfig;
  session: Session;
  dek: Buffer;
}

export function slugFromRequest(req: NextApiRequest): string {
  const raw = req.query.t ?? (req.body && typeof req.body === 'object' ? (req.body as any).t : '');
  const slug = String(Array.isArray(raw) ? raw[0] : raw ?? '').trim();
  return /^[a-z0-9]{6,40}$/.test(slug) ? slug : '';
}

/** Vrátí kontext, nebo rovnou odpoví chybou a vrátí null. */
export async function requireTenant(req: NextApiRequest, res: NextApiResponse): Promise<TenantContext | null> {
  const slug = slugFromRequest(req);
  if (!slug) {
    res.status(400).json({ error: 'Chybí parametr t.' });
    return null;
  }
  const config = getTenantBySlug(slug);
  if (!config) {
    res.status(404).json({ error: 'Aplikace neexistuje.' });
    return null;
  }
  const secret = process.env.AUTH_SECRET || '';
  let session = await verifySession(secret, req.cookies[cookieName(slug)]);

  // Samoobslužný zákazník má cookie účtu; do deníku ho pustí jen tehdy, když workspace
  // v session odpovídá otevírané aplikaci.
  if (!session) {
    const accountSession = await verifyAccountSession(secret, req.cookies[ACCOUNT_COOKIE]);
    if (accountSession?.s === slug && accountSession.t === config.id) {
      session = { t: config.id, s: slug, u: accountSession.a, r: 'owner', e: accountSession.e };
    }
  }

  if (!session || session.s !== slug || session.t !== config.id) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const secrets = await getTenantSecrets(config.id);
  if (!secrets) {
    res.status(500).json({ error: 'Aplikace nemá vygenerovaný datový klíč.' });
    return null;
  }
  return { config, session, dek: secrets.dek };
}

/**
 * Účet z podepsané cookie. Identita nikdy nepochází z těla requestu ani z query –
 * `accountId` poslaný prohlížečem se ignoruje.
 */
export async function requireAccount(req: NextApiRequest, res: NextApiResponse): Promise<Account | null> {
  const session = await verifyAccountSession(process.env.AUTH_SECRET || '', req.cookies[ACCOUNT_COOKIE]);
  if (!session) {
    res.status(401).json({ error: 'Nejsi přihlášený.' });
    return null;
  }
  const account = await findAccountById(session.a);
  if (!account || account.status === 'deleted') {
    res.status(401).json({ error: 'Nejsi přihlášený.' });
    return null;
  }
  return account;
}

/** Role s právem zapisovat. */
export function canWrite(ctx: TenantContext): boolean {
  return ctx.session.r === 'owner' || ctx.session.r === 'editor';
}

export function requireWrite(ctx: TenantContext, res: NextApiResponse): boolean {
  if (canWrite(ctx)) return true;
  res.status(403).json({ error: 'Tento účet má jen právo číst.' });
  return false;
}
