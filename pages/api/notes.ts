import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireWrite } from '../../lib/apiAuth';
import { getDay, saveDay } from '../../lib/store';
import { isValidDate, normalizeEntries, normalizeMetrics, normalizeScales } from '../../lib/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireTenant(req, res);
    if (!ctx) return;
    const { config, dek } = ctx;
    const tenantId = config.id;

    if (req.method === 'GET') {
      const date = String(req.query.date ?? '').trim();
      if (!isValidDate(date)) return res.status(400).json({ error: 'Date (YYYY-MM-DD) is required.' });
      const day = await getDay(tenantId, dek, date);
      // Historická data se normalizují na aktuální model až při čtení.
      return res.json({
        date,
        entries: normalizeEntries(config, day.entries),
        scales: normalizeScales(config, day.scales),
        metrics: normalizeMetrics(config, day.metrics),
        health: day.health,
        healthUnits: day.healthUnits,
        workouts: day.workouts,
      });
    }

    if (req.method === 'POST') {
      if (!requireWrite(ctx, res)) return;
      const { date, entries, scales, metrics } = req.body ?? {};
      if (!isValidDate(date)) return res.status(400).json({ error: 'Date (YYYY-MM-DD) is required.' });
      if (entries === undefined && scales === undefined && metrics === undefined) {
        return res.status(400).json({ error: 'Nothing to save.' });
      }

      const patch: Record<string, unknown> = {};
      if (entries !== undefined) patch.entries = normalizeEntries(config, entries);
      if (scales !== undefined) patch.scales = normalizeScales(config, scales);
      if (metrics !== undefined) patch.metrics = normalizeMetrics(config, metrics);

      const saved = await saveDay(tenantId, dek, date, patch);
      return res.json({
        success: true,
        date,
        entries: entries !== undefined ? saved.entries : undefined,
        scales: scales !== undefined ? saved.scales : undefined,
        metrics: metrics !== undefined ? saved.metrics : undefined,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
