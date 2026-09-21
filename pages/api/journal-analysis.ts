import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAccount } from '../../lib/apiAuth';
import { canExport, getEntitlement, hasAccess } from '../../lib/billing';
import { getTenantSecrets } from '../../lib/store';
import { enforceRateLimit, requireSameOrigin } from '../../lib/rateLimit';
import { analysisEligibility, purchaseDate, REQUIRED_DAYS } from '../../lib/analysis/eligibility';
import { loadJournal, buildAnalysisInput } from '../../lib/analysis/input';
import { createAnalysisConsent, hasAnalysisConsent } from '../../lib/analysis/consent';
import { claimAnalysis, completeAnalysis, failAnalysis, getAnalysis } from '../../lib/analysis/store';
import { ANALYSIS_FAILURE_MESSAGES, generateAnalysis, isAnalysisConfigured } from '../../lib/analysis/generate';
import { analysisResponse } from '../../lib/analysis/response';

// Generation remains in the POST request. The browser may leave and recover the
// state with GET; a crashed request can be retried after its server lease expires.
export const config = { api: { bodyParser: { sizeLimit: '2kb' } }, maxDuration: 300 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Nepodporovaná metoda.' });
  }
  let claimed: { accountId: string; tenantId: string; requestId: string } | null = null;
  try {
    const account = await requireAccount(req, res);
    if (!account) return;
    if (req.method === 'POST' && !requireSameOrigin(req, res)) return;

    const now = new Date();
    const entitlement = await getEntitlement(account.accountId);
    const activeAccess = hasAccess(entitlement, now);
    // Refunds end model access, while owners may still download an existing report
    // during the explicitly bounded data-export period.
    const exportOnly = req.method === 'GET' && !activeAccess && canExport(entitlement, now);
    const paidAt = purchaseDate(exportOnly ? { ...entitlement, status: 'active' } : entitlement);
    if (!paidAt) return res.status(req.method === 'POST' ? 403 : 200).json({
      ...analysisResponse(analysisEligibility(entitlement, [], now), null, isAnalysisConfigured(), now),
      error: entitlement?.kind === 'purchase' && entitlement.status === 'revoked'
        ? 'Přístup k deníku byl ukončen. Dostupnost exportu najdeš ve svém účtu.'
        : 'Jedno AI vyhodnocení je součástí zaplaceného osobního deníku.',
    });
    if (!activeAccess && (req.method === 'POST' || !canExport(entitlement, now))) {
      return res.status(req.method === 'POST' ? 403 : 200).json({
        ...analysisResponse(analysisEligibility(entitlement, [], now), null, isAnalysisConfigured(), now),
        error: 'Přístup k deníku není aktivní. Nové AI vyhodnocení už není dostupné.',
      });
    }
    if (!account.tenantId) return res.status(409).json({ error: 'Nejdřív dokonči sestavení osobního deníku.' });
    const tenantId = account.tenantId;
    const secrets = await getTenantSecrets(tenantId);
    if (!secrets) return res.status(503).json({ error: 'Deník teď nelze otevřít. Zkus to prosím později.' });

    const record = await getAnalysis(account.accountId, tenantId, secrets.dek);
    if (record?.status === 'completed' ||
        (activeAccess && record?.status === 'generating' && new Date(record.leaseUntil).getTime() > now.getTime())) {
      // This exact count was computed by our server for the claimed snapshot.
      // Polls and saved reports do not need the current journal or its definitions
      // (which may since have changed, been cleared or become unreadable).
      const snapshotEligibility = analysisEligibility(entitlement, [], now);
      snapshotEligibility.recordedDays = record.payload.coverage.eligibleDays;
      snapshotEligibility.remainingDays = Math.max(0, REQUIRED_DAYS - snapshotEligibility.recordedDays);
      snapshotEligibility.eligible = activeAccess && snapshotEligibility.elapsedDays >= REQUIRED_DAYS && snapshotEligibility.remainingDays === 0;
      return res.status(req.method === 'POST' && record.status === 'generating' ? 202 : 200).json(
        analysisResponse(snapshotEligibility, record, isAnalysisConfigured(), now)
      );
    }
    // Expired accounts may retrieve an already saved report in the export grace
    // period, but may never load new model input or start another generation.
    if (!activeAccess) return res.json({
      ...analysisResponse(analysisEligibility(entitlement, [], now), null, isAnalysisConfigured(), now),
      error: 'Zaplacená doba přístupu skončila. K dispozici zůstává pouze export již uložených dat.',
    });
    const journal = await loadJournal(tenantId, secrets.dek, paidAt, now);
    const eligibility = analysisEligibility(entitlement, journal.days.map((day) => day.date), now);
    const prepared = eligibility.eligible ? buildAnalysisInput(journal) : null;
    const response = analysisResponse(eligibility, record, isAnalysisConfigured(), now, prepared?.input?.coverage);
    if (req.method === 'GET') {
      if (prepared?.error === 'input_too_large' && (response.status === 'ready' || response.status === 'failed')) {
        response.status = 'failed'; response.error = ANALYSIS_FAILURE_MESSAGES.input_too_large; response.retryable = false;
      }
      return res.json(response);
    }
    if (!eligibility.eligible) return res.status(409).json(response);
    if (!isAnalysisConfigured()) return res.status(503).json(response);
    if (!hasAnalysisConsent(req.body)) return res.status(400).json({
      ...response, error: 'Před vyhodnocením potvrď aktuální souhlas se zpracováním deníku pomocí AI.',
    });
    if (!prepared?.input) return res.status(422).json({
      ...response, status: 'failed', error: ANALYSIS_FAILURE_MESSAGES.input_too_large, retryable: false,
    });
    if (!(await enforceRateLimit(req, res, { key: `analysis:${account.accountId}`, max: 4, windowSeconds: 3600 }))) return;

    const consent = createAnalysisConsent(new Date());
    const input = prepared.input;
    const requestId = await claimAnalysis(account.accountId, tenantId, secrets.dek, consent, input.coverage, new Date());
    if (!requestId) {
      const latest = await getAnalysis(account.accountId, tenantId, secrets.dek);
      if (!latest) return res.status(409).json({ error: 'Stav účtu se změnil. Obnov prosím stránku.' });
      return res.status(latest?.status === 'completed' ? 200 : 202).json(
        analysisResponse(eligibility, latest, isAnalysisConfigured(), new Date(), input.coverage)
      );
    }
    claimed = { accountId: account.accountId, tenantId, requestId };
    const result = await generateAnalysis(input);
    if (!result.ok || !result.report || !result.meta) {
      await failAnalysis(account.accountId, tenantId, requestId, result.failure ?? 'upstream_error', new Date());
      const latest = await getAnalysis(account.accountId, tenantId, secrets.dek);
      if (!latest) return res.status(409).json({ error: 'Stav účtu se změnil. Obnov prosím stránku.' });
      return res.status(latest?.status === 'completed' ? 200 : 502).json(
        analysisResponse(eligibility, latest, isAnalysisConfigured(), new Date(), input.coverage)
      );
    }
    const saved = await completeAnalysis(account.accountId, tenantId, secrets.dek, requestId,
      { consent, coverage: input.coverage, report: result.report }, result.meta, new Date());
    // Payment can be refunded while the model is working. Persist the completed
    // snapshot for allowed export, but never deliver it from a now-revoked POST.
    const currentEntitlement = await getEntitlement(account.accountId);
    const completedNow = new Date();
    if (!hasAccess(currentEntitlement, completedNow)) return res.status(403).json({
      ...analysisResponse(analysisEligibility(currentEntitlement, [], completedNow), null, isAnalysisConfigured(), completedNow),
      error: 'Přístup se během vyhodnocení změnil. Dostupnost uloženého výsledku a exportu najdeš ve svém účtu.',
    });
    const latest = await getAnalysis(account.accountId, tenantId, secrets.dek);
    if (!latest) return res.status(409).json({ error: 'Stav účtu se změnil. Obnov prosím stránku.' });
    return res.status(saved || latest.status === 'completed' ? 200 : 202).json(
      analysisResponse(eligibility, latest, isAnalysisConfigured(), new Date(), input.coverage)
    );
  } catch {
    // Do not include exception messages: they may contain journal or model data.
    if (claimed) await failAnalysis(claimed.accountId, claimed.tenantId, claimed.requestId, 'upstream_error', new Date()).catch(() => undefined);
    return res.status(503).json({ error: 'Vyhodnocení teď nelze načíst. Obnov prosím stránku nebo to zkus později.' });
  }
}
