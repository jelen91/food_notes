import { NextApiRequest, NextApiResponse } from 'next';
import { changePassword, findAccountById, markEmailVerified, passwordProblem } from '../../../lib/accounts';
import { consumeToken, invalidateTokens } from '../../../lib/tokens';
import { getEntitlement, hasAccess } from '../../../lib/billing';
import { nextStepPath } from '../../../lib/onboarding';
import { accountCookie, signAccountSession } from '../../../lib/session';
import { clientIp, enforceRateLimit, requireSameOrigin } from '../../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req, res)) return;
  if (!(await enforceRateLimit(req, res, { key: `reset-set:${clientIp(req)}`, max: 20, windowSeconds: 3600 }))) return;

  const token = String((req.body ?? {}).token ?? '');
  const password = String((req.body ?? {}).password ?? '');
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });

  try {
    // Stejná obrazovka slouží pro obnovu hesla i pro první heslo po zaplacení.
    const accountId =
      (await consumeToken(token, 'reset_password')) ?? (await consumeToken(token, 'set_password'));
    if (!accountId) return res.status(400).json({ error: 'Odkaz je neplatný nebo už byl použitý.' });

    await changePassword(accountId, password);
    // Ostatní rozeslané odkazy na heslo už nesmí platit.
    await invalidateTokens(accountId, 'reset_password');
    await invalidateTokens(accountId, 'set_password');
    // Otevřením odkazu z e-mailu zákazník prokázal přístup ke schránce.
    await markEmailVerified(accountId);

    // Rovnou přihlásíme – jinak by hned po nastavení hesla následovalo přihlašování.
    const account = await findAccountById(accountId);
    if (!account) return res.status(400).json({ error: 'Odkaz je neplatný nebo už byl použitý.' });
    const access = hasAccess(await getEntitlement(accountId));
    const token2 = await signAccountSession(process.env.AUTH_SECRET || '', {
      a: account.accountId,
      t: account.tenantId,
      s: account.slug,
    });
    res.setHeader('Set-Cookie', accountCookie(token2, process.env.NODE_ENV === 'production'));

    return res.json({ success: true, next: nextStepPath(account.onboarding, access, account.slug) });
  } catch (error) {
    console.error('nastavení hesla selhalo:', (error as Error).message);
    return res.status(500).json({ error: 'Heslo se nepodařilo změnit.' });
  }
}
