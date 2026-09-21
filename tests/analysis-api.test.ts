import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../pages/api/journal-analysis';
import { ANALYSIS_CONSENT_VERSION, createAnalysisConsent } from '../lib/analysis/consent';
import { prepareJournal, buildAnalysisInput } from '../lib/analysis/input';
import { analysisDefinition, analysisReport, entitlement, journalRecords, paidAt } from './analysis-fixtures';
import { PURCHASE_POLICY_VERSION, purchaseDeadlines } from '../lib/purchase-policy';

const mocks = vi.hoisted(() => ({
  requireAccount: vi.fn(), getEntitlement: vi.fn(), getTenantSecrets: vi.fn(),
  requireSameOrigin: vi.fn(), enforceRateLimit: vi.fn(), loadJournal: vi.fn(),
  getAnalysis: vi.fn(), claimAnalysis: vi.fn(), completeAnalysis: vi.fn(), failAnalysis: vi.fn(),
  generateAnalysis: vi.fn(), isAnalysisConfigured: vi.fn(),
}));
vi.mock('../lib/apiAuth', () => ({ requireAccount: mocks.requireAccount }));
vi.mock('../lib/billing', async (original) => ({ ...await original<object>(), getEntitlement: mocks.getEntitlement }));
vi.mock('../lib/store', () => ({ getTenantSecrets: mocks.getTenantSecrets }));
vi.mock('../lib/rateLimit', () => ({ requireSameOrigin: mocks.requireSameOrigin, enforceRateLimit: mocks.enforceRateLimit }));
vi.mock('../lib/analysis/store', () => ({ getAnalysis: mocks.getAnalysis, claimAnalysis: mocks.claimAnalysis, completeAnalysis: mocks.completeAnalysis, failAnalysis: mocks.failAnalysis }));
vi.mock('../lib/analysis/input', async (original) => ({ ...await original<object>(), loadJournal: mocks.loadJournal }));
vi.mock('../lib/analysis/generate', async (original) => ({ ...await original<object>(), generateAnalysis: mocks.generateAnalysis, isAnalysisConfigured: mocks.isAnalysisConfigured }));

const now = new Date('2026-09-12T12:00:00Z');
const dek = Buffer.alloc(32, 9);
const journal = prepareJournal(journalRecords(), new Map([[1, analysisDefinition]]), paidAt, now);
const { input } = buildAnalysisInput(journal);
const validBody = { consent: true, consentVersion: ANALYSIS_CONSENT_VERSION };
let stored: any;

function response() {
  const res: any = { code: 200, body: undefined, setHeader: vi.fn() };
  res.status = vi.fn((code: number) => { res.code = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; return res; });
  return res;
}
async function request(method = 'GET', body: unknown = undefined) {
  const res = response();
  await handler({ method, body, cookies: {}, headers: {}, query: { t: 'someone_else' } } as any, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); stored = null;
  mocks.requireAccount.mockResolvedValue({ accountId: 'acc_test', tenantId: 'tenant_test', status: 'active' });
  mocks.getEntitlement.mockResolvedValue(entitlement);
  mocks.getTenantSecrets.mockResolvedValue({ dek });
  mocks.requireSameOrigin.mockReturnValue(true); mocks.enforceRateLimit.mockResolvedValue(true);
  mocks.loadJournal.mockResolvedValue(journal);
  mocks.getAnalysis.mockImplementation(async () => stored);
  mocks.isAnalysisConfigured.mockReturnValue(true);
  mocks.claimAnalysis.mockImplementation(async (_accountId, _tenantId, _dek, consent, coverage) => {
    stored = { status: 'generating', requestId: 'request_test', leaseUntil: new Date(now.getTime() + 360000), payload: { consent, coverage } };
    return 'request_test';
  });
  mocks.completeAnalysis.mockImplementation(async (_accountId, _tenantId, _dek, _requestId, payload) => {
    stored = { ...stored, status: 'completed', completedAt: now, payload }; return true;
  });
  mocks.failAnalysis.mockImplementation(async (_accountId, _tenantId, _requestId, failure) => {
    stored = { ...stored, status: 'failed', failure };
  });
  mocks.generateAnalysis.mockResolvedValue({ ok: true, report: analysisReport, meta: { model: 'mock', promptVersion: 1, schemaVersion: 1, durationMs: 1 } });
});
afterEach(() => vi.useRealTimers());

