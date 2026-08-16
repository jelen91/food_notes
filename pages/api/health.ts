import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant } from '../../lib/apiAuth';
import { parseHealthAutoExport } from '../../lib/health';
import { findTenantByHealthKey, getDay, getTenantSecrets, saveDay } from '../../lib/store';
import { isValidDate } from '../../lib/schema';

// Health Auto Export umí poslat větší payload než výchozí 1 MB limit Next.js.
export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const ctx = await requireTenant(req, res);
      if (!ctx) return;
      const date = String(req.query.date ?? '').trim();
      if (!isValidDate(date)) return res.status(400).json({ error: 'Date (YYYY-MM-DD) is required.' });
      const day = await getDay(ctx.config.id, ctx.dek, date);
      return res.json({ date, health: day.health, healthUnits: day.healthUnits, workouts: day.workouts });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Zákazník se pozná podle svého klíče v hlavičce – každá aplikace má vlastní.
    const provided = req.headers['x-health-key'];
    const key = Array.isArray(provided) ? provided[0] : provided;
    if (!key) return res.status(401).json({ error: 'Unauthorized' });
    const tenantId = await findTenantByHealthKey(String(key));
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });
    const secrets = await getTenantSecrets(tenantId);
    if (!secrets) return res.status(500).json({ error: 'Chybí datový klíč.' });

    const parsed = parseHealthAutoExport(req.body);
    if (!parsed) {
      const { date, health } = (req.body ?? {}) as { date?: string; health?: Record<string, number | string> };
      if (!isValidDate(date) || !health || typeof health !== 'object' || Array.isArray(health)) {
        return res.status(400).json({ error: 'Expected { date, health } or Health Auto Export payload.' });
      }
      const day = await getDay(tenantId, secrets.dek, date);
      const merged = { ...(day.health ?? {}) } as Record<string, number>;
      for (const [k, v] of Object.entries(health)) {
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        if (Number.isFinite(n)) merged[k.replace(/[^a-zA-Z0-9]/g, '')] = n;
      }
      await saveDay(tenantId, secrets.dek, date, { health: merged });
      return res.json({ success: true, date, metrics: Object.keys(merged).length });
    }

    // Výchozí je slučování: HAE může posílat různé metriky v různých automatizacích.
    // ?replace=1 nahradí celý denní snímek.
    const replace = String(req.query.replace ?? '') === '1';
    const summary: Array<{ date: string; metrics: number; workouts: number }> = [];

    for (const [date, incoming] of Object.entries(parsed)) {
      const day = await getDay(tenantId, secrets.dek, date);
      const health = replace ? incoming.health : { ...(day.health ?? {}), ...incoming.health };
      const healthUnits = replace ? incoming.units : { ...(day.healthUnits ?? {}), ...incoming.units };
      const workouts = incoming.workouts.length || replace ? incoming.workouts : day.workouts;
      await saveDay(tenantId, secrets.dek, date, { health, healthUnits, workouts });
      summary.push({ date, metrics: Object.keys(incoming.health).length, workouts: incoming.workouts.length });
    }

    return res.json({ success: true, source: 'health-auto-export', mode: replace ? 'replace' : 'merge', days: summary });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
