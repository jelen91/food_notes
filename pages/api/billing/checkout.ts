// Založení platby. Funguje ve dvou situacích:
//   1. bez účtu – zákazník má vyplněný dotazník (draft) a e-mail zadá až ve Stripe Checkoutu,
//   2. s účtem – starší cesta, kdy účet vznikl dřív než platba.
// Do Stripe jde jen identifikátor draftu nebo účtu; žádné odpovědi ani zdravotní údaje.

import { NextApiRequest, NextApiResponse } from 'next';
import { ACCOUNT_COOKIE, verifyAccountSession } from '../../../lib/session';
import { findAccountById } from '../../../lib/accounts';
import { getStripe } from '../../../lib/stripe';
import { getEntitlement, hasAccess } from '../../../lib/billing';
import { advance } from '../../../lib/onboarding';
import { DRAFT_COOKIE, draftIdFromCookie, getDraft } from '../../../lib/drafts';
import { CHECKOUT_SESSIONS, getDb } from '../../../lib/db';
import { clientIp, enforceRateLimit, requireSameOrigin } from '../../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req, res)) return;

  // Nejdřív se rozhodne, komu platba patří – nepřihlášený volající se o naší
  // konfiguraci plateb nic nedozví.
  const session = await verifyAccountSession(process.env.AUTH_SECRET || '', req.cookies[ACCOUNT_COOKIE]);
  const account = session ? await findAccountById(session.a) : null;

  let reference: { accountId?: string; draftId?: string; email?: string };
  let rateKey: string;

  if (account && account.status !== 'deleted') {
    if (hasAccess(await getEntitlement(account.accountId))) {
      return res.status(409).json({ error: 'Přístup už je aktivní.', next: '/app' });
    }
    reference = { accountId: account.accountId, email: account.email };
    rateKey = `checkout:${account.accountId}`;
  } else {
    const draft = await getDraft(draftIdFromCookie(req.cookies[DRAFT_COOKIE]));
    if (!draft) return res.status(400).json({ error: 'Nejdřív prosím vyplň dotazník.', next: '/dotaznik' });
    if (draft.accountId) return res.status(409).json({ error: 'Platba už proběhla.', next: '/app/prihlaseni' });
    if (!draft.submittedAt) return res.status(400).json({ error: 'Dotazník ještě není odeslaný.', next: '/dotaznik' });
    reference = { draftId: draft.draftId };
    rateKey = `checkout:${draft.draftId}`;
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Platby nejsou nakonfigurované.' });
  }

  if (!(await enforceRateLimit(req, res, { key: rateKey, max: 10, windowSeconds: 3600 }))) return;
  if (!(await enforceRateLimit(req, res, { key: `checkout-ip:${clientIp(req)}`, max: 30, windowSeconds: 3600 }))) return;

  try {
    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      // Spojení se zákazníkem: interní identifikátor, nic jiného.
      client_reference_id: reference.accountId ?? reference.draftId,
      metadata: reference.accountId ? { accountId: reference.accountId } : { draftId: reference.draftId! },
      ...(reference.email ? { customer_email: reference.email } : {}),
      success_url: `${appUrl}/app/platba/hotovo?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/app/platba`,
    });

    const db = await getDb();
    await db.collection(CHECKOUT_SESSIONS).insertOne({
      sessionId: checkout.id,
      accountId: reference.accountId ?? null,
      draftId: reference.draftId ?? null,
      status: 'created',
      createdAt: new Date(),
    });

    // Stav se posouvá jen jako informace pro UI; o přístupu rozhoduje entitlement z webhooku.
    if (reference.accountId) await advance(reference.accountId, 'checkout_started');

    return res.json({ url: checkout.url });
  } catch (error) {
    // Chyba od Stripe se ven nepropisuje, jen do serverového logu.
    console.error('checkout se nepodařilo založit:', (error as Error).message);
    return res.status(502).json({ error: 'Platbu se teď nepodařilo spustit. Zkus to prosím znovu.' });
  }
}
