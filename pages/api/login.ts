import { NextApiRequest, NextApiResponse } from 'next';
import { signToken, AUTH_COOKIE, AUTH_TTL_SECONDS } from '../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { password } = (req.body ?? {}) as { password?: string };
  const expected = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!expected || !secret) {
    return res.status(500).json({ error: 'Server není nakonfigurovaný (APP_PASSWORD / AUTH_SECRET).' });
  }
  if (typeof password !== 'string' || password !== expected) {
    return res.status(401).json({ error: 'Špatné heslo.' });
  }
  const token = await signToken(secret, AUTH_TTL_SECONDS);
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; ${isProd ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${AUTH_TTL_SECONDS}`
  );
  res.json({ success: true });
}
