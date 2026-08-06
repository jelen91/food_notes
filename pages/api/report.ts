import { NextApiRequest, NextApiResponse } from 'next';
import { getDb, DAYS } from '../../lib/db';
import { normalizeEntries, normalizeScales } from '../../lib/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = await getDb();
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    const filter: Record<string, unknown> = {};
    if (from || to) {
      filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }

    const docs = await db.collection(DAYS).find(filter).sort({ date: 1 }).toArray();
    res.json(
      docs.map((d) => ({
        date: d.date,
        entries: normalizeEntries(d.entries),
        scales: normalizeScales(d.scales),
        health: d.health ?? null,
        healthUnits: d.healthUnits ?? null,
        workouts: d.workouts ?? null,
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
