import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisResponse } from '../../lib/analysis/types';
import { pollTracker } from '../../lib/tracker/poll';

export const ANALYSIS_POST_TIMEOUT_MS = 210_000;

export async function readJournalAnalysis(): Promise<AnalysisResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch('/api/journal-analysis', { cache: 'no-store', signal: controller.signal });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? 'Pro zobrazení přehledu se prosím znovu přihlas.'
          : 'Stav vyhodnocení se nepodařilo načíst.'
      );
    const value = await response.json();
    if (!value?.status || !value?.eligibility) throw new Error('Stav vyhodnocení se nepodařilo načíst.');
    return value;
  } finally {
    clearTimeout(timeout);
  }
}

/** Bound the transport wait; only the server decides whether a benefit was used. */
export async function postJournalAnalysis(
  consentVersion: string
): Promise<{ response: Response; value: Partial<AnalysisResponse> | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_POST_TIMEOUT_MS);
  try {
    const response = await fetch('/api/journal-analysis', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true, consentVersion }),
    });
    const value = await response.json().catch(() => null);
    return { response, value };
  } finally {
    clearTimeout(timeout);
  }
}

export function canStartJournalAnalysis(data: AnalysisResponse | null): boolean {
  return Boolean(
    data?.eligibility.eligible && (data.status === 'ready' || (data.status === 'failed' && data.retryable))
  );
}

/** Reads can repeat. A paid analysis is only started by an explicit button click. */
export function useJournalAnalysis(refreshKey = 0) {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pollStopped, setPollStopped] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const revision = useRef(0);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    const id = ++revision.current;
    setLoading(true);
    setPollStopped(false);
    try {
      const value = await readJournalAnalysis();
      if (!alive.current || revision.current !== id) return;
      setData(value);
      setError('');
    } catch (e) {
      if (alive.current && revision.current === id)
        setError(e instanceof Error ? e.message : 'Stav se nepodařilo načíst.');
    } finally {
      if (alive.current && revision.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      revision.current += 1;
    };
  }, []);

  useEffect(() => {
    // Combine quick diary edits into a single progress refresh.
    const timer = setTimeout(refresh, refreshKey ? 1500 : 0);
    return () => clearTimeout(timer);
  }, [refresh, refreshKey]);

  useEffect(() => {
    // An explicit refresh cancels the poll's stale response before it can replace fresher data.
    if (data?.status !== 'generating' || loading || submitting || pollStopped) return;
    return pollTracker({
      intervalMs: 2500,
      read: readJournalAnalysis,
      onUpdate: (value) => {
        if (!alive.current) return;
        setData(value);
        setError('');
      },
      onError: () => {
        if (!alive.current) return;
        setPollStopped(true);
        setError('Spojení se přerušilo. Vyhodnocení může na serveru pokračovat. Zkontroluj jeho stav.');
      },
    });
  }, [data?.status, loading, submitting, pollStopped]);

  const start = async (consentVersion: string) => {
    if (busy.current || !canStartJournalAnalysis(data)) return;
    busy.current = true;
    revision.current += 1;
    // A refresh invalidated above must not leave its loading flag stuck forever.
    setLoading(false);
    setSubmitting(true);
    setError('');
    setPollStopped(false);
    setData((previous) => previous && { ...previous, status: 'generating' });
    try {
      const { response, value } = await postJournalAnalysis(consentVersion);
      if (!alive.current) return;
      if (value?.status && value?.eligibility) {
        setData(value as AnalysisResponse);
        if (!response.ok && value.error) setError(value.error);
      } else {
        // A lost response never consumes the benefit locally or triggers another POST.
        setError(value?.error || 'Výsledek se nepodařilo načíst. Ověřujeme stav na serveru.');
      }
    } catch {
      if (alive.current)
        setError('Spojení se přerušilo. Ověřujeme, zda je vyhodnocení hotové; nový rozbor nespouštíme.');
    } finally {
      busy.current = false;
      if (alive.current) setSubmitting(false);
    }
  };

  return { data, loading, submitting, error, pollStopped, refresh, start };
}
