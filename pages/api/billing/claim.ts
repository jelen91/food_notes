// Návrat z platby. Přihlásí zákazníka do účtu, který k jeho draftu založil webhook.
//
// Přístup se nedává za návrat z Checkoutu – ten sám o sobě neznamená nic. Musí sedět obojí:
// identifikátor Checkout Session z návratové adresy i cookie draftu z prohlížeče, a účet
// smí existovat jen proto, že ho vytvořil ověřený webhook.

import { NextApiRequest, NextApiResponse } from 'next';
import { findAccountById } from '../../../lib/accounts';
import { getEntitlement, hasAccess } from '../../../lib/billing';
import { nextStepPath } from '../../../lib/onboarding';
import { DRAFT_COOKIE, clearDraftCookie, draftIdFromCookie, getDraft } from '../../../lib/drafts';
import { accountCookie, signAccountSession } from '../../../lib/session';
import { CHECKOUT_SESSIONS, getDb } from '../../../lib/db';
import { clientIp, enforceRateLimit, requireSameOrigin } from '../../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req, res)) return;
  if (!(await enforceRateLimit(req, res, { key: `claim:${clientIp(req)}`, max: 120, windowSeconds: 3600 })))
    return;

  const sessionId = String((req.body ?? {}).sessionId ?? '').trim();
  const draftId = draftIdFromCookie(req.cookies[DRAFT_COOKIE]);
  if (!sessionId || !draftId) return res.status(400).json({ error: 'Chybí údaje o platbě.' });

  try {
    const db = await getDb();
    const checkout = await db.collection(CHECKOUT_SESSIONS).findOne({ sessionId });
    // Cizí session ID nepomůže – musí patřit právě k draftu z tohohle prohlížeče.
    if (!checkout || checkout.draftId !== draftId)
      return res.status(403).json({ error: 'Platbu se nepodařilo ověřit.' });
    if (checkout.duplicateRefundStatus)
      return res.json({ duplicatePurchase: true, refundStatus: checkout.duplicateRefundStatus });
    if (checkout.status !== 'completed') return res.status(202).json({ pending: true });

    const draft = await getDraft(draftId);
    // Webhook ještě nedorazil: stránka se ptá dál, přístup zatím nedáváme.
    if (!draft?.accountId) return res.status(202).json({ pending: true });

    const account = await findAccountById(draft.accountId);
    if (!account || account.status === 'deleted')
      return res.status(403).json({ error: 'Účet není dostupný.' });

    const entitlement = await getEntitlement(account.accountId);
    const access = hasAccess(entitlement);
    if (!access) return res.status(202).json({ pending: true });

    // Zaplacení na cizí e-mail není přihlášení. Starší drafty bez výslovného důkazu
    // také vyžadují heslo nebo odkaz z e-mailu; žádnou session ani údaje účtu nevydáme.
    if (
      draft.autoSignInAccountId !== account.accountId ||
      draft.claimedCheckoutSessionId !== sessionId ||
      entitlement?.stripeCheckoutSessionId !== sessionId ||
      account.tenantId !== draft.tenantId ||
      account.slug !== draft.slug
    ) {
      return res.json({ requiresLogin: true, next: '/app/prihlaseni' });
    }

    const token = await signAccountSession(process.env.AUTH_SECRET || '', {
      a: account.accountId,
      t: account.tenantId,
      s: account.slug,
    });
    const isProd = process.env.NODE_ENV === 'production';
    // Draft doslouží – od téhle chvíle rozhoduje session účtu.
    res.setHeader('Set-Cookie', [accountCookie(token, isProd), clearDraftCookie(isProd)]);

    return res.json({
      success: true,
      email: account.email,
      next: nextStepPath(account.onboarding, access, account.slug),
    });
  } catch (error) {
    console.error('převzetí platby selhalo:', (error as Error).message);
    return res.status(500).json({ error: 'Platbu se teď nepodařilo dokončit.' });
  }
}
