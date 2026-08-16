import { NextApiRequest, NextApiResponse } from 'next';
import { getTenantBySlug } from '../../lib/tenant/registry';
import { verifyPassword } from '../../lib/password';
import { sessionCookie, signSession } from '../../lib/session';
import { audit, getUser, listUsers, noteLoginResult } from '../../lib/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { slug, password } = (req.body ?? {}) as { slug?: string; password?: string };
  const secret = process.env.AUTH_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server není nakonfigurovaný (AUTH_SECRET).' });
  if (typeof slug !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Chybí slug nebo heslo.' });
  }

  const config = getTenantBySlug(slug);
  if (!config) return res.status(404).json({ error: 'Aplikace neexistuje.' });

  try {
    // Zatím jeden účet na aplikaci; model počítá s víc uživateli, takže bereme prvního vlastníka.
    const users = await listUsers(config.id);
    const user = users.find((u) => u.role === 'owner') ?? users[0];
    if (!user) return res.status(500).json({ error: 'Aplikace nemá založený účet.' });

    const fresh = await getUser(config.id, user.userId);
    if (fresh?.lockedUntil && new Date(fresh.lockedUntil) > new Date()) {
      return res.status(429).json({ error: 'Příliš mnoho pokusů. Zkus to za 15 minut.' });
    }

    const ok = await verifyPassword(password, fresh?.passwordHash);
    await noteLoginResult(config.id, user.userId, ok);
    if (!ok) {
      await audit(config.id, 'login.failed', { userId: user.userId });
      return res.status(401).json({ error: 'Špatné heslo.' });
    }

    const token = await signSession(secret, { t: config.id, s: config.slug, u: user.userId, r: user.role });
    res.setHeader('Set-Cookie', sessionCookie(config.slug, token, process.env.NODE_ENV === 'production'));
    await audit(config.id, 'login.ok', { userId: user.userId });
    return res.json({ success: true, redirect: `/t/${config.slug}` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
