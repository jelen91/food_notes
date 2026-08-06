// Doménový model zdravotního deníku. Sdílené mezi UI, API i .md exportem, aby
// popisky, klíče a validace byly na jednom místě.

export const SCALE_MIN = 1;
export const SCALE_MAX = 10;

/** Směr škály – bez něj nelze korelace správně interpretovat. */
export type ScaleDirection = 'higherBetter' | 'higherWorse';

export interface ScaleDef {
  key: string;
  label: string;
  direction: ScaleDirection;
  /** Krátké vysvětlení krajních hodnot, jde i do legendy exportu. */
  hint: string;
}

/** Denní subjektivní škály 1–10, vyplňují se jednou za den. */
export const DAILY_SCALES: ScaleDef[] = [
  { key: 'energy', label: 'Energie', direction: 'higherBetter', hint: '1 = vyčerpaný, 10 = plná energie' },
  { key: 'fatigue', label: 'Únava', direction: 'higherWorse', hint: '1 = žádná, 10 = extrémní' },
  { key: 'weakness', label: 'Slabost', direction: 'higherWorse', hint: '1 = žádná, 10 = extrémní svalová slabost' },
  { key: 'stress', label: 'Stres', direction: 'higherWorse', hint: '1 = klid, 10 = maximální stres' },
  { key: 'mood', label: 'Nálada', direction: 'higherBetter', hint: '1 = velmi špatná, 10 = výborná' },
  { key: 'recovery', label: 'Regenerace', direction: 'higherBetter', hint: '1 = necítím se zregenerovaný, 10 = plně zotavený' },
  { key: 'brainFog', label: 'Brain fog', direction: 'higherWorse', hint: '1 = jasná hlava, 10 = úplná mlha' },
  { key: 'musclePain', label: 'Bolest svalů', direction: 'higherWorse', hint: '1 = žádná, 10 = extrémní' },
  { key: 'headache', label: 'Bolest hlavy', direction: 'higherWorse', hint: '1 = žádná, 10 = extrémní' },
  { key: 'neckPain', label: 'Bolest krku', direction: 'higherWorse', hint: '1 = žádná, 10 = extrémní' },
];

export const SCALE_KEYS = DAILY_SCALES.map((s) => s.key);

export interface CategoryField {
  key: string;
  label: string;
  type: 'number' | 'text';
  unit?: string;
  placeholder?: string;
  min?: number;
  max?: number;
}

export interface CategoryDef {
  key: string;
  label: string;
  emoji: string;
  color: string;
  placeholder: string;
  /** Volitelná strukturovaná pole navíc k textové poznámce. */
  fields: CategoryField[];
}

