import { NextApiRequest, NextApiResponse } from 'next';
import { findAccountByEmail, normalizeEmail } from '../../../lib/accounts';
import { sendPasswordResetEmail } from '../../../lib/email';
import { issueToken } from '../../../lib/tokens';
import { clientIp, enforceRateLimit, requireSameOrigin } from '../../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req, res)) return;
  if (!(await enforceRateLimit(req, res, { key: `reset:${clientIp(req)}`, max: 10, windowSeconds: 3600 }))) return;

  const email = normalizeEmail((req.body ?? {}).email);

  try {
    const account = email ? await findAccountByEmail(email) : null;
    if (account && account.status !== 'deleted') {
      const token = await issueToken(account.accountId, 'reset_password');
      await sendPasswordResetEmail(account.email, token).catch((err) =>
        console.error('e-mail s resetem se nepodařilo odeslat:', err.message)
      );
    }
    // Odpověď je vždy stejná, ať se nedá zjistit, které e-maily mají účet.
    return res.json({ success: true });
  } catch (error) {
    console.error('žádost o reset selhala:', (error as Error).message);
    return res.json({ success: true });
  }
}
