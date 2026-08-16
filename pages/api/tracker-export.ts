import { NextApiRequest, NextApiResponse } from 'next';
import { requireAccount } from '../../lib/apiAuth';
import { getEntitlement, hasAccess } from '../../lib/billing';
import { getTenantSecrets, listDays } from '../../lib/store';
import { getActiveTracker, getTrackerByVersion } from '../../lib/tracker/store';
import { buildTrackerMarkdown } from '../../lib/tracker/markdown';
import type { TrackerDefinition } from '../../lib/tracker/schema';
import type { TrackerDay } from '../../lib/tracker/entry';
import { isValidDate } from '../../lib/schema';
import { enforceRateLimit } from '../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Identita jen ze session – export nikdy nevydá data jiného účtu.
  const account = await requireAccount(req, res);
  if (!account) return;

  const entitlement = await getEntitlement(account.accountId);
  if (!hasAccess(entitlement)) return res.status(403).json({ error: 'Přístup zatím není aktivní.' });
  if (!account.tenantId) return res.status(500).json({ error: 'Účet nemá workspace.' });
  if (!(await enforceRateLimit(req, res, { key: `export:${account.accountId}`, max: 30, windowSeconds: 3600 }))) return;

  const tenantId = account.tenantId;
  const secrets = await getTenantSecrets(tenantId);
  if (!secrets) return res.status(500).json({ error: 'Chybí datový klíč.' });

  const from = String(req.query.from ?? '').trim();
  const to = String(req.query.to ?? '').trim();
  if ((from && !isValidDate(from)) || (to && !isValidDate(to))) {
    return res.status(400).json({ error: 'Neplatný rozsah dat.' });
  }

  try {
    const active = await getActiveTracker(tenantId, secrets.dek);
    if (!active) return res.status(409).json({ error: 'Deník ještě není sestavený.' });

    const rawDays = await listDays(tenantId, secrets.dek, { from, to });
    const days = rawDays
      .filter((d) => d.tracker)
      .map((d) => ({ date: d.date, day: d.tracker as TrackerDay }));

    // Ke každé použité verzi načteme její definici, aby staré dny nesly původní popisky.
    const definitions = new Map<number, TrackerDefinition>([[active.version, active.definition]]);
    for (const version of Array.from(new Set(days.map((d) => d.day?.version).filter(Boolean)))) {
      if (definitions.has(version as number)) continue;
      const stored = await getTrackerByVersion(tenantId, secrets.dek, version as number);
      if (stored) definitions.set(stored.version, stored.definition);
    }

    const markdown = buildTrackerMarkdown({
      definitions,
      activeVersion: active.version,
      days,
      range: { from, to },
    });

    if (String(req.query.preview ?? '') === '1') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(markdown);
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zaznamy-${new Date().toISOString().slice(0, 10)}.md"`);
    return res.send(markdown);
  } catch (error) {
    console.error('export selhal:', (error as Error).message);
    return res.status(500).json({ error: 'Export se nepodařilo připravit.' });
  }
}
