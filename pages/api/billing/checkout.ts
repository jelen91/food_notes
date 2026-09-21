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
import { purchaseConsent } from '../../../lib/purchase-consent';

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
    const entitlement = await getEntitlement(account.accountId);
    if (entitlement) {
      return res
        .status(409)
        .json({
          error: hasAccess(entitlement)
            ? 'Přístup už je aktivní.'
            : 'Na účtu už je evidovaný nákup. Prodloužení nyní není dostupné; stav přístupu a vrácení peněz najdeš v účtu.',
          next: '/app/ucet',
        });
    }
    reference = { accountId: account.accountId, email: account.email };
    rateKey = `checkout:${account.accountId}`;
  } else {
    const draft = await getDraft(draftIdFromCookie(req.cookies[DRAFT_COOKIE]));
    if (!draft) return res.status(400).json({ error: 'Nejdřív prosím vyplň dotazník.', next: '/dotaznik' });
    if (draft.accountId)
      return res.status(409).json({ error: 'Platba už proběhla.', next: '/app/prihlaseni' });
    if (!draft.submittedAt)
      return res.status(400).json({ error: 'Dotazník ještě není odeslaný.', next: '/dotaznik' });
    reference = { draftId: draft.draftId };
    rateKey = `checkout:${draft.draftId}`;
  }

  const consent = purchaseConsent(req.body);
  if (!consent)
    return res
      .status(400)
      .json({ error: 'Před platbou prosím přijmi aktuální podmínky a potvrď žádost o zahájení služby.' });

  const priceId = process.env.STRIPE_PRICE_ID;
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Platby nejsou nakonfigurované.' });
  }
  // The preview remains usable with test payments; real sales require identifiable support and receipts.
  if (
    !process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') &&
    !process.env.STRIPE_SECRET_KEY.startsWith('rk_test_') &&
    ['SELLER_NAME', 'SELLER_ICO', 'SELLER_ADDRESS', 'SUPPORT_EMAIL', 'RESEND_API_KEY', 'EMAIL_FROM'].some(
      (key) => !process.env[key]?.trim()
    )
  ) {
    return res.status(503).json({ error: 'Objednávky zatím nejsou otevřené. Zkus to prosím později.' });
  }

  if (!(await enforceRateLimit(req, res, { key: rateKey, max: 10, windowSeconds: 3600 }))) return;
  if (
    !(await enforceRateLimit(req, res, { key: `checkout-ip:${clientIp(req)}`, max: 30, windowSeconds: 3600 }))
  )
    return;

  try {
    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      // Spojení se zákazníkem: interní identifikátor, nic jiného.
      client_reference_id: reference.accountId ?? reference.draftId,
      metadata: {
        ...(reference.accountId ? { accountId: reference.accountId } : { draftId: reference.draftId! }),
        purchasePolicyVersion: consent.purchasePolicyVersion,
        acceptedAt: consent.acceptedAt,
        priceId,
      },
      custom_text: {
        submit: {
          message:
            'Přístup na 12 měsíců bez automatického obnovení. Do 72 hodin od platby garance vrácení celé ceny, i po použití deníku. Zákonná práva zůstávají zachována.',
        },
      },
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
      priceId,
      amountTotal: checkout.amount_total,
      currency: checkout.currency,
      purchaseConsent: consent,
      createdAt: new Date(),
    });

    // Stav se posouvá jen jako informace pro UI; o přístupu rozhoduje entitlement z webhooku.
    if (reference.accountId) await advance(reference.accountId, 'checkout_started');

    return res.json({ url: checkout.url });
  } catch (error) {
    // Chyba od Stripe se ven nepropisuje, jen do serverového logu.
    console.error('checkout se nepodařilo založit');
    return res.status(502).json({ error: 'Platbu se teď nepodařilo spustit. Zkus to prosím znovu.' });
  }
}
