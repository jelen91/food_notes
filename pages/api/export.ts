import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant } from '../../lib/apiAuth';
import { buildMarkdown } from '../../lib/markdown';
import { listDays, listLabs } from '../../lib/store';
import { normalizeEntries, normalizeMetrics, normalizeScales } from '../../lib/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const ctx = await requireTenant(req, res);
    if (!ctx) return;
    const { config, dek } = ctx;
    if (config.modules?.export === false) return res.status(404).json({ error: 'Export není zapnutý.' });

    const from = String(req.query.from ?? '').trim();
    const to = String(req.query.to ?? '').trim();

    const [rawDays, labs] = await Promise.all([
      listDays(config.id, dek, { from, to }),
      config.modules?.labs === false ? Promise.resolve([]) : listLabs(config.id, dek),
    ]);

    const days = rawDays.map((d) => ({
      ...d,
      entries: normalizeEntries(config, d.entries),
      scales: normalizeScales(config, d.scales),
      metrics: normalizeMetrics(config, d.metrics),
    }));

    const markdown = buildMarkdown({ config, days, labs });
    const filename = `denik-${new Date().toISOString().slice(0, 10)}.md`;

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