/** Kategorie časovaných událostí. Klíče jsou ASCII slugy – jdou i do exportu. */
export const EVENT_CATEGORIES: CategoryDef[] = [
  {
    key: 'trenink',
    label: 'Trénink',
    emoji: '🏋️',
    color: '#0891b2',
    placeholder: 'Co za trénink? (např. kolo, silový, běh)',
    fields: [
      { key: 'durationMin', label: 'Délka', type: 'number', unit: 'min', min: 0, max: 1440 },
      { key: 'intensity', label: 'Intenzita', type: 'number', unit: '/10', placeholder: 'RPE 1–10', min: 1, max: 10 },
    ],
  },
  {
    key: 'jidlo',
    label: 'Jídlo',
    emoji: '🍽️',
    color: '#16a34a',
    placeholder: 'Co jsi jedl/pil?',
    fields: [],
  },
  {
    key: 'kofein',
    label: 'Kofein',
    emoji: '☕',
    color: '#92400e',
    placeholder: 'Espresso, čaj, energy drink…',
    fields: [{ key: 'amount', label: 'Množství', type: 'number', unit: 'mg', min: 0, max: 2000 }],
  },
  {
    key: 'alkohol',
    label: 'Alkohol',
    emoji: '🍺',
    color: '#b45309',
    placeholder: 'Co a kolik?',
    fields: [{ key: 'amount', label: 'Počet nápojů', type: 'number', unit: 'ks', min: 0, max: 30 }],
  },
  {
    key: 'leky',
    label: 'Léky',
    emoji: '💊',
    color: '#dc2626',
    placeholder: 'Název léku',
    fields: [{ key: 'dose', label: 'Dávka', type: 'text', placeholder: 'např. 500 mg' }],
  },
  {
    key: 'doplnky',
    label: 'Doplňky',
    emoji: '🌿',
    color: '#059669',
    placeholder: 'Název doplňku (hořčík, D3, kreatin…)',
    fields: [{ key: 'dose', label: 'Dávka', type: 'text', placeholder: 'např. 400 mg' }],
  },
  {
    key: 'stres',
    label: 'Stres',
    emoji: '⚡',
    color: '#9333ea',
    placeholder: 'Co se dělo?',
    fields: [{ key: 'intensity', label: 'Intenzita', type: 'number', unit: '/10', min: 1, max: 10 }],
  },
  {
    key: 'nemoc',
    label: 'Nemoc',
    emoji: '🤒',
    color: '#e11d48',
    placeholder: 'Příznaky, teplota, průběh…',
    fields: [{ key: 'temperature', label: 'Teplota', type: 'number', unit: '°C', min: 34, max: 43 }],
  },
  {
    key: 'prace',
    label: 'Práce',
    emoji: '💼',
    color: '#475569',
    placeholder: 'Co jsi dělal?',
    fields: [{ key: 'durationMin', label: 'Délka', type: 'number', unit: 'min', min: 0, max: 1440 }],
  },
  {
    key: 'cestovani',
    label: 'Cestování',
    emoji: '✈️',
    color: '#0284c7',
    placeholder: 'Kam a čím?',
    fields: [{ key: 'durationMin', label: 'Délka', type: 'number', unit: 'min', min: 0, max: 2880 }],
  },
  {
    key: 'poznamka',
    label: 'Poznámka',
    emoji: '📝',
    color: '#6b7280',
    placeholder: 'Cokoli dalšího',
    fields: [],
  },
];

export const CATEGORY_BY_KEY: Record<string, CategoryDef> = Object.fromEntries(
  EVENT_CATEGORIES.map((c) => [c.key, c])
);

/** Záznamy z původního stravovacího deníku nemají kategorii – byly to výhradně jídla. */
export const LEGACY_CATEGORY = 'jidlo';

/** Volitelné trávicí symptomy 1–5 navázané na konkrétní událost (historicky u jídel). */
export const ENTRY_SYMPTOMS: Array<{ key: 'gas' | 'pressure'; label: string; tag: string }> = [
  { key: 'gas', label: 'Plyny', tag: 'Plyny' },
  { key: 'pressure', label: 'Tlak v břiše', tag: 'Tlak' },
];

/** Výběrová pole epizody slabosti. Ukládají se jako pole slugů. */
export const WEAKNESS_OPTIONS = {
  bodyParts: ['nohy', 'ruce', 'celé tělo', 'záda', 'krk', 'hlava'],
  triggers: [
    'po tréninku',
    'po jídle',
    'nalačno / hlad',
    'po probuzení',
    'stres',
    'horko',
    'dlouhé stání',
    'po alkoholu',
    'bez zjevné příčiny',
  ],
  symptoms: [
    'závrať',
    'bušení srdce',
    'třes',
    'pocení',
    'nevolnost',
    'brnění',
    'dušnost',
    'mlha v hlavě',
    'rozmazané vidění',
    'blízko mdlobě',
  ],
  relief: ['odpočinek', 'jídlo', 'cukr', 'voda / elektrolyty', 'spánek', 'odeznělo samo', 'nepomohlo nic'],
};

export interface EventEntry {
  id: string;
  type: 'event';
  time: string;
  category: string;
  note: string;
  /** Hodnoty polí definovaných kategorií (durationMin, amount, dose…). */
  fields: Record<string, number | string>;
  gas?: number;
  pressure?: number;
}

export interface WeaknessEntry {
  id: string;
  type: 'weakness';
  time: string;
  severity?: number;
  durationMin?: number;
  /** Hodiny od posledního jídla – klíčové pro hypotézy okolo glykémie. */
  lastMealHoursAgo?: number;
  bodyParts: string[];
  triggers: string[];
  symptoms: string[];
  relief: string[];
  note: string;
}

export type Entry = EventEntry | WeaknessEntry;

