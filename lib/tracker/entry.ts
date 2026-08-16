// Denní záznamy pořízené podle vygenerované definice.
//
// Hodnoty se validují proti definici té verze, se kterou byl záznam pořízen – po přegenerování
// trackeru se staré dny nepřepisují ani nemažou, zůstávají čitelné podle své verze.

import { TrackerDefinition, TrackerField, TrackerSection } from './schema';

export type FieldValue = number | string | boolean | string[];

export interface TrackerEvent {
  id: string;
  /** Prázdné u volné poznámky, která nepatří k žádné sekci ani poli. */
  sectionId: string;
  fieldId: string;
  /** HH:MM, kdy se věc stala. */
  time: string;
  value: FieldValue;
  note?: string;
}

/** Volná poznámka: zápis bez kategorie. Hlavní způsob, jak si rychle uložit cokoli. */
export function isFreeNote(event: TrackerEvent): boolean {
  return !event.fieldId;
}

export interface TrackerDay {
  /** Verze definice, podle které byl den pořízen. */
  version: number;
  /** Odpovědi z denních sekcí: fieldId → hodnota. */
  answers: Record<string, FieldValue>;
  /** Časované události ze sekcí typu timeline. */
  events: TrackerEvent[];
  note?: string;
}

/** Jak se hodnota daného typu ukládá a vykresluje. */
export type ValueKind = 'number' | 'text' | 'longtext' | 'boolean' | 'choice' | 'choices' | 'date' | 'time';

export function valueKind(type: TrackerField['type']): ValueKind {
  switch (type) {
    case 'boolean':
      return 'boolean';
    case 'number':
    case 'duration':
    case 'scale':
    case 'sleep':
    case 'stool_bristol':
      return 'number';
    case 'single_select':
      return 'choice';
    case 'multi_select':
      return 'choices';
    case 'date':
      return 'date';
    case 'time':
      return 'time';
    case 'long_text':
    case 'custom_observation':
      return 'longtext';
    default:
      // meal, exercise, symptom, medication_or_supplement, short_text
      return 'text';
  }
}

/** Bristolova škála – pevný číselník, model ho nevymýšlí. */
export const BRISTOL_OPTIONS = [
  { value: 1, label: '1 – tvrdé oddělené kousky' },
  { value: 2, label: '2 – hrudkovitá' },
  { value: 3, label: '3 – s prasklinami' },
  { value: 4, label: '4 – hladká, měkká' },
  { value: 5, label: '5 – měkké kousky' },
  { value: 6, label: '6 – kašovitá' },
  { value: 7, label: '7 – vodnatá' },
];

