import { NextApiRequest, NextApiResponse } from 'next';
import { getDb, DAYS, LABS } from '../../lib/db';
import { buildMarkdown } from '../../lib/markdown';
import { DayDoc, LabDoc, normalizeEntries, normalizeScales } from '../../lib/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = await getDb();
    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();
    const filter: Record<string, unknown> = {};
    if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

    const [dayDocs, labDocs] = await Promise.all([
      db.collection(DAYS).find(filter).sort({ date: 1 }).toArray(),
      db.collection(LABS).find({}, { projection: { data: 0 } }).sort({ date: 1 }).toArray(),
    ]);

    const days: DayDoc[] = dayDocs.map((d) => ({
      date: d.date,
      entries: normalizeEntries(d.entries),
      scales: normalizeScales(d.scales),
      health: d.health ?? null,
      healthUnits: d.healthUnits ?? null,
      workouts: d.workouts ?? null,
    }));
    const labs: LabDoc[] = labDocs.map((l) => ({
      date: l.date,
      meta: l.meta ?? {},
      values: l.values ?? [],
      filename: l.filename ?? null,
      size: l.size ?? null,
      uploadedAt: l.uploadedAt ?? null,
    }));

    const markdown = buildMarkdown({ days, labs });
    const filename = `zdravotni-denik-${new Date().toISOString().slice(0, 10)}.md`;

    if (String(req.query.preview ?? '') === '1') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(markdown);
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(markdown);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
