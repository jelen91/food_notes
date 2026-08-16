import { NextApiRequest, NextApiResponse } from 'next';
import { isValidEmail, normalizeEmail, passwordProblem, registerAccount } from '../../../lib/accounts';
import { sendVerificationEmail } from '../../../lib/email';
import { issueToken } from '../../../lib/tokens';
import { accountCookie, signAccountSession } from '../../../lib/session';
import { clientIp, enforceRateLimit, requireSameOrigin } from '../../../lib/rateLimit';
import { ensureIndexes } from '../../../lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSameOrigin(req, res)) return;
  if (!(await enforceRateLimit(req, res, { key: `register:${clientIp(req)}`, max: 10, windowSeconds: 3600 }))) return;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server není nakonfigurovaný.' });

  const email = normalizeEmail((req.body ?? {}).email);
  const password = String((req.body ?? {}).password ?? '');

  if (!isValidEmail(email)) return res.status(400).json({ error: 'Zadej platný e-mail.' });
  const problem = passwordProblem(password);
  if (problem) return res.status(400).json({ error: problem });

  try {
    await ensureIndexes();
    const { account, created } = await registerAccount(email, password);

    if (created) {
      const token = await issueToken(account.accountId, 'verify_email');
      // Nedoručený e-mail nesmí zablokovat registraci – ověření jde poslat znovu.
      await sendVerificationEmail(account.email, token).catch((err) =>
        console.error('ověřovací e-mail se nepodařilo odeslat:', err.message)
      );

      const token2 = await signAccountSession(secret, {
        a: account.accountId,
        t: account.tenantId,
        s: account.slug,
      });
      res.setHeader('Set-Cookie', accountCookie(token2, process.env.NODE_ENV === 'production'));
      return res.status(201).json({ success: true, next: '/app/platba' });
    }

    // Existující e-mail se nepotvrzuje – jinak by šlo zjišťovat, kdo je zaregistrovaný.
    return res.status(200).json({ success: true, next: '/app/prihlaseni' });
  } catch (error) {
    console.error('registrace selhala:', (error as Error).message);
    return res.status(500).json({ error: 'Registraci se nepodařilo dokončit.' });
  }
}
