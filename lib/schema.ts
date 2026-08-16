// Doménový model deníku. Na rozdíl od původní verze tu nejsou napevno škály ani kategorie –
// všechno se řídí konfigurací zákazníka (lib/tenant/types.ts). Validace tedy vždycky
// potřebuje TenantConfig a cokoli, co v konfiguraci není, se při uložení zahodí.

import {
  CategoryDef,
  DailyMetricDef,
  EpisodeDef,
  FieldDef,
  ScaleDef,
  TenantConfig,
  scaleMax,
  scaleMin,
} from './tenant/types';

export type { ScaleDirection } from './tenant/types';

/** Jeden časovaný záznam: buď událost v kategorii, nebo strukturovaná epizoda. */
export interface Entry {
  id: string;
  kind: 'event' | 'episode';
  /** klíč kategorie (u event) nebo epizody (u episode) */
  key: string;
  time: string;
  note: string;
  fields: Record<string, number | string | string[]>;
  /** volitelné symptomy 1–N navázané na událost (např. plyny u jídla) */
  symptoms?: Record<string, number>;
}

export interface DayData {
  entries: Entry[];
  scales: Record<string, number>;
  metrics: Record<string, number>;
  health: Record<string, number> | null;
  healthUnits: Record<string, string> | null;
  workouts: Workout[] | null;
  /** Záznam podle vygenerované definice; u ručně stavěných zákazníků zůstává null. */
  tracker?: unknown | null;
}

export interface Workout {
  name: string;
  start?: string;
  end?: string;
  durationMin?: number;
  energyKcal?: number;
  distanceKm?: number;
  heartRateAvg?: number;
  heartRateMax?: number;
}

export interface LabValue {
  name: string;
  value: number | string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  note?: string;
}

export interface LabMeta {
  time?: string;
  fasting?: boolean;
  lab?: string;
  reason?: string;
  context?: string;
  medication?: string;
  note?: string;
}

export interface LabDoc {
  date: string;
  meta: LabMeta;
  values: LabValue[];
  filename?: string | null;
  size?: number | null;
  uploadedAt?: string | null;
  hasPdf?: boolean;
}

export function emptyDay(): DayData {
  return { entries: [], scales: {}, metrics: {}, health: null, healthUnits: null, workouts: null, tracker: null };
}

// ---------- pomocné lookupy nad konfigurací ----------

export function categories(config: TenantConfig): CategoryDef[] {
  return config.categories ?? [];
}

export function episodes(config: TenantConfig): EpisodeDef[] {
  return config.episodes ?? [];
}

export function scales(config: TenantConfig): ScaleDef[] {
  return config.scales ?? [];
}

export function dailyMetrics(config: TenantConfig): DailyMetricDef[] {
  return config.dailyMetrics ?? [];
}

export function findCategory(config: TenantConfig, key: string): CategoryDef | undefined {
  return categories(config).find((c) => c.key === key);
}

export function findEpisode(config: TenantConfig, key: string): EpisodeDef | undefined {
  return episodes(config).find((e) => e.key === key);
}

/** Definice záznamu (kategorie nebo epizoda) i s barvou a poli. */
export function entryDef(config: TenantConfig, entry: Pick<Entry, 'kind' | 'key'>): CategoryDef | EpisodeDef | undefined {
  return entry.kind === 'episode' ? findEpisode(config, entry.key) : findCategory(config, entry.key);
}

export function symptomsFor(config: TenantConfig, categoryKey: string) {
  return (config.entrySymptoms ?? []).filter((s) => !s.categories?.length || s.categories.includes(categoryKey));
}

// ---------- normalizace / validace ----------

export function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

function str(v: unknown, maxLen = 4000): string {
  return typeof v === 'string' ? v.slice(0, maxLen) : '';
}

/** "HH:MM"; prázdný string když čas nedává smysl. */
function time(v: unknown): string {
  const m = str(v, 10).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function isValidDate(d: unknown): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

/** Hodnota jednoho pole podle jeho definice. undefined = zahodit. */
function normalizeField(def: FieldDef, raw: unknown): number | string | string[] | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  switch (def.type) {
    case 'number': {
      const n = num(raw);
      if (n === undefined) return undefined;
      if (n < (def.min ?? -Infinity) || n > (def.max ?? Infinity)) return undefined;
      return Math.round(n * 100) / 100;
    }
    case 'scale': {
      return clampInt(raw, def.min ?? 1, def.max ?? 10);
    }
    case 'select': {
      const s = str(raw, 80).trim();
      return def.options?.includes(s) ? s : undefined;
    }
    case 'multiselect': {
      if (!Array.isArray(raw)) return undefined;
      const picked = raw
        .map((x) => str(x, 80).trim())
        .filter((x) => def.options?.includes(x));
      const uniq = Array.from(new Set(picked)).slice(0, 30);
      return uniq.length ? uniq : undefined;
    }
    default: {
      const s = str(raw, 200).trim();
      return s || undefined;
    }
  }
}