describe('server-authorized, consensual one-time journal analysis', () => {
  it('denies anonymous callers before loading any diary', async () => {
    mocks.requireAccount.mockImplementation(async (_req, res) => { res.status(401).json({ error: 'Přihlášení.' }); return null; });
    expect((await request()).code).toBe(401);
    expect(mocks.loadJournal).not.toHaveBeenCalled(); expect(mocks.generateAnalysis).not.toHaveBeenCalled();
  });
  it('uses only the authenticated account workspace, ignoring query and body identifiers', async () => {
    const res = await request('POST', { ...validBody, accountId: 'acc_other', tenantId: 'tenant_other', acceptedAt: '1999-01-01' });
    expect(res.code).toBe(200); expect(res.body.status).toBe('completed');
    expect(mocks.loadJournal).toHaveBeenCalledWith('tenant_test', dek, paidAt, now);
    expect(mocks.claimAnalysis).toHaveBeenCalledWith('acc_test', 'tenant_test', dek, createAnalysisConsent(now), input.coverage, now);
    expect(mocks.completeAnalysis.mock.calls[0][4].consent.acceptedAt).toBe(now.toISOString());
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store, max-age=0');
  });
  it('requires an active paid purchase, 21 elapsed days and 21 actual dates even if the client claims eligibility', async () => {
    mocks.getEntitlement.mockResolvedValue({ ...entitlement, kind: 'manual' });
    expect((await request('POST', validBody)).code).toBe(403);
    expect(mocks.loadJournal).not.toHaveBeenCalled();
    mocks.getEntitlement.mockResolvedValue({ ...entitlement, paidAt: new Date('2026-09-01T12:00:00Z') });
    expect((await request('POST', { ...validBody, eligible: true })).body.status).toBe('locked');
    mocks.getEntitlement.mockResolvedValue(entitlement);
    mocks.loadJournal.mockResolvedValue({ ...journal, days: journal.days.slice(0, 20) });
    expect((await request('POST', validBody)).body.eligibility.remainingDays).toBe(1);
    expect(mocks.generateAnalysis).not.toHaveBeenCalled();
  });
  it('does not transmit health data without current separate analysis consent', async () => {
    for (const body of [{}, { consent: 'true', consentVersion: ANALYSIS_CONSENT_VERSION }, { consent: true, consentVersion: 'questionnaire-consent' }]) {
      const res = await request('POST', body); expect(res.code).toBe(400);
    }
    expect(mocks.claimAnalysis).not.toHaveBeenCalled(); expect(mocks.generateAnalysis).not.toHaveBeenCalled();
  });
  it('GET is resumable and never generates or consumes the analysis', async () => {
    expect((await request()).body.status).toBe('ready');
    stored = { status: 'generating', requestId: 'req', leaseUntil: new Date(now.getTime() + 60000), payload: { consent: createAnalysisConsent(now), coverage: input.coverage } };
    expect((await request()).body.status).toBe('generating');
    stored.leaseUntil = new Date(now.getTime() - 1);
    const res = await request(); expect(res.body.status).toBe('failed'); expect(res.body.retryable).toBe(true);
    expect(mocks.generateAnalysis).not.toHaveBeenCalled(); expect(mocks.claimAnalysis).not.toHaveBeenCalled();
  });
  it('reuses persisted success on GET and repeated POST with no further model call or consent demand', async () => {
    await request('POST', validBody);
    mocks.loadJournal.mockRejectedValue(new Error('The current diary cannot be read'));
    const get = await request(); const post = await request('POST', {});
    expect(get.body.report).toEqual(analysisReport); expect(post.body.report).toEqual(analysisReport);
    expect(get.body.eligibility.recordedDays).toBe(21);
    expect(mocks.loadJournal).toHaveBeenCalledTimes(1);
    expect(mocks.generateAnalysis).toHaveBeenCalledTimes(1);
  });
  it('does not consume entitlement on provider failure and allows a fresh retry', async () => {
    mocks.generateAnalysis.mockResolvedValueOnce({ ok: false, failure: 'timeout' });
    const failed = await request('POST', validBody);
    expect(failed.code).toBe(502); expect(failed.body.status).toBe('failed'); expect(failed.body.retryable).toBe(true);
    expect(mocks.completeAnalysis).not.toHaveBeenCalled();
    expect((await request('POST', validBody)).body.status).toBe('completed');
  });
  it('allows only saved report retrieval in the 30-day export grace period', async () => {
    await request('POST', validBody);
    const expiredPurchase = { ...entitlement, purchasePolicyVersion: PURCHASE_POLICY_VERSION, ...purchaseDeadlines(paidAt) };
    mocks.getEntitlement.mockResolvedValue(expiredPurchase);
    vi.setSystemTime(expiredPurchase.accessUntil);
    mocks.loadJournal.mockClear(); mocks.generateAnalysis.mockClear();
    const get = await request();
    expect(get.body.status).toBe('completed');
    expect(get.body.report).toEqual(analysisReport);
    expect(get.body.eligibility.eligible).toBe(false);
    expect((await request('POST', validBody)).code).toBe(403);
    expect(mocks.loadJournal).not.toHaveBeenCalled();
    expect(mocks.generateAnalysis).not.toHaveBeenCalled();
    vi.setSystemTime(expiredPurchase.exportUntil);
    expect((await request()).body.status).toBe('locked');
  });
  it('does not prepare journal input or start analysis for an expired purchase without a saved report', async () => {
    const expiredPurchase = { ...entitlement, purchasePolicyVersion: PURCHASE_POLICY_VERSION, ...purchaseDeadlines(paidAt) };
    mocks.getEntitlement.mockResolvedValue(expiredPurchase);
    vi.setSystemTime(expiredPurchase.accessUntil);
    expect((await request()).body.status).toBe('locked');
    expect((await request('POST', validBody)).code).toBe(403);
    expect(mocks.loadJournal).not.toHaveBeenCalled();
    expect(mocks.claimAnalysis).not.toHaveBeenCalled();
    expect(mocks.generateAnalysis).not.toHaveBeenCalled();
  });
  it('rechecks access after generation when a refund happened during the model request', async () => {
    mocks.generateAnalysis.mockImplementationOnce(async () => {
      mocks.getEntitlement.mockResolvedValue({ ...entitlement, status: 'revoked', revokedReason: 'refunded', revokedAt: now });
      return { ok: true, report: analysisReport, meta: { model: 'mock', promptVersion: 1, schemaVersion: 1, durationMs: 1 } };
    });
    const post = await request('POST', validBody);
    expect(post.code).toBe(403);
    expect(post.body.report).toBeUndefined();
    expect(post.body.status).toBe('locked');
    // The saved result remains part of the customer's data export for only 30 days.
    expect((await request()).body.report).toEqual(analysisReport);
    vi.setSystemTime(new Date(now.getTime() + 30 * 86400000));
    expect((await request()).body.report).toBeUndefined();
  });
  it('handles not-configured and denied same-origin/rate-limit without model calls', async () => {
    mocks.isAnalysisConfigured.mockReturnValue(false);
    expect((await request()).body.status).toBe('not_configured');
    expect((await request('POST', validBody)).code).toBe(503);
    mocks.isAnalysisConfigured.mockReturnValue(true);
    mocks.requireSameOrigin.mockImplementation((_req, res) => { res.status(403).json({ error: 'Původ.' }); return false; });
    expect((await request('POST', validBody)).code).toBe(403);
    mocks.requireSameOrigin.mockReturnValue(true);
    mocks.enforceRateLimit.mockImplementation(async (_req, res) => { res.status(429).json({ error: 'Limit.' }); return false; });
    expect((await request('POST', validBody)).code).toBe(429);
    expect(mocks.generateAnalysis).not.toHaveBeenCalled();
  });
  it('never returns raw storage errors that may contain private diary text', async () => {
    mocks.loadJournal.mockRejectedValue(new Error('patient_secret_from_storage'));
    const res = await request(); expect(res.code).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('patient_secret');
  });
});
