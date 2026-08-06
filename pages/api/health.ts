import { NextApiRequest, NextApiResponse } from 'next';
import { getDb, DAYS } from '../../lib/db';
import { parseHealthAutoExport } from '../../lib/health';
import { isValidDate } from '../../lib/schema';

// Health Auto Export umí poslat větší payload než výchozí 1 MB limit Next.js.
export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = await getDb();
    const days = db.collection(DAYS);

    if (req.method === 'GET') {
      const date = String(req.query.date ?? '').trim();
      if (!isValidDate(date)) return res.status(400).json({ error: 'Date (YYYY-MM-DD) is required.' });
      const doc = await days.findOne({ date });
      return res.json({
        date,
        health: doc?.health ?? null,
        healthUnits: doc?.healthUnits ?? null,
        workouts: doc?.workouts ?? null,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // POST chrání zvláštní klíč v hlavičce x-health-key (Health Auto Export ho přidá do Headers).
    const required = process.env.HEALTH_API_KEY;
    if (required && req.headers['x-health-key'] !== required) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Tělo může přijít ve dvou tvarech:
    // 1) { data: { metrics: [...], workouts: [...] } } — formát aplikace Health Auto Export
    // 2) { date, health: {...} } — jednoduchý vlastní formát (Apple Shortcut)
    const parsed = parseHealthAutoExport(req.body);
    if (parsed) {
      // Výchozí je slučování: HAE může posílat různé metriky v různých automatizacích,
      // takže se dosavadní hodnoty nepřepisují. ?replace=1 nahradí celý denní snímek.
      const replace = String(req.query.replace ?? '') === '1';
      const summary: Array<{ date: string; metrics: number; workouts: number }> = [];

      for (const [date, day] of Object.entries(parsed)) {
        const set: Record<string, unknown> = { healthUpdatedAt: new Date() };
        if (replace) {
          set.health = day.health;
          set.healthUnits = day.units;
        } else {
          for (const [key, value] of Object.entries(day.health)) set[`health.${key}`] = value;
          for (const [key, unit] of Object.entries(day.units)) set[`healthUnits.${key}`] = unit;
        }
        if (day.workouts.length || replace) set.workouts = day.workouts;
        await days.updateOne({ date }, { $set: set }, { upsert: true });
        summary.push({ date, metrics: Object.keys(day.health).length, workouts: day.workouts.length });
      }

      return res.json({ success: true, source: 'health-auto-export', mode: replace ? 'replace' : 'merge', days: summary });
    }

    const { date, health } = (req.body ?? {}) as { date?: string; health?: Record<string, number | string> };
    if (!isValidDate(date) || !health || typeof health !== 'object' || Array.isArray(health)) {
      return res.status(400).json({ error: 'Expected { date, health } or Health Auto Export payload.' });
    }
    const set: Record<string, unknown> = { healthUpdatedAt: new Date() };
    for (const [key, value] of Object.entries(health)) {
      // Klíč musí být bezpečný pro tečkovou notaci v Mongu.
      const safe = key.replace(/[^a-zA-Z0-9]/g, '');
      if (safe) set[`health.${safe}`] = value;
    }
    await days.updateOne({ date }, { $set: set }, { upsert: true });
    const doc = await days.findOne({ date });
    return res.json({ success: true, date, health: doc?.health ?? null });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
