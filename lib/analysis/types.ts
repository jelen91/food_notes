/** Browser-safe contract. No database, keys or model SDK imports here. */
export interface AnalysisEligibility {
  eligible: boolean;
  hasPurchase: boolean;
  paidAt: string | null;
  availableAt: string | null;
  elapsedDays: number;
  requiredDays: number;
  recordedDays: number;
  remainingDays: number;
  timeZone: 'Europe/Prague';
}

export interface AnalysisCoverage {
  from: string;
  to: string;
  eligibleDays: number;
  analyzedDays: number;
  omittedDays: number;
  omittedDates: string[];
  missingDefinitionDays: string[];
  selection: 'most_recent_complete_days';
  maxDays: number;
}

export interface AnalysisReport {
  schemaVersion: 1;
  summary: string;
  dataQuality: string[];
  patterns: Array<{
    title: string;
    observation: string;
    evidenceDates: string[];
    strength: 'low' | 'medium';
    alternativeExplanations: string[];
  }>;
  hypotheses: Array<{ possibility: string; basis: string; uncertainty: string }>;
  nextSteps: Array<{ kind: 'observation' | 'prepare_consultation'; action: string; reason: string }>;
  clinicianQuestions: string[];
  limitations: string[];
}

export type AnalysisStatus = 'locked' | 'ready' | 'generating' | 'completed' | 'failed' | 'not_configured';
export interface AnalysisResponse {
  status: AnalysisStatus;
  eligibility: AnalysisEligibility;
  report?: AnalysisReport;
  coverage?: AnalysisCoverage;
  completedAt?: string;
  retryAt?: string;
  error?: string;
  retryable: boolean;
  consentVersion: string;
  consentText: string;
}
