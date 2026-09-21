import type { AnalysisCoverage, AnalysisEligibility, AnalysisResponse } from './types';
import type { StoredAnalysis } from './store';
import { ANALYSIS_CONSENT_TEXT, ANALYSIS_CONSENT_VERSION } from './consent';
import { ANALYSIS_FAILURE_MESSAGES } from './generate';

export function analysisResponse(
  eligibility: AnalysisEligibility, record: StoredAnalysis | null, configured: boolean, now: Date,
  coverage?: AnalysisCoverage
): AnalysisResponse {
  const base = {
    eligibility, consentVersion: ANALYSIS_CONSENT_VERSION, consentText: ANALYSIS_CONSENT_TEXT,
    retryable: false, ...(coverage ? { coverage } : {}),
  };
  if (record?.status === 'completed') return {
    ...base, status: 'completed', report: record.payload.report, coverage: record.payload.coverage,
    completedAt: new Date(record.completedAt).toISOString(),
  };
  if (record?.status === 'generating' && new Date(record.leaseUntil).getTime() > now.getTime()) return {
    ...base, status: 'generating', retryAt: new Date(record.leaseUntil).toISOString(), coverage: record.payload.coverage,
  };
  if (!eligibility.eligible) return { ...base, status: 'locked' };
  if (!configured) return { ...base, status: 'not_configured', error: ANALYSIS_FAILURE_MESSAGES.not_configured };
  if (record) return {
    ...base, status: 'failed', retryable: true,
    error: ANALYSIS_FAILURE_MESSAGES[record.status === 'generating' ? 'interrupted' : record.failure ?? 'upstream_error'],
  };
  return { ...base, status: 'ready' };
}
