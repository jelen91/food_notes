import { NextApiRequest, NextApiResponse } from 'next';
import { clearAccountCookie } from '../../../lib/session';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Set-Cookie', clearAccountCookie(process.env.NODE_ENV === 'production'));
  res.json({ success: true });
}
