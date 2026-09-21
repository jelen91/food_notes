import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANALYSIS_POST_TIMEOUT_MS, canStartJournalAnalysis, postJournalAnalysis, readJournalAnalysis } from '../components/analysis/useJournalAnalysis';
import type { AnalysisResponse, AnalysisStatus } from '../lib/analysis/types';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function state(status: AnalysisStatus, retryable = false): AnalysisResponse {
  return {
    status, retryable, consentVersion: 'v1', consentText: 'Souhlasím.',
    eligibility: { eligible: true, hasPurchase: true, paidAt: null, availableAt: null, elapsedDays: 21, requiredDays: 21, recordedDays: 21, remainingDays: 0, timeZone: 'Europe/Prague' },
  };
}

describe('přenos vyhodnocení a bezpečná obnova stavu', () => {
  it('časově omezí visící POST a sám jej nikdy neopakuje', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const request = postJournalAnalysis('v1');
    const outcome = request.catch((error) => error.message);
    await vi.advanceTimersByTimeAsync(ANALYSIS_POST_TIMEOUT_MS - 1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBe('aborted');
    await vi.advanceTimersByTimeAsync(ANALYSIS_POST_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('watchdog pokrývá i visící tělo odpovědi po přijetí hlaviček', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const request = postJournalAnalysis('v1');
    await vi.advanceTimersByTimeAsync(ANALYSIS_POST_TIMEOUT_MS);
    expect((await request).value).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('odesílá aktuální souhlas a po rychlé odpovědi uklidí watchdog', async () => {
    vi.useFakeTimers();
    const response = new Response(JSON.stringify(state('completed')), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);
    const result = await postJournalAnalysis('v2-current');
    expect(result.value.status).toBe('completed');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ consent: true, consentVersion: 'v2-current' });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(ANALYSIS_POST_TIMEOUT_MS);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('nepovažuje chybovou odpověď za úspěšné vyhodnocení ani ji neopakuje', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Příliš mnoho pokusů.' }), { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await postJournalAnalysis('v1');
    expect(result.response.ok).toBe(false);
    expect(result.value.error).toBe('Příliš mnoho pokusů.');
    expect(result.value.report).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('obnova stavu po ztraceném POST používá jen čtení', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify(state('generating'))));
    vi.stubGlobal('fetch', fetchMock);
    await expect(postJournalAnalysis('v1')).rejects.toThrow('offline');
    expect((await readJournalAnalysis()).status).toBe('generating');
    expect(fetchMock.mock.calls.map((call) => call[1].method ?? 'GET')).toEqual(['POST', 'GET']);
  });

  it('i čtení má vlastní timeout a nemění se ve spuštění rozboru', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const outcome = readJournalAnalysis().catch((error) => error.message);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await outcome).toBe('aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('spuštění respektuje zpřístupnění i možnost opakování', () => {
  it('nabídne ready a opakovatelnou chybu, ale nikdy neopakovatelnou chybu', () => {
    expect(canStartJournalAnalysis(state('ready'))).toBe(true);
    expect(canStartJournalAnalysis(state('failed', true))).toBe(true);
    expect(canStartJournalAnalysis(state('failed', false))).toBe(false);
  });

  it.each(['locked', 'generating', 'completed', 'not_configured'] as const)('nespouští stav %s ani při staré platné eligibility', (status) => {
    expect(canStartJournalAnalysis(state(status, true))).toBe(false);
  });

  it('bez nároku nebo stavu nelze odesílat', () => {
    const withoutEligibility = state('ready');
    withoutEligibility.eligibility.eligible = false;
    expect(canStartJournalAnalysis(withoutEligibility)).toBe(false);
    expect(canStartJournalAnalysis(null)).toBe(false);
  });
});
