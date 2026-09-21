import { describe, expect, it } from 'vitest';
import { analysisEligibility, DAY_MS, eligibleDate, pragueDate } from '../lib/analysis/eligibility';
import { buildAnalysisInput, MAX_INPUT_BYTES, prepareJournal } from '../lib/analysis/input';
import { analysisDefinition, entitlement, journalRecords, paidAt } from './analysis-fixtures';

const defs = new Map([[1, analysisDefinition]]);
const now = new Date('2026-09-12T12:00:00Z');

describe('purchase and independent time/data gates', () => {
  it('requires exactly 21 elapsed 24-hour periods and 21 distinct relevant dates', () => {
    const dates = journalRecords().map((r) => r.date);
    expect(analysisEligibility(entitlement, dates, new Date(paidAt.getTime() + 21 * DAY_MS - 1)).eligible).toBe(false);
    expect(analysisEligibility(entitlement, dates, new Date(paidAt.getTime() + 21 * DAY_MS)).eligible).toBe(true);
    expect(analysisEligibility(entitlement, dates.slice(1), now).eligible).toBe(false);
    expect(analysisEligibility(entitlement, [...dates.slice(1), dates[1]], now).recordedDays).toBe(20);
  });
  it('does not grant purchase analysis to manual, legacy, revoked or missing-paidAt entitlements', () => {
    for (const patch of [{ kind: 'manual' }, { kind: 'legacy' }, { status: 'revoked' }, { paidAt: null }]) {
      expect(analysisEligibility({ ...entitlement, ...patch } as any, journalRecords().map((r) => r.date), now).eligible).toBe(false);
    }
  });
  it('handles Prague midnight, DST and real calendar dates; ignores future and pre-purchase dates', () => {
    expect(pragueDate(new Date('2026-08-01T22:30:00Z'))).toBe('2026-08-02');
    expect(pragueDate(new Date('2026-01-01T23:30:00Z'))).toBe('2026-01-02');
    expect(eligibleDate('2026-02-30', paidAt, now)).toBe(false);
    expect(eligibleDate('2026-07-31', paidAt, now)).toBe(false);
    expect(eligibleDate('2026-09-13', paidAt, now)).toBe(false);
    const dstPaid = new Date('2026-10-15T12:00:00Z');
    const e = analysisEligibility({ ...entitlement, paidAt: dstPaid }, [], new Date(dstPaid.getTime() + 21 * DAY_MS));
    expect(e.availableAt).toBe('2026-11-05T12:00:00.000Z');
  });
});

describe('actual historical definitions and whole-day bounded analysis input', () => {
  it('counts zero, false and notes; excludes empty shells, invalid fields and metadata-only events', () => {
    const records = journalRecords(7);
    records[0].tracker.answers = { energie: 0 };
    records[1].tracker = { version: 1, answers: { potize: false }, events: [] } as any;
    records[2].tracker = { version: 1, answers: {}, events: [], note: 'Poznámka' } as any;
    records[3].tracker = { version: 1, answers: {}, events: [] } as any;
    records[4].tracker = { version: 1, answers: { unknown: 7 }, events: [] } as any;
    records[5].tracker = { version: 1, answers: {}, events: [{ id: 'x', fieldId: 'jidlo', time: '12:30', value: '', note: ' ' }] } as any;
    records[6].tracker = { version: 1, answers: {}, events: [], note: '   ' } as any;
    expect(prepareJournal(records, defs, paidAt, now).days.map((d) => d.date)).toEqual(records.slice(0, 3).map((d) => d.date));
  });
  it('does not require consecutive dates and does not count future/backdated/duplicate entries', () => {
    const records = journalRecords(42).filter((_, i) => i % 2 === 0);
    expect(analysisEligibility(entitlement, prepareJournal(records, defs, paidAt, now).days.map((r) => r.date), now).eligible).toBe(true);
    const extra = [{ ...records[0], date: '2026-09-13' }, { ...records[0], date: '2026-07-31' }, records[0]];
    expect(prepareJournal([...records, ...extra], defs, paidAt, now).days).toHaveLength(21);
  });
  it('loads meaning from every version and discloses unavailable definitions', () => {
    const records = journalRecords(23);
    records[21].tracker.version = 2;
    records[22].tracker.version = 3;
    const definition2 = { ...analysisDefinition, title: 'Historická definice' };
    const prepared = prepareJournal(records, new Map([[1, analysisDefinition], [2, definition2]]), paidAt, now);
    const { input } = buildAnalysisInput(prepared);
    expect(input.definitions.map((d) => d.version)).toEqual([1, 2]);
    expect(input.definitions[1].definition.title).toBe('Historická definice');
    expect(input.coverage.missingDefinitionDays).toEqual([records[22].date]);
    expect(input.coverage.analyzedDays).toBe(22);
  });
  it('selects at most 90 complete most-recent days and computes counts including zeros', () => {
    const records = journalRecords(120);
    const { input } = buildAnalysisInput(prepareJournal(records, defs, paidAt, new Date('2026-12-10T12:00:00Z')));
    expect(input.days).toHaveLength(90);
    expect(input.coverage.omittedDays).toBe(30);
    expect(input.coverage.omittedDates).toEqual(records.slice(0, 30).map((d) => d.date));
    expect(input.fieldCounts[0].recordedDays).toBe(90);
    expect(input.fieldCounts[0].minimum).toBe(0);
    expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThanOrEqual(MAX_INPUT_BYTES);
  });
  it('shrinks the window explicitly without clipping notes or events, or fails before sending', () => {
    const records = journalRecords(30);
    for (const row of records) row.tracker = { ...row.tracker, events: Array.from({ length: 2 }, (_, i) => ({ id: `e${i}`, fieldId: 'jidlo', sectionId: 'udalosti', time: '12:30', value: 'V'.repeat(300), note: 'N'.repeat(2000) })) } as any;
    const result = buildAnalysisInput(prepareJournal(records, defs, paidAt, now));
    expect(result.input.coverage.analyzedDays).toBeGreaterThanOrEqual(21);
    for (const row of result.input.days) expect(row.tracker.events[0].note).toHaveLength(2000);
    for (const row of records) row.tracker.events = Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, fieldId: 'jidlo', sectionId: 'udalosti', time: '12:30', value: 'V'.repeat(300), note: 'N'.repeat(2000) })) as any;
    expect(buildAnalysisInput(prepareJournal(records, defs, paidAt, now))).toEqual({ error: 'input_too_large' });
  });
});
