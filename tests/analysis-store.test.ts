import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimAnalysis, completeAnalysis, failAnalysis, getAnalysis, ANALYSIS_LEASE_MS } from '../lib/analysis/store';
import { createAnalysisConsent } from '../lib/analysis/consent';
import { buildAnalysisInput, prepareJournal } from '../lib/analysis/input';
import { analysisResponse } from '../lib/analysis/response';
import { analysisEligibility } from '../lib/analysis/eligibility';
import { deleteAccountData } from '../lib/accountDeletion';
import { analysisDefinition, analysisReport, entitlement, journalRecords, paidAt } from './analysis-fixtures';

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), updateOne: vi.fn(), insertOne: vi.fn(), findOne: vi.fn(), deleteMany: vi.fn(), replaceOne: vi.fn() }));
vi.mock('../lib/db', () => ({
  getDb: mocks.getDb, JOURNAL_ANALYSES: 'journal_analyses', ACCOUNTS: 'accounts',
  AUTH_TOKENS: 'auth_tokens', CHECKOUT_SESSIONS: 'checkout_sessions', DAYS: 'days',
  ENTITLEMENTS: 'entitlements', LABS: 'labs', QUESTIONNAIRES: 'questionnaires',
  TENANTS: 'tenants', TRACKERS: 'trackers', USERS: 'users',
  REFUND_REQUESTS: 'refund_requests', WITHDRAWAL_REQUESTS: 'withdrawal_requests',
}));
vi.mock('../lib/store', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));

let docs = new Map<string, any>();
const dek = Buffer.alloc(32, 8);
const now = new Date('2026-09-12T12:00:00Z');
const tenantId = 'tenant_test';
const accountId = 'acc_test';
const { input } = buildAnalysisInput(prepareJournal(journalRecords(), new Map([[1, analysisDefinition]]), paidAt, now));
const meta = { model: 'mock', promptVersion: 1, schemaVersion: 1, durationMs: 1 };
const consent = createAnalysisConsent(now);
const payload = { consent, coverage: input.coverage, report: analysisReport };

function matches(doc: any, filter: any): boolean {
  return Boolean(doc) && Object.entries(filter).every(([key, value]: [string, any]) => {
    if (key === '$or') return value.some((f: any) => matches(doc, f));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('$gt' in value) return doc[key] > value.$gt;
      if ('$lte' in value) return doc[key] <= value.$lte;
    }
    return doc[key] === value;
  });
}

