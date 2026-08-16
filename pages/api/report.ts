import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant } from '../../lib/apiAuth';
import { listDays } from '../../lib/store';
import { normalizeEntries, normalizeMetrics, normalizeScales } from '../../lib/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const ctx = await requireTenant(req, res);
    if (!ctx) return;
    const { config, dek } = ctx;

    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    const days = await listDays(config.id, dek, { from, to });

    res.json(
      days.map((d) => ({
        date: d.date,
        entries: normalizeEntries(config, d.entries),
        scales: normalizeScales(config, d.scales),
        metrics: normalizeMetrics(config, d.metrics),
        health: d.health,
        healthUnits: d.healthUnits,
        workouts: d.workouts,
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
