import { NextApiRequest, NextApiResponse } from 'next';
import { requireAccount } from '../../lib/apiAuth';
import { getEntitlement, hasAccess } from '../../lib/billing';
import { audit, getTenantSecrets } from '../../lib/store';
import {
  claimGeneration,
  failGeneration,
  getActiveTracker,
  getQuestionnaire,
  listTrackerVersions,
  saveTrackerDefinition,
} from '../../lib/tracker/store';
import { FAILURE_MESSAGE, generateTracker } from '../../lib/tracker/generate';
import { minimizeForModel } from '../../lib/questionnaire';
import { advance } from '../../lib/onboarding';
import { enforceRateLimit, requireSameOrigin } from '../../lib/rateLimit';

// Fronta úloh v projektu neexistuje, takže generování běží v tomto požadavku. Souběh hlídá
// zámek v databázi; klient mezitím zobrazuje průběh a dotazuje se na stav.
export const config = {
  api: { responseLimit: false },
  maxDuration: 300,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const account = await requireAccount(req, res);
  if (!account) return;

  const entitlement = await getEntitlement(account.accountId);
  if (!hasAccess(entitlement)) return res.status(403).json({ error: 'Přístup zatím není aktivní.', next: '/app/platba' });
  if (!account.tenantId) return res.status(500).json({ error: 'Účet nemá workspace.' });

  const tenantId = account.tenantId;
  const secrets = await getTenantSecrets(tenantId);
  if (!secrets) return res.status(500).json({ error: 'Chybí datový klíč.' });

  try {
    if (req.method === 'GET') {
      const [record, tracker, versions] = await Promise.all([
        getQuestionnaire(tenantId, secrets.dek),
        getActiveTracker(tenantId, secrets.dek),
        listTrackerVersions(tenantId),
      ]);
      return res.json({
        status: record.generationStatus,
        error: record.generationError ? FAILURE_MESSAGE[record.generationError] : null,
        retryCount: record.retryCount,
        submitted: Boolean(record.submittedAt),
        versions,
        tracker: tracker
          ? { version: tracker.version, createdAt: tracker.createdAt, definition: tracker.definition }
          : null,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!requireSameOrigin(req, res)) return;
    if (!(await enforceRateLimit(req, res, { key: `gen:${account.accountId}`, max: 10, windowSeconds: 3600 }))) return;

    const claim = await claimGeneration(tenantId);
    if (claim === 'not_submitted') return res.status(400).json({ error: 'Nejdřív odešli dotazník.', next: '/dotaznik' });
    if (claim === 'busy') return res.status(409).json({ error: 'Sestavení už probíhá.', status: 'generating' });

    await advance(account.accountId, 'tracker_queued');
    await advance(account.accountId, 'tracker_generating');

    const record = await getQuestionnaire(tenantId, secrets.dek);
    const result = await generateTracker(minimizeForModel(record.answers));

    if (!result.ok || !result.definition || !result.meta) {
      const category = result.category ?? 'upstream_error';
      await failGeneration(tenantId, category);
      await advance(account.accountId, 'tracker_failed');
      await audit(tenantId, 'tracker.generation_failed', { category });
      // Ven jde jen bezpečná hláška; podrobnosti zůstávají v serverovém logu.
      return res.status(502).json({
        status: 'failed',
        error: FAILURE_MESSAGE[category],
        retryable: Boolean(result.retryable),
      });
    }

    const version = await saveTrackerDefinition(tenantId, secrets.dek, result.definition, result.meta);
    await advance(account.accountId, 'tracker_ready');
    await audit(tenantId, 'tracker.generated', { version, promptVersion: result.meta.promptVersion });

    return res.json({ status: 'completed', version, tracker: result.definition });
  } catch (error) {
    console.error('generování trackeru selhalo:', (error as Error).message);
    await failGeneration(tenantId, 'upstream_error').catch(() => undefined);
    return res.status(500).json({ status: 'failed', error: FAILURE_MESSAGE.upstream_error, retryable: true });
  }
}