/**
 * Převede libovolný (i historický) tvar záznamu na aktuální model.
 * Historie: stravovací deník ukládal { time, note, gas?, pressure? } bez typu,
 * pozdější verze { type: 'event'|'weakness', category, fields }.
 */
export function normalizeEntry(config: TenantConfig, raw: any): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id, 32) || newId();
  const t = time(raw.time);
  const note = str(raw.note).trim();

  const legacyWeakness = raw.type === 'weakness';
  const wantedKind: Entry['kind'] = raw.kind === 'episode' || legacyWeakness ? 'episode' : 'event';

  if (wantedKind === 'episode') {
    // Starý pevný typ "weakness" mapujeme na první nakonfigurovanou epizodu.
    const key = str(raw.key, 40) || (legacyWeakness ? episodes(config)[0]?.key ?? '' : '');
    const def = findEpisode(config, key);
    if (!def) return null;
    const source = legacyWeakness ? raw : raw.fields ?? {};
    const fields: Entry['fields'] = {};
    for (const f of def.fields ?? []) {
      const value = normalizeField(f, (raw.fields ?? {})[f.key] ?? source?.[f.key]);
      if (value !== undefined) fields[f.key] = value;
    }
    return { id, kind: 'episode', key: def.key, time: t, note, fields };
  }

  // Bez kategorie (nebo s neznámou) použijeme defaultCategory z konfigurace –
  // u dat z původního stravovacího deníku je to jídlo.
  const rawKey = str(raw.key, 40) || str(raw.category, 40);
  const def =
    findCategory(config, rawKey) ??
    (config.defaultCategory ? findCategory(config, config.defaultCategory) : undefined) ??
    categories(config)[0];
  if (!def) return null;

  const fields: Entry['fields'] = {};
  for (const f of def.fields ?? []) {
    const value = normalizeField(f, (raw.fields ?? {})[f.key]);
    if (value !== undefined) fields[f.key] = value;
  }

  const symptoms: Record<string, number> = {};
  for (const s of symptomsFor(config, def.key)) {
    // Symptomy chodily i jako přímé vlastnosti záznamu (gas/pressure).
    const value = clampInt(raw?.symptoms?.[s.key] ?? raw?.[s.key], 1, s.max ?? 5);
    if (value !== undefined) symptoms[s.key] = value;
  }

  const entry: Entry = { id, kind: 'event', key: def.key, time: t, note, fields };
  if (Object.keys(symptoms).length) entry.symptoms = symptoms;
  return entry;
}

export function normalizeEntries(config: TenantConfig, raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 500)
    .map((e) => normalizeEntry(config, e))
    .filter((e): e is Entry => e !== null)
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function normalizeScales(config: TenantConfig, raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const def of scales(config)) {
    const v = clampInt((raw as any)[def.key], scaleMin(def), scaleMax(def));
    if (v !== undefined) out[def.key] = v;
  }
  return out;
}

export function normalizeMetrics(config: TenantConfig, raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const def of dailyMetrics(config)) {
    const v = num((raw as any)[def.key]);
    if (v === undefined) continue;
    if (v < (def.min ?? 0) || v > (def.max ?? Infinity)) continue;
    out[def.key] = Math.round(v * 1000) / 1000;
  }
  return out;
}

export function normalizeLabValues(raw: unknown): LabValue[] {
  if (!Array.isArray(raw)) return [];
  const out: LabValue[] = [];
  for (const r of raw.slice(0, 300)) {
    const name = str(r?.name, 80).trim();
    if (!name) continue;
    const n = num(r?.value);
    const value: number | string = n !== undefined ? n : str(r?.value, 60).trim();
    if (value === '') continue;
    const item: LabValue = { name, value };
    const unit = str(r?.unit, 30).trim();
    if (unit) item.unit = unit;
    const lo = num(r?.refLow);
    const hi = num(r?.refHigh);
    if (lo !== undefined) item.refLow = lo;
    if (hi !== undefined) item.refHigh = hi;
    const note = str(r?.note, 200).trim();
    if (note) item.note = note;
    out.push(item);
  }
  return out;
}

export function normalizeLabMeta(raw: any): LabMeta {
  const meta: LabMeta = {};
  const t = time(raw?.time);
  if (t) meta.time = t;
  if (typeof raw?.fasting === 'boolean') meta.fasting = raw.fasting;
  for (const f of ['lab', 'reason', 'context', 'medication', 'note'] as const) {
    const s = str(raw?.[f], 500).trim();
    if (s) meta[f] = s;
  }
  return meta;
}

/** 'low' | 'high' | 'ok' | undefined – podle referenčního rozmezí. */
export function labFlag(v: LabValue): 'low' | 'high' | 'ok' | undefined {
  if (typeof v.value !== 'number') return undefined;
  if (v.refLow === undefined && v.refHigh === undefined) return undefined;
  if (v.refLow !== undefined && v.value < v.refLow) return 'low';
  if (v.refHigh !== undefined && v.value > v.refHigh) return 'high';
  return 'ok';
}
