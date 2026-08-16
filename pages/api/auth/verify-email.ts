import { NextApiRequest, NextApiResponse } from 'next';
import { markEmailVerified } from '../../../lib/accounts';
import { consumeToken } from '../../../lib/tokens';
import { clientIp, enforceRateLimit } from '../../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await enforceRateLimit(req, res, { key: `verify:${clientIp(req)}`, max: 30, windowSeconds: 3600 }))) return;

  const token = String((req.body ?? {}).token ?? '');
  try {
    const accountId = await consumeToken(token, 'verify_email');
    if (!accountId) return res.status(400).json({ error: 'Odkaz je neplatný nebo už byl použitý.' });
    await markEmailVerified(accountId);
    return res.json({ success: true });
  } catch (error) {
    console.error('ověření e-mailu selhalo:', (error as Error).message);
    return res.status(500).json({ error: 'Ověření se nepodařilo.' });
  }
}
