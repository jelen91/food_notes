import { NextApiRequest, NextApiResponse } from 'next';
import { requireAccount } from '../../lib/apiAuth';
import { getEntitlement, hasAccess } from '../../lib/billing';
import { getDay, getTenantSecrets, saveDay } from '../../lib/store';
import { getActiveTracker, getTrackerByVersion } from '../../lib/tracker/store';
import { emptyDay, missingRequired, normalizeTrackerDay } from '../../lib/tracker/entry';
import { isValidDate } from '../../lib/schema';
import { enforceRateLimit, requireSameOrigin } from '../../lib/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const account = await requireAccount(req, res);
  if (!account) return;

  const entitlement = await getEntitlement(account.accountId);
  if (!hasAccess(entitlement)) return res.status(403).json({ error: 'Přístup k deníku není aktivní. Stav přístupu a případný export najdeš ve svém účtu.', next: '/app/ucet' });
  if (!account.tenantId) return res.status(500).json({ error: 'Účet nemá workspace.' });

  const tenantId = account.tenantId;
  const secrets = await getTenantSecrets(tenantId);
  if (!secrets) return res.status(500).json({ error: 'Chybí datový klíč.' });

  const date = String(req.query.date ?? (req.body ?? {}).date ?? '').trim();
  if (!isValidDate(date)) return res.status(400).json({ error: 'Date (YYYY-MM-DD) is required.' });

  try {
    const active = await getActiveTracker(tenantId, secrets.dek);
    if (!active) return res.status(409).json({ error: 'Deník ještě není sestavený.', next: '/app/tracker' });

    if (req.method === 'GET') {
      const day = await getDay(tenantId, secrets.dek, date);
      const stored: any = day.tracker ?? null;

      // Den zapsaný starší verzí se zobrazuje podle definice své verze, ne podle aktuální.
      const version = stored?.version ?? active.version;
      const definition =
        version === active.version ? active.definition : (await getTrackerByVersion(tenantId, secrets.dek, version))?.definition;

      return res.json({
        date,
        activeVersion: active.version,
        definition: definition ?? active.definition,
        // Chybějící definice staré verze by neměla zablokovat čtení – radši ukážeme aktuální.
        definitionVersion: definition ? version : active.version,
        day: stored ?? emptyDay(active.version),
        outdated: Boolean(stored) && version !== active.version,
      });
    }

    if (req.method === 'POST') {
      if (!requireSameOrigin(req, res)) return;
      if (!(await enforceRateLimit(req, res, { key: `day:${account.accountId}`, max: 300, windowSeconds: 3600 }))) return;

      const day = await getDay(tenantId, secrets.dek, date);
      const stored: any = day.tracker ?? null;
      const version = stored?.version ?? active.version;
      // Zapisuje se vždy proti definici, podle které den vznikl – přegenerování trackeru
      // nesmí přepsat ani zahodit starší záznamy.
      const definition =
        version === active.version
          ? active.definition
          : (await getTrackerByVersion(tenantId, secrets.dek, version))?.definition ?? active.definition;

      const normalized = normalizeTrackerDay(definition, version, (req.body ?? {}).day);
      const missing = missingRequired(definition, normalized);
      if ((req.body ?? {}).complete && missing.length) {
        return res.status(400).json({ error: 'Vyplň prosím povinná pole.', missing });
      }

      await saveDay(tenantId, secrets.dek, date, { tracker: normalized });
      return res.json({ success: true, day: normalized, missing });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('denní záznam selhal:', (error as Error).message);
    return res.status(500).json({ error: 'Uložení se nepodařilo.' });
  }
}