beforeEach(() => {
  vi.clearAllMocks(); docs = new Map();
  mocks.findOne.mockImplementation(async (filter) => Array.from(docs.values()).find((doc) => matches(doc, filter)) ?? null);
  mocks.insertOne.mockImplementation(async (doc) => {
    if (docs.has(doc._id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    docs.set(doc._id, doc); return { insertedId: doc._id };
  });
  mocks.updateOne.mockImplementation(async (filter, update) => {
    const doc = Array.from(docs.values()).find((d) => matches(d, filter));
    if (!doc) return { modifiedCount: 0 };
    Object.assign(doc, update.$set);
    for (const key of Object.keys(update.$unset ?? {})) delete doc[key];
    return { modifiedCount: 1 };
  });
  mocks.deleteMany.mockImplementation(async (filter) => {
    let deletedCount = 0;
    for (const doc of Array.from(docs.values())) if (matches(doc, filter)) { docs.delete(doc._id); deletedCount += 1; }
    return { deletedCount };
  });
  mocks.replaceOne.mockImplementation(async (filter, replacement, options) => {
    const existing = Array.from(docs.values()).find((d) => matches(d, filter));
    if (!existing && !options?.upsert) return { modifiedCount: 0 };
    docs.set(replacement._id, replacement); return { modifiedCount: 1 };
  });
  mocks.getDb.mockResolvedValue({ collection: (name: string) => {
    if (name === 'journal_analyses') return mocks;
    if (name === 'accounts') return { findOne: async () => ({ accountId, tenantId, status: 'active' }), updateOne: async () => ({ modifiedCount: 1 }) };
    return { deleteMany: async () => ({ deletedCount: 0 }), deleteOne: async () => ({ deletedCount: 1 }), countDocuments: async () => 0 };
  } });
});

describe('one successful analysis per account, encrypted and atomically reserved', () => {
  it('grants one claim under concurrent requests and never claims a completed account again', async () => {
    const claims = await Promise.all(Array.from({ length: 8 }, () => claimAnalysis(accountId, tenantId, dek, consent, input.coverage, now)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    const id = claims.find(Boolean)!;
    expect(await completeAnalysis(accountId, tenantId, dek, id, payload, meta, now)).toBe(true);
    expect(await claimAnalysis(accountId, tenantId, dek, consent, input.coverage, new Date(now.getTime() + 86400000))).toBeNull();
    expect((await getAnalysis(accountId, tenantId, dek)).payload.report).toEqual(analysisReport);
  });
  it('preserves unused entitlement on failure and safely retries under a fresh request ID', async () => {
    const first = await claimAnalysis(accountId, tenantId, dek, consent, input.coverage, now);
    await failAnalysis(accountId, tenantId, first, 'timeout', now);
    const second = await claimAnalysis(accountId, tenantId, dek, consent, input.coverage, now);
    expect(second).toBeTruthy(); expect(second).not.toBe(first);
    expect(await completeAnalysis(accountId, tenantId, dek, first, payload, meta, now)).toBe(false);
    expect(await completeAnalysis(accountId, tenantId, dek, second, payload, meta, now)).toBe(true);
  });
  it('allows lease takeover but rejects stale success and stale failure', async () => {
    const first = await claimAnalysis(accountId, tenantId, dek, consent, input.coverage, now);
    const later = new Date(now.getTime() + ANALYSIS_LEASE_MS + 1);
    const status = analysisResponse(analysisEligibility(entitlement, journalRecords().map((r) => r.date), now), await getAnalysis(accountId, tenantId, dek), true, later);
    expect(status.status).toBe('failed'); expect(status.retryable).toBe(true);
    const second = await claimAnalysis(accountId, tenantId, dek, createAnalysisConsent(later), input.coverage, later);
    expect(await completeAnalysis(accountId, tenantId, dek, first, payload, meta, later)).toBe(false);
    await failAnalysis(accountId, tenantId, first, 'timeout', later);
    expect((await getAnalysis(accountId, tenantId, dek)).requestId).toBe(second);
    expect((await getAnalysis(accountId, tenantId, dek)).status).toBe('generating');
  });
  it('encrypts report and server-timed consent together; keeps health content out of queryable metadata', async () => {
    const requestId = await claimAnalysis(accountId, tenantId, dek, consent, input.coverage, now);
    await completeAnalysis(accountId, tenantId, dek, requestId, payload, meta, now);
    const raw = JSON.stringify(docs.get(accountId));
    expect(raw).not.toContain(analysisReport.summary);
    expect(raw).not.toContain(consent.text);
    expect(raw).not.toContain('evidenceDates');
    const record = await getAnalysis(accountId, tenantId, dek);
    expect(record.payload.consent.acceptedAt).toBe(now.toISOString());
    expect(record.payload.consent).toEqual(consent);
  });
  it('scopes reads and mutations to the account workspace', async () => {
    const requestId = await claimAnalysis(accountId, tenantId, dek, consent, input.coverage, now);
    expect(await getAnalysis(accountId, 'tenant_other', dek)).toBeNull();
    expect(await completeAnalysis(accountId, 'tenant_other', dek, requestId, payload, meta, now)).toBe(false);
    expect(await claimAnalysis(accountId, 'tenant_other', dek, consent, input.coverage, now)).toBeNull();
  });
  it('deletes analysis and consent with the account; an in-flight worker cannot recreate either', async () => {
    const requestId = await claimAnalysis(accountId, tenantId, dek, consent, input.coverage, now);
    const summary = await deleteAccountData(accountId);
    expect(summary.analyses).toBe(1);
    expect(docs.get(accountId)).toMatchObject({ _id: accountId, accountId, tenantId, status: 'deleted' });
    expect(docs.get(accountId)).not.toHaveProperty('enc');
    expect(await completeAnalysis(accountId, tenantId, dek, requestId, payload, meta, now)).toBe(false);
    await failAnalysis(accountId, tenantId, requestId, 'timeout', now);
    expect(await getAnalysis(accountId, tenantId, dek)).toBeNull();
    for (const call of mocks.updateOne.mock.calls) expect(call[2]?.upsert).not.toBe(true);
  });
  it('blocks a first claim arriving after account deletion, even when no analysis row existed', async () => {
    await deleteAccountData(accountId);
    expect(await claimAnalysis(accountId, tenantId, dek, consent, input.coverage, now)).toBeNull();
    expect(docs.get(accountId).status).toBe('deleted');
    expect(docs.get(accountId)).not.toHaveProperty('enc');
    expect(await getAnalysis(accountId, tenantId, dek)).toBeNull();
  });
  it('does not interpret corrupt stored completion as a free retry', async () => {
    const requestId = await claimAnalysis(accountId, tenantId, dek, consent, input.coverage, now);
    await completeAnalysis(accountId, tenantId, dek, requestId, payload, meta, now);
    docs.get(accountId).enc = undefined;
    await expect(getAnalysis(accountId, tenantId, dek)).rejects.toThrow('analysis_unreadable');
  });
});