export function fieldRange(field: TrackerField): { min: number; max: number; step: number } {
  if (field.type === 'stool_bristol') return { min: 1, max: 7, step: 1 };
  if (field.type === 'sleep') return { min: field.min ?? 0, max: field.max ?? 24, step: field.step ?? 0.5 };
  return { min: field.min ?? 0, max: field.max ?? Number.MAX_SAFE_INTEGER, step: field.step ?? 1 };
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeTime(raw: unknown): string {
  const m = String(raw ?? '').trim().match(TIME_RE);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function text(raw: unknown, max: number): string {
  // Řídicí znaky ven – ať se nedají propašovat do exportu ani do zobrazení.
  // eslint-disable-next-line no-control-regex
  return String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

/** Jedna hodnota podle typu pole; undefined = nezapisovat. */
export function normalizeValue(field: TrackerField, raw: unknown): FieldValue | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;

  switch (valueKind(field.type)) {
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 'ano') return true;
      if (raw === 'false' || raw === 'ne') return false;
      return undefined;

    case 'number': {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
      if (!Number.isFinite(n)) return undefined;
      const { min, max } = fieldRange(field);
      if (n < min || n > max) return undefined;
      return Math.round(n * 1000) / 1000;
    }

    case 'choice': {
      const value = text(raw, 60);
      return field.options?.some((o) => o.value === value) ? value : undefined;
    }

    case 'choices': {
      if (!Array.isArray(raw)) return undefined;
      const allowed = raw
        .map((v) => text(v, 60))
        .filter((v) => field.options?.some((o) => o.value === v));
      const uniq = Array.from(new Set(allowed)).slice(0, 30);
      return uniq.length ? uniq : undefined;
    }

    case 'date': {
      const value = text(raw, 10);
      return DATE_RE.test(value) ? value : undefined;
    }

    case 'time': {
      const value = normalizeTime(raw);
      return value || undefined;
    }

    case 'longtext': {
      const value = text(raw, 2000);
      return value || undefined;
    }

    default: {
      const value = text(raw, 300);
      return value || undefined;
    }
  }
}

/**
 * Vyhodnotí podmíněné zobrazení pole proti už vyplněným hodnotám.
 *
 * Porovnává se typově tolerantně: v definici je podmínka vždy text (schéma pro structured
 * outputs nesmí obsahovat unii typů), zatímco hodnota může být číslo nebo ano/ne. Bez toho
 * by `true` nikdy neodpovídalo `"true"` a podmínky by tiše nefungovaly.
 */
export function isVisible(field: TrackerField, values: Record<string, FieldValue>): boolean {
  const rule = field.visibility;
  if (!rule) return true;
  const other = values[rule.dependsOnFieldId];
  if (other === undefined) return false;

  const target = String(rule.value).toLowerCase();
  const same = (v: string | number | boolean) => String(v).toLowerCase() === target;

  switch (rule.operator) {
    case 'equals':
      return Array.isArray(other) ? other.some(same) : same(other);
    case 'not_equals':
      return Array.isArray(other) ? !other.some(same) : !same(other);
    case 'contains':
      if (Array.isArray(other)) return other.some(same);
      return String(other).toLowerCase().includes(target);
    default:
      return true;
  }
}

export function dailySections(definition: TrackerDefinition): TrackerSection[] {
  return definition.sections.filter((s) => s.kind === 'daily').sort((a, b) => a.order - b.order);
}

export function timelineSections(definition: TrackerDefinition): TrackerSection[] {
  return definition.sections.filter((s) => s.kind === 'timeline').sort((a, b) => a.order - b.order);
}

export function allFields(definition: TrackerDefinition): TrackerField[] {
  return definition.sections.flatMap((s) => s.fields);
}

export function findField(definition: TrackerDefinition, fieldId: string): TrackerField | undefined {
  return allFields(definition).find((f) => f.id === fieldId);
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function emptyDay(version: number): TrackerDay {
  return { version, answers: {}, events: [] };
}

/**
 * Vyčistí celý den proti definici. Pole, která v definici nejsou, se zahodí – proto se
 * pro každý den používá definice jeho vlastní verze, ne ta aktuální.
 */
export function normalizeTrackerDay(definition: TrackerDefinition, version: number, raw: any): TrackerDay {
  const day = emptyDay(version);
  if (!raw || typeof raw !== 'object') return day;

  const dailyFieldIds = new Set(dailySections(definition).flatMap((s) => s.fields.map((f) => f.id)));
  for (const [fieldId, value] of Object.entries(raw.answers ?? {})) {
    if (!dailyFieldIds.has(fieldId)) continue;
    const field = findField(definition, fieldId);
    if (!field) continue;
    const normalized = normalizeValue(field, value);
    if (normalized !== undefined) day.answers[fieldId] = normalized;
  }

  // Pole schované podmínkou nemá co ukládat – jinak by v datech zůstaly hodnoty,
  // které uživatel na obrazovce nikdy neviděl.
  for (const fieldId of Object.keys(day.answers)) {
    const field = findField(definition, fieldId);
    if (field && !isVisible(field, day.answers)) delete day.answers[fieldId];
  }

  const timelineFieldIds = new Map(
    timelineSections(definition).flatMap((s) => s.fields.map((f) => [f.id, s.id] as const))
  );
  const events: TrackerEvent[] = [];
  for (const rawEvent of Array.isArray(raw.events) ? raw.events.slice(0, 300) : []) {
    const fieldId = String(rawEvent?.fieldId ?? '');
    const sectionId = timelineFieldIds.get(fieldId);
    const field = sectionId ? findField(definition, fieldId) : undefined;
    const note = text(rawEvent?.note, 2000);
    const time = normalizeTime(rawEvent?.time);
    const id = text(rawEvent?.id, 32) || newId();

    // Bez známého pole jde o volnou poznámku. Nezahazujeme ji – je to hlavní způsob,
    // jak si uživatel může uložit cokoli, na co v deníku není kolonka.
    if (!field || !sectionId) {
      if (!note) continue;
      events.push({ id, sectionId: '', fieldId: '', time, value: '', note });
      continue;
    }

    const value = normalizeValue(field, rawEvent?.value);
    if (value === undefined && !note) continue;
    events.push({
      id,
      sectionId,
      fieldId,
      time,
      value: value === undefined ? '' : value,
      ...(note ? { note } : {}),
    });
  }
  day.events = events.sort((a, b) => a.time.localeCompare(b.time));

  const note = text(raw.note, 2000);
  if (note) day.note = note;
  return day;
}

/** Chybějící povinná pole – kontroluje se až při ukládání, ne při psaní. */
export function missingRequired(definition: TrackerDefinition, day: TrackerDay): string[] {
  const missing: string[] = [];
  for (const section of dailySections(definition)) {
    for (const field of section.fields) {
      if (!field.required) continue;
      if (!isVisible(field, day.answers)) continue;
      if (day.answers[field.id] === undefined) missing.push(field.label);
    }
  }
  return missing;
}
