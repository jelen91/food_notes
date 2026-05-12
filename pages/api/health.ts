import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri!);

// Health Auto Export umí poslat větší payload než výchozí 1 MB limit Next.js.
export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' },
  },
};

// Volné pole - cokoli (kalorie, cvičení, spánek, kroky, tep, ...)
type Health = Record<string, number | string>;

// Mapování názvů metrik z aplikace "Health Auto Export" na naše klíče.
const HAE_METRIC_MAP: Record<string, string> = {
  step_count: 'steps',
  active_energy: 'activeEnergy',
  basal_energy_burned: 'restingEnergy',
  apple_exercise_time: 'exerciseMinutes',
  apple_stand_time: 'standMinutes',
  apple_stand_hour: 'standHours',
  walking_running_distance: 'distanceKm',
  heart_rate: 'heartRateAvg',
  resting_heart_rate: 'restingHeartRate',
  walking_heart_rate_average: 'walkingHeartRate',
  heart_rate_variability: 'hrv',
  respiratory_rate: 'respiratoryRate',
  blood_oxygen_saturation: 'bloodOxygen',
  weight_body_mass: 'weightKg',
  body_fat_percentage: 'bodyFatPct',
  sleep_analysis: 'sleepHours',
};

function camelCase(s: string) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// "2026-05-12 00:00:00 +0200" / "2026-05-12T..." -> "2026-05-12"
function toDateKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// Health Auto Export posílá { data: { metrics: [ { name, units, data: [ { date, qty | Avg | asleep ... } ] } ] } }
// Vrátí mapu { "YYYY-MM-DD": { klíč: hodnota, ... } }.
function parseHealthAutoExport(body: any): Record<string, Health> | null {
  const metrics = body?.data?.metrics;
  if (!Array.isArray(metrics)) return null;
  const byDate: Record<string, Health> = {};
  for (const metric of metrics) {
    const rawName = String(metric?.name ?? '');
    if (!rawName || !Array.isArray(metric?.data)) continue;
    const key = HAE_METRIC_MAP[rawName] ?? camelCase(rawName);
    for (const point of metric.data) {
      const dateKey = toDateKey(point?.date);
      if (!dateKey) continue;
      // Spánek: HAE dává { asleep, inBed, ... } v hodinách; tep: { Avg, Min, Max }.
      let value =
        num(point?.qty) ??
        num(point?.Avg) ??
        num(point?.asleep) ??
        num(point?.totalSleep) ??
        num(point?.value);
      if (value == null) continue;
      if (!byDate[dateKey]) byDate[dateKey] = {};
      byDate[dateKey][key] = value;
    }
  }
  return Object.keys(byDate).length ? byDate : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!mongoUri) {
    return res.status(500).json({ error: 'Missing MONGODB_URI' });
  }

  try {
    await client.connect();
    const db = client.db('food_notes');
    const notes = db.collection('daily_notes');

    if (req.method === 'GET') {
      const date = String(req.query.date ?? '').trim();
      if (!date) {
        return res.status(400).json({ error: 'Date is required.' });
      }
      const note = await notes.findOne({ date });
      res.json({ date, health: note?.health ?? null });
      return;
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Tělo může přijít ve dvou tvarech:
    // 1) { date, health: {...} }  — jednoduchý vlastní formát (Apple Shortcut)
    // 2) { data: { metrics: [...] } }  — formát aplikace Health Auto Export
    const haeByDate = parseHealthAutoExport(req.body);
    if (haeByDate) {
      const dates = Object.keys(haeByDate);
      for (const date of dates) {
        // sloučit s případnými už uloženými health daty pro ten den
        const existing = await notes.findOne({ date });
        const merged = { ...(existing?.health ?? {}), ...haeByDate[date] };
        await notes.updateOne(
          { date },
          { $set: { health: merged, healthUpdatedAt: new Date() } },
          { upsert: true }
        );
      }
      return res.json({ success: true, source: 'health-auto-export', days: dates });
    }

    const { date, health } = req.body as { date?: string; health?: Health };
    if (!date || !health || typeof health !== 'object' || Array.isArray(health)) {
      return res.status(400).json({ error: 'Expected { date, health } or Health Auto Export payload.' });
    }
    const existing = await notes.findOne({ date });
    const merged = { ...(existing?.health ?? {}), ...health };
    await notes.updateOne(
      { date },
      { $set: { health: merged, healthUpdatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true, date, health: merged });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
