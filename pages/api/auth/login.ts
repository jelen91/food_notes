import { NextApiRequest, NextApiResponse } from 'next';
import { login, normalizeEmail } from '../../../lib/accounts';
import { accountCookie, signAccountSession } from '../../../lib/session';
import { clientIp, enforceRateLimit, requireSameOrigin } from '../../../lib/rateLimit';
import { getEntitlement, hasAccess } from '../../../lib/billing';
import { nextStepPath } from '../../../lib/onboarding';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req, res)) return;

  const email = normalizeEmail((req.body ?? {}).email);
  const password = String((req.body ?? {}).password ?? '');
  // Limit na IP i na e-mail: brzdí plošné hádání i cílený útok na jeden účet.
  if (!(await enforceRateLimit(req, res, { key: `login:${clientIp(req)}`, max: 20, windowSeconds: 900 }))) return;
  if (email && !(await enforceRateLimit(req, res, { key: `login-acc:${email}`, max: 10, windowSeconds: 900 }))) return;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server není nakonfigurovaný.' });

  try {
    const result = await login(email, password);
    if (!result.ok) {
      if (result.reason === 'locked') {
        return res.status(429).json({ error: 'Účet je dočasně zamčený. Zkus to za 15 minut.' });
      }
      // Neúspěch nerozlišuje neexistující účet od špatného hesla.
      return res.status(401).json({ error: 'Nesprávný e-mail nebo heslo.' });
    }

    const account = result.account;
    const token = await signAccountSession(secret, {
      a: account.accountId,
      t: account.tenantId,
      s: account.slug,
    });
    res.setHeader('Set-Cookie', accountCookie(token, process.env.NODE_ENV === 'production'));

    const entitlement = await getEntitlement(account.accountId);
    return res.json({ success: true, next: nextStepPath(account.onboarding, hasAccess(entitlement), account.slug) });
  } catch (error) {
    console.error('přihlášení selhalo:', (error as Error).message);
    return res.status(500).json({ error: 'Přihlášení se nepodařilo.' });
  }
}
