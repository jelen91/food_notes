import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptJson } from '../lib/crypto';
import { getQuestionnaire, saveQuestionnaire } from '../lib/tracker/store';
import { deleteAccountData } from '../lib/accountDeletion';
import { QUESTIONNAIRE_CONSENT_TEXT, QUESTIONNAIRE_CONSENT_VERSION } from '../lib/consent';

const mocked = vi.hoisted(() => ({
  getDb: vi.fn(), updateOne: vi.fn(), findOne: vi.fn(), deleteMany: vi.fn(),
}));
vi.mock('../lib/db', () => ({
  getDb: mocked.getDb,
  ACCOUNTS: 'accounts', AUTH_TOKENS: 'auth_tokens', CHECKOUT_SESSIONS: 'checkout_sessions',
  DAYS: 'days', ENTITLEMENTS: 'entitlements', LABS: 'labs', QUESTIONNAIRES: 'questionnaire_responses',
  TENANTS: 'tenants', TRACKERS: 'trackers', USERS: 'users',
  JOURNAL_ANALYSES: 'journal_analyses',
  REFUND_REQUESTS: 'refund_requests', WITHDRAWAL_REQUESTS: 'withdrawal_requests',
}));
vi.mock('../lib/store', () => ({ audit: vi.fn().mockResolvedValue(undefined) }));

const tenantId = 'tenant_test';
const dek = Buffer.alloc(32, 7);
let document: any;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
  vi.clearAllMocks();
  document = null;
  mocked.updateOne.mockImplementation(async (filter, update) => {
    document = { ...(document ?? update.$setOnInsert), ...filter, ...update.$set };
    return { modifiedCount: 1 };
  });
  mocked.findOne.mockImplementation(async () => document);
  mocked.deleteMany.mockImplementation(async () => { document = null; return { deletedCount: 1 }; });
  mocked.getDb.mockResolvedValue({ collection: (name: string) => {
    if (name === 'questionnaire_responses') return { updateOne: mocked.updateOne, findOne: mocked.findOne, deleteMany: mocked.deleteMany };
    if (name === 'accounts') return {
      findOne: async () => ({ accountId: 'account_test', tenantId, status: 'active' }),
      updateOne: async () => ({ modifiedCount: 1 }),
    };
    return { findOne: async () => null, replaceOne: async () => ({ modifiedCount: 1 }), deleteMany: async () => ({ deletedCount: 0 }), deleteOne: async () => ({ deletedCount: 1 }), countDocuments: async () => 0 };
  } });
});
afterEach(() => vi.useRealTimers());

describe('consent belongs to the same encrypted questionnaire revision', () => {
  it('atomically stores server time, current version and exact shown wording with each successful save', async () => {
    await saveQuestionnaire(tenantId, dek, {
      version: 2, answers: { hlavni_otazka: 'První testovací otázka' }, submitted: false,
      consentVersion: QUESTIONNAIRE_CONSENT_VERSION,
    });
    const first = await getQuestionnaire(tenantId, dek);
    expect(first.consent).toEqual({
      version: QUESTIONNAIRE_CONSENT_VERSION, text: QUESTIONNAIRE_CONSENT_TEXT, acceptedAt: '2026-09-12T12:00:00.000Z',
    });
    expect(JSON.stringify(document)).not.toContain(QUESTIONNAIRE_CONSENT_TEXT);
    expect(JSON.stringify(document)).not.toContain('První testovací otázka');

    vi.setSystemTime(new Date('2026-09-12T12:05:00Z'));
    await saveQuestionnaire(tenantId, dek, {
      version: 2, answers: { hlavni_otazka: 'Upravená otázka' }, submitted: true,
      consentVersion: QUESTIONNAIRE_CONSENT_VERSION,
    });
    const second = await getQuestionnaire(tenantId, dek);
    expect(second.answers.hlavni_otazka).toBe('Upravená otázka');
    expect(second.consent?.acceptedAt).toBe('2026-09-12T12:05:00.000Z');
    expect(second.submittedAt).toEqual(new Date('2026-09-12T12:05:00Z'));
    for (const [, update] of mocked.updateOne.mock.calls) {
      const payload = decryptJson<any>(dek, update.$set.enc, {});
      expect(payload.consent.text).toBe(QUESTIONNAIRE_CONSENT_TEXT);
      expect(payload.consent.version).toBe(QUESTIONNAIRE_CONSENT_VERSION);
      expect(payload.answers.hlavni_otazka).toBeTruthy();
    }
  });

  it('also rejects outdated consent at the persistence boundary before opening a database', async () => {
    await expect(saveQuestionnaire(tenantId, dek, {
      version: 2, answers: {}, submitted: false, consentVersion: 'old-version',
    })).rejects.toThrow('Neplatná verze souhlasu');
    expect(mocked.getDb).not.toHaveBeenCalled();
  });

  it('account deletion removes the questionnaire and its consent receipt together', async () => {
    await saveQuestionnaire(tenantId, dek, {
      version: 2, answers: { hlavni_otazka: 'Test' }, submitted: true,
      consentVersion: QUESTIONNAIRE_CONSENT_VERSION,
    });
    expect((await getQuestionnaire(tenantId, dek)).consent).not.toBeNull();
    await deleteAccountData('account_test');
    expect(mocked.deleteMany).toHaveBeenCalledWith({ tenantId });
    const removed = await getQuestionnaire(tenantId, dek);
    expect(removed.consent).toBeNull();
    expect(removed.answers).toEqual({});
  });
});
