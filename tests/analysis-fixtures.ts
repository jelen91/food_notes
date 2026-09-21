import type { TrackerDefinition } from '../lib/tracker/schema';
import type { AnalysisReport } from '../lib/analysis/types';
import type { Entitlement } from '../lib/billing';
import { emptyDay } from '../lib/schema';

export const analysisDefinition: TrackerDefinition = {
  schemaVersion: 1, title: 'Testovací deník', description: 'Popis', disclaimer: 'Sebepozorování.',
  sections: [{ id: 'den', title: 'Den', kind: 'daily', order: 0, fields: [
    { id: 'energie', label: 'Energie', type: 'scale', order: 0, required: false, min: 0, max: 10, higherIsBetter: true },
    { id: 'potize', label: 'Potíže', type: 'boolean', order: 1, required: false },
  ] }, { id: 'udalosti', title: 'Události', kind: 'timeline', order: 1, fields: [
    { id: 'jidlo', label: 'Jídlo', type: 'meal', order: 0, required: false },
  ] }],
};
export const analysisReport: AnalysisReport = {
  schemaVersion: 1, summary: 'Záznamy energie zatím nestačí k rozpoznání souvislosti.',
  dataQuality: ['Chybí srovnatelné informace o spánku.'], patterns: [], hypotheses: [],
  nextSteps: [{ kind: 'observation', action: 'Zapisuj i klidnější dny.', reason: 'Umožní to srovnání.' }],
  clinicianQuestions: ['Co dalšího by bylo užitečné sledovat?'],
  limitations: ['Jde o záznamy sebepozorování, které neurčují diagnózu.'],
};
export const paidAt = new Date('2026-08-01T12:00:00Z');
export const entitlement: Entitlement = {
  accountId: 'acc_test', kind: 'purchase', status: 'active', paidAt, createdAt: paidAt, updatedAt: paidAt,
};
export function journalRecords(count = 21, start = '2026-08-01') {
  return Array.from({ length: count }, (_, i) => ({
    ...emptyDay(), date: new Date(new Date(`${start}T00:00:00Z`).getTime() + i * 86400000).toISOString().slice(0, 10),
    tracker: { version: 1, answers: { energie: i % 11 }, events: [] },
  }));
}
