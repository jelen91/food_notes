// Dotazník má dvě publika:
//   1. návštěvník bez účtu – vyplňuje ho jako první krok, ještě před platbou (draft),
//   2. přihlášený zákazník – vrací se k němu při přegenerování deníku.
// Ukládá se v obou případech stejně: šifrovaně do workspace, který k draftu patří.

import { NextApiRequest, NextApiResponse } from 'next';
import { ACCOUNT_COOKIE, verifyAccountSession } from '../../lib/session';
import { findAccountById } from '../../lib/accounts';
import { getEntitlement, hasAccess } from '../../lib/billing';
import { getTenantSecrets } from '../../lib/store';
import { getQuestionnaire, saveQuestionnaire } from '../../lib/tracker/store';
import { QUESTIONNAIRE, QUESTIONNAIRE_VERSION, validateAnswers } from '../../lib/questionnaire';
import { advance } from '../../lib/onboarding';
import {
  DRAFT_COOKIE,
  createDraft,
  draftCookie,
  draftIdFromCookie,
  getDraft,
  markDraftSubmitted,
  purgeExpiredDrafts,
} from '../../lib/drafts';
import { clientIp, enforceRateLimit, requireSameOrigin } from '../../lib/rateLimit';
import { ensureIndexes } from '../../lib/db';

/** Kdo dotazník vyplňuje: přihlášený účet, rozpracovaný draft, nebo zatím nikdo. */
interface Owner {
  tenantId: string;
  accountId?: string;
  draftId?: string;
  /** Kam poslat po odeslání dotazníku. */
  next: string;
}

async function resolveOwner(req: NextApiRequest): Promise<Owner | null> {
  const session = await verifyAccountSession(process.env.AUTH_SECRET || '', req.cookies[ACCOUNT_COOKIE]);
  if (session) {
    const account = await findAccountById(session.a);
    if (account && account.status !== 'deleted' && account.tenantId) {
      // Přihlášený se k dotazníku vrací kvůli novému deníku – to je placená část.
      if (!hasAccess(await getEntitlement(account.accountId))) return null;
      return { tenantId: account.tenantId, accountId: account.accountId, next: '/app/tracker' };
    }
    return null;
  }

  const draft = await getDraft(draftIdFromCookie(req.cookies[DRAFT_COOKIE]));
  // Draft, ke kterému už vznikl účet, se dál needituje – patří přihlášenému zákazníkovi.
  if (draft && !draft.accountId) {
    return { tenantId: draft.tenantId, draftId: draft.draftId, next: '/app/platba' };
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const owner = await resolveOwner(req);
      // Bez draftu i bez účtu se vrací prázdný dotazník – zakládá se až prvním uložením.
      if (!owner) return res.json({ definition: QUESTIONNAIRE, answers: {}, submittedAt: null });

      const secrets = await getTenantSecrets(owner.tenantId);
      if (!secrets) return res.status(500).json({ error: 'Chybí datový klíč.' });
      const record = await getQuestionnaire(owner.tenantId, secrets.dek);
      return res.json({
        definition: QUESTIONNAIRE,
        answers: record.answers,
        submittedAt: record.submittedAt,
        generationStatus: record.generationStatus,
      });
    }

    if (req.method === 'POST') {
      if (!requireSameOrigin(req, res)) return;

      let owner = await resolveOwner(req);

      // Anonymní vyplňování: draft (a s ním šifrovací klíč) vzniká až tady, ne při
      // otevření stránky – prázdné návštěvy tak po sobě nic nenechávají.
      if (!owner) {
        const hasAccountCookie = Boolean(req.cookies[ACCOUNT_COOKIE]);
        if (hasAccountCookie) return res.status(403).json({ error: 'Přístup zatím není aktivní.', next: '/app/platba' });
        if (!(await enforceRateLimit(req, res, { key: `draft:${clientIp(req)}`, max: 20, windowSeconds: 3600 }))) return;

        await ensureIndexes();
        await purgeExpiredDrafts().catch(() => undefined);
        const draft = await createDraft();
        res.setHeader('Set-Cookie', draftCookie(draft.draftId, process.env.NODE_ENV === 'production'));
        owner = { tenantId: draft.tenantId, draftId: draft.draftId, next: '/app/platba' };
      } else {
        const limitKey = owner.accountId ? `quest:${owner.accountId}` : `quest:${owner.draftId}`;
        if (!(await enforceRateLimit(req, res, { key: limitKey, max: 120, windowSeconds: 3600 }))) return;
        await ensureIndexes();
      }

      const secrets = await getTenantSecrets(owner.tenantId);
      if (!secrets) return res.status(500).json({ error: 'Chybí datový klíč.' });

      const submit = Boolean((req.body ?? {}).submit);
      const validation = validateAnswers((req.body ?? {}).answers, { requireComplete: submit });
      if (submit && !validation.ok) {
        return res.status(400).json({ error: 'Zkontroluj prosím odpovědi.', problems: validation.problems });
      }

      await saveQuestionnaire(owner.tenantId, secrets.dek, {
        version: QUESTIONNAIRE_VERSION,
        answers: validation.answers,
        submitted: submit,
      });

      if (submit) {
        if (owner.draftId) await markDraftSubmitted(owner.draftId);
        if (owner.accountId) await advance(owner.accountId, 'questionnaire_completed');
      }

      return res.json({ success: true, submitted: submit, next: submit ? owner.next : undefined });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('dotazník selhal:', (error as Error).message);
    return res.status(500).json({ error: 'Uložení se nepodařilo.' });
  }
}
