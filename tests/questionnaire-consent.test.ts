import { describe, expect, it, vi } from 'vitest';
import handler from '../pages/api/questionnaire';
import { verifyAccountSession } from '../lib/session';
import { QUESTIONNAIRE_CONSENT_VERSION } from '../lib/consent';

vi.mock('../lib/session', () => ({ ACCOUNT_COOKIE: 'hj_account', verifyAccountSession: vi.fn() }));
vi.mock('../lib/rateLimit', () => ({ requireSameOrigin: () => true, enforceRateLimit: vi.fn().mockResolvedValue(false), clientIp: () => 'test' }));
vi.mock('../lib/drafts', () => ({ DRAFT_COOKIE: 'hj_draft', draftIdFromCookie: () => '', getDraft: vi.fn().mockResolvedValue(null) }));

describe('questionnaire consent is enforced before health data storage', () => {
  it('accepts explicit consent to the current wording and continues to ordinary authorization', async () => {
    vi.mocked(verifyAccountSession).mockClear();
    const req = { method: 'POST', body: { consent: true, consentVersion: QUESTIONNAIRE_CONSENT_VERSION }, cookies: {}, headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    // The mocked rate limit stops this request before any workspace/database mutation.
    await handler(req, res);
    expect(verifyAccountSession).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([undefined, false, 'true', 1])('rejects non-explicit consent (%s) before resolving a workspace', async (consent) => {
    vi.mocked(verifyAccountSession).mockClear();
    const req = { method: 'POST', body: { consent, consentVersion: QUESTIONNAIRE_CONSENT_VERSION, answers: { hlavni_otazka: 'Test question' } }, cookies: {}, headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(verifyAccountSession).not.toHaveBeenCalled();
  });

  it.each([undefined, 'older-version', 1])('rejects missing or stale wording (%s) before database lookup', async (consentVersion) => {
    vi.mocked(verifyAccountSession).mockClear();
    const req = { method: 'POST', body: { consent: true, consentVersion }, cookies: {}, headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(verifyAccountSession).not.toHaveBeenCalled();
  });
});
