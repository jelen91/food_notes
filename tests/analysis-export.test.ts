import { describe, expect, it } from 'vitest';
import { analysisAsText } from '../lib/analysis-export';
import type { AnalysisResponse } from '../lib/analysis/types';
import { analysisEligibility } from '../lib/analysis/eligibility';
import { analysisReport } from './analysis-fixtures';

const completed: AnalysisResponse = {
  status: 'completed',
  eligibility: analysisEligibility(null, [], new Date()),
  retryable: false,
  consentVersion: 'test',
  consentText: 'test',
  completedAt: '2026-09-12T10:00:00Z',
  coverage: {
    from: '2026-08-20',
    to: '2026-09-09',
    analyzedDays: 21,
    eligibleDays: 22,
    omittedDays: 1,
    omittedDates: ['2026-08-19'],
    missingDefinitionDays: ['2026-08-18'],
    selection: 'most_recent_complete_days',
    maxDays: 90,
  },
  report: {
    ...analysisReport,
    patterns: [
      {
        title: 'Srovnání dní',
        observation: 'Zápisy se liší.',
        evidenceDates: ['2026-08-20'],
        strength: 'low',
        alternativeExplanations: ['Část okolností chybí.'],
      },
    ],
    hypotheses: [
      {
        possibility: 'Změna režimu',
        basis: 'Uvedená v poznámkách.',
        uncertainty: 'Nelze určit směr vztahu.',
      },
    ],
  },
};

describe('stažitelný AI přehled', () => {
  it('zachová nejistoty, důkazy a přesný rozsah i mimo aplikaci', () => {
    const exported = analysisAsText(completed);
    expect(exported).toContain('Není diagnózou ani doporučením léčby.');
    expect(exported).toContain('Nejde o důkaz příčiny.');
    expect(exported).toContain('Dny: 2026-08-20');
    expect(exported).toContain('Část okolností chybí.');
    expect(exported).toContain('Nelze určit směr vztahu.');
    expect(exported).toContain('Vynechané dny: 2026-08-19');
    expect(exported).toContain('Chybějící podoba deníku pro dny: 2026-08-18');
    expect(exported).toContain(analysisReport.nextSteps[0].reason);
    expect(exported).toContain(analysisReport.clinicianQuestions[0]);
    expect(exported).not.toContain('consentVersion');
  });
  it('nedovolí exportovat nehotový nebo chybějící výsledek', () => {
    expect(analysisAsText({ ...completed, status: 'generating' })).toBe('');
    expect(analysisAsText({ ...completed, report: undefined })).toBe('');
  });
});
