import { NextApiRequest, NextApiResponse } from 'next';
import { AUTH_COOKIE } from '../../lib/auth';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ success: true });
}
