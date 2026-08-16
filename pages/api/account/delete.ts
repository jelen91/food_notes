import { NextApiRequest, NextApiResponse } from 'next';
import { requireAccount } from '../../../lib/apiAuth';
import { verifyPassword } from '../../../lib/password';
import { clearAccountCookie } from '../../../lib/session';
import { deleteAccountData } from '../../../lib/accountDeletion';
import { enforceRateLimit, requireSameOrigin } from '../../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req, res)) return;

  // Mazat lze jen vlastní účet – identita pochází ze session, ne z těla požadavku.
  const account = await requireAccount(req, res);
  if (!account) return;

  if (!(await enforceRateLimit(req, res, { key: `delete:${account.accountId}`, max: 5, windowSeconds: 3600 }))) return;

  const password = String((req.body ?? {}).password ?? '');
  if (!(await verifyPassword(password, account.passwordHash))) {
    return res.status(401).json({ error: 'Heslo nesouhlasí.' });
  }

  try {
    const result = await deleteAccountData(account.accountId);
    res.setHeader('Set-Cookie', clearAccountCookie(process.env.NODE_ENV === 'production'));
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error('mazání účtu selhalo:', (error as Error).message);
    return res.status(500).json({ error: 'Smazání se nepodařilo dokončit. Napiš nám prosím.' });
  }
}
