// Jednoduchý fixed-window rate limit nad MongoDB.
//
// Projekt nemá Redis ani jinou sdílenou cache, a pořizovat je jen kvůli limitům by byla
// nepoměrná složitost. Počitadla se samy uklízejí TTL indexem (`RATE_LIMITS` v lib/db.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { RATE_LIMITS, getDb } from './db';

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const windowKey = `${key}:${windowStart}`;
  const expiresAt = new Date((windowStart + windowSeconds) * 1000);

  try {
    const db = await getDb();
    const doc = await db
      .collection(RATE_LIMITS)
      .findOneAndUpdate(
        { key: windowKey },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, returnDocument: 'after' }
      );
    const count = (doc as any)?.count ?? (doc as any)?.value?.count ?? 1;
    return {
      ok: count <= max,
      remaining: Math.max(0, max - count),
      retryAfterSeconds: windowStart + windowSeconds - now,
    };
  } catch (err) {
    // Limit nesmí shodit funkčnost aplikace; při výpadku počitadla radši pustíme dál.
    console.error('rate limit selhal:', (err as Error).message);
    return { ok: true, remaining: max, retryAfterSeconds: 0 };
  }
}

/** IP klienta pro anonymní endpointy (na Vercelu je první hop v x-forwarded-for). */
export function clientIp(req: NextApiRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return (raw?.split(',')[0] || req.socket?.remoteAddress || 'unknown').trim();
}

/** Vrátí false a rovnou odpoví 429, když je limit vyčerpaný. */
export async function enforceRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  opts: { key: string; max: number; windowSeconds: number }
): Promise<boolean> {
  const result = await rateLimit(opts.key, opts.max, opts.windowSeconds);
  if (result.ok) return true;
  res.setHeader('Retry-After', String(result.retryAfterSeconds));
  res.status(429).json({ error: 'Příliš mnoho pokusů. Zkus to prosím za chvíli.' });
  return false;
}

/**
 * Ochrana proti CSRF úměrná situaci: cookie je SameSite=Lax a všechny mutace jsou JSON POST,
 * takže stačí ověřit původ requestu. Žádná další závislost ani tokeny ve formulářích.
 */
export function sameOrigin(req: NextApiRequest): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // netýká se serverových volání (Stripe webhook, curl)
  const host = req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function requireSameOrigin(req: NextApiRequest, res: NextApiResponse): boolean {
  if (sameOrigin(req)) return true;
  res.status(403).json({ error: 'Neplatný původ požadavku.' });
  return false;
}
