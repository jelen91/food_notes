import { NextApiRequest, NextApiResponse } from 'next';
import { clearCookie } from '../../lib/session';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const slug = String((req.body as any)?.slug ?? req.query.t ?? '').trim();
  if (!/^[a-z0-9]{6,40}$/.test(slug)) return res.status(400).json({ error: 'Chybí slug.' });
  res.setHeader('Set-Cookie', clearCookie(slug, process.env.NODE_ENV === 'production'));
  res.json({ success: true });
}