export interface DayDoc {
  date: string;
  entries: Entry[];
  scales: Record<string, number>;
  health: Record<string, number> | null;
  healthUnits?: Record<string, string> | null;
  workouts?: Workout[] | null;
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
  /** Čas odběru (HH:MM) – u ranních odběrů nalačno má vliv na řadu parametrů. */
  time?: string;
  fasting?: boolean;
  lab?: string;
  reason?: string;
  /** Kontext odběru: po tréninku, po nemoci, při epizodě slabosti… */
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

// ---------- normalizace / validace ----------

export function clampInt(v: unknown, min: number, max: number): number | undefined {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

export function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown, maxLen = 4000): string {
  return typeof v === 'string' ? v.slice(0, maxLen) : '';
}

function strList(v: unknown, allowed?: string[]): string[] {
  if (!Array.isArray(v)) return [];
  const out = v.map((x) => str(x, 60)).filter(Boolean);
  const filtered = allowed ? out.filter((x) => allowed.includes(x)) : out;
  return Array.from(new Set(filtered)).slice(0, 20);
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

/**
 * Převede libovolný (i historický) tvar záznamu na aktuální model.
 * Historické záznamy stravovacího deníku = { time, note, gas?, pressure? } bez kategorie.
 */
export function normalizeEntry(raw: any): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = str(raw.id, 32) || newId();
  const t = time(raw.time);

  if (raw.type === 'weakness') {
    const entry: WeaknessEntry = {
      id,
      type: 'weakness',
      time: t,
      bodyParts: strList(raw.bodyParts, WEAKNESS_OPTIONS.bodyParts),
      triggers: strList(raw.triggers, WEAKNESS_OPTIONS.triggers),
      symptoms: strList(raw.symptoms, WEAKNESS_OPTIONS.symptoms),
      relief: strList(raw.relief, WEAKNESS_OPTIONS.relief),
      note: str(raw.note).trim(),
    };
    const severity = clampInt(raw.severity, SCALE_MIN, SCALE_MAX);
    const durationMin = clampInt(raw.durationMin, 0, 24 * 60);
    const lastMeal = num(raw.lastMealHoursAgo);
    if (severity !== undefined) entry.severity = severity;
    if (durationMin !== undefined) entry.durationMin = durationMin;
    if (lastMeal !== undefined && lastMeal >= 0 && lastMeal <= 48) {
      entry.lastMealHoursAgo = Math.round(lastMeal * 10) / 10;
    }
    return entry;
  }

  const category = CATEGORY_BY_KEY[str(raw.category, 40)] ? String(raw.category) : LEGACY_CATEGORY;
  const def = CATEGORY_BY_KEY[category];
  const fields: Record<string, number | string> = {};
  for (const f of def.fields) {
    const value = raw?.fields?.[f.key];
    if (value === undefined || value === null || value === '') continue;
    if (f.type === 'number') {
      const n = num(value);
      if (n === undefined) continue;
      const min = f.min ?? -Infinity;
      const max = f.max ?? Infinity;
      if (n < min || n > max) continue;
      fields[f.key] = Math.round(n * 100) / 100;
    } else {
      const s = str(value, 120).trim();
      if (s) fields[f.key] = s;
    }
  }

  const entry: EventEntry = {
    id,
    type: 'event',
    time: t,
    category,
    note: str(raw.note).trim(),
    fields,
  };
  const gas = clampInt(raw.gas, 1, 5);
  const pressure = clampInt(raw.pressure, 1, 5);
  if (gas !== undefined) entry.gas = gas;
  if (pressure !== undefined) entry.pressure = pressure;
  return entry;
}

export function normalizeEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 500)
    .map(normalizeEntry)
    .filter((e): e is Entry => e !== null)
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Ponechá jen známé škály s hodnotou 1–10; ostatní klíče zahodí. */
export function normalizeScales(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const def of DAILY_SCALES) {
    const v = clampInt((raw as any)[def.key], SCALE_MIN, SCALE_MAX);
    if (v !== undefined) out[def.key] = v;
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
  const fields: Array<keyof LabMeta> = ['lab', 'reason', 'context', 'medication', 'note'];
  for (const f of fields) {
    const s = str(raw?.[f], 500).trim();
    if (s) (meta as any)[f] = s;
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

export function isValidDate(d: unknown): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}
