import type { DayData } from '../schema';
import type { TrackerDefinition } from '../tracker/schema';
import { normalizeTrackerDay, type TrackerDay, type FieldValue } from '../tracker/entry';
import { listDays } from '../store';
import { getTrackerByVersion } from '../tracker/store';
import { eligibleDate, pragueDate, REQUIRED_DAYS } from './eligibility';
import type { AnalysisCoverage } from './types';

export const MAX_ANALYZED_DAYS = 90;
// Whole UTF-8 JSON input, including definitions, coverage and computed counts. Even
// pathological one-byte-per-token input leaves room in a 200k context for output.
export const MAX_INPUT_BYTES = 150_000;
export type JournalDay = { date: string } & DayData;
export interface MeaningfulDay { date: string; tracker: TrackerDay }
export interface PreparedJournal {
  days: MeaningfulDay[];
  definitions: Map<number, TrackerDefinition>;
  missingDefinitionDays: string[];
}

function meaningful(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(meaningful);
  return false;
}

export function meaningfulTracker(day: TrackerDay): boolean {
  return Object.values(day.answers).some(meaningful) || meaningful(day.note) ||
    day.events.some((event) => meaningful(event.value) || meaningful(event.note));
}

/** Uses each entry's own historical definition; never guesses field meaning. */
export function prepareJournal(
  records: JournalDay[], definitions: Map<number, TrackerDefinition>, paidAt: Date, now: Date
): PreparedJournal {
  const byDate = new Map<string, MeaningfulDay>();
  const missing = new Set<string>();
  for (const record of records) {
    if (!eligibleDate(record.date, paidAt, now) || !record.tracker || typeof record.tracker !== 'object') continue;
    const raw = record.tracker as TrackerDay;
    if (!Number.isInteger(raw.version) || raw.version < 1) continue;
    const definition = definitions.get(raw.version);
    if (!definition) { missing.add(record.date); continue; }
    const tracker = normalizeTrackerDay(definition, raw.version, raw);
    if (meaningfulTracker(tracker)) byDate.set(record.date, { date: record.date, tracker });
  }
  return {
    days: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)), definitions,
    missingDefinitionDays: Array.from(missing).sort(),
  };
}

export async function loadJournal(tenantId: string, dek: Buffer, paidAt: Date, now: Date): Promise<PreparedJournal> {
  const records = await listDays(tenantId, dek, { from: pragueDate(paidAt), to: pragueDate(now) });
  const versions = Array.from(new Set(records.map((r) => (r.tracker as TrackerDay)?.version)
    .filter((v) => Number.isInteger(v) && v > 0)));
  const definitions = new Map<number, TrackerDefinition>();
  await Promise.all(versions.map(async (version) => {
    const stored = await getTrackerByVersion(tenantId, dek, version);
    if (stored) definitions.set(version, stored.definition);
  }));
  return prepareJournal(records, definitions, paidAt, now);
}

interface FieldCount {
  version: number; fieldId: string; recordedDays: number; observations: number;
  numericCount: number; minimum: number | null; maximum: number | null; mean: number | null;
}
export interface AnalysisInput {
  coverage: AnalysisCoverage;
  definitions: Array<{ version: number; definition: TrackerDefinition }>;
  days: MeaningfulDay[];
  fieldCounts: FieldCount[];
}

function fieldCounts(days: MeaningfulDay[]): FieldCount[] {
  const counts = new Map<string, { version: number; fieldId: string; dates: Set<string>; values: FieldValue[] }>();
  const add = (day: MeaningfulDay, fieldId: string, value: FieldValue) => {
    if (!fieldId || !meaningful(value)) return;
    const key = `${day.tracker.version}:${fieldId}`;
    const item = counts.get(key) ?? { version: day.tracker.version, fieldId, dates: new Set(), values: [] };
    item.dates.add(day.date); item.values.push(value); counts.set(key, item);
  };
  for (const day of days) {
    for (const [id, value] of Object.entries(day.tracker.answers)) add(day, id, value);
    for (const event of day.tracker.events) add(day, event.fieldId, event.value);
  }
  return Array.from(counts.values()).map((item) => {
    const numeric = item.values.filter((v): v is number => typeof v === 'number');
    return {
      version: item.version, fieldId: item.fieldId, recordedDays: item.dates.size, observations: item.values.length,
      numericCount: numeric.length,
      minimum: numeric.length ? Math.min(...numeric) : null,
      maximum: numeric.length ? Math.max(...numeric) : null,
      mean: numeric.length ? Math.round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length * 1000) / 1000 : null,
    };
  });
}

/** Never shortens notes, drops events within a day or pretends omitted days were analyzed. */
export function buildAnalysisInput(journal: PreparedJournal): { input?: AnalysisInput; error?: 'input_too_large' | 'insufficient_data' } {
  if (journal.days.length < REQUIRED_DAYS) return { error: 'insufficient_data' };
  let selected = journal.days.slice(-MAX_ANALYZED_DAYS);
  while (selected.length >= REQUIRED_DAYS) {
    const dates = new Set(selected.map((d) => d.date));
    const versions = Array.from(new Set(selected.map((d) => d.tracker.version)));
    const input: AnalysisInput = {
      coverage: {
        from: selected[0].date, to: selected[selected.length - 1].date,
        eligibleDays: journal.days.length, analyzedDays: selected.length,
        omittedDays: journal.days.length - selected.length,
        omittedDates: journal.days.filter((d) => !dates.has(d.date)).map((d) => d.date),
        missingDefinitionDays: journal.missingDefinitionDays,
        selection: 'most_recent_complete_days', maxDays: MAX_ANALYZED_DAYS,
      },
      definitions: versions.map((version) => ({ version, definition: journal.definitions.get(version)! })),
      days: selected,
      fieldCounts: fieldCounts(selected),
    };
    if (Buffer.byteLength(JSON.stringify(input), 'utf8') <= MAX_INPUT_BYTES) return { input };
    selected = selected.slice(1);
  }
  return { error: 'input_too_large' };
}
