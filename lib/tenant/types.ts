// Definice zákaznické aplikace. Celá aplikace se vykresluje z této konfigurace –
// jeden engine, žádné forky kódu. Konfigurace žijí jako soubory v `tenants/*.json`,
// takže změna pro zákazníka je verzovaná v gitu a jde vrátit zpět.

export type ScaleDirection = 'higherBetter' | 'higherWorse';

export interface ScaleDef {
  key: string;
  label: string;
  direction: ScaleDirection;
  hint?: string;
  min?: number;
  max?: number;
}

/** Denní číselný údaj – voda, váha ráno, počet cigaret, cokoli se vyplňuje jednou za den. */
export interface DailyMetricDef {
  key: string;
  label: string;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
  /** Rychlá tlačítka pro přičtení hodnoty (např. +0.25 l na sklenici vody). */
  quickAdd?: number[];
}

export type FieldType = 'number' | 'text' | 'select' | 'multiselect' | 'scale';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  /** Volby pro select/multiselect. */
  options?: string[];
  direction?: ScaleDirection;
}

export interface CategoryDef {
  key: string;
  label: string;
  emoji?: string;
  color?: string;
  placeholder?: string;
  fields?: FieldDef[];
}

/** Strukturovaná událost typu „Epizoda slabosti“ – zákazník jich může mít víc druhů. */
export interface EpisodeDef {
  key: string;
  label: string;
  emoji?: string;
  color?: string;
  placeholder?: string;
  fields?: FieldDef[];
}

/** Symptom hodnocený u konkrétní události (historicky plyny/tlak u jídla). */
export interface EntrySymptomDef {
  key: string;
  label: string;
  max?: number;
  /** Zobrazí se jen u těchto kategorií; prázdné = u všech. */
  categories?: string[];
}

export interface TenantModules {
  health?: boolean;
  labs?: boolean;
  export?: boolean;
  history?: boolean;
}

export interface TenantTheme {
  brand?: string;
  brandDark?: string;
  accent?: string;
}

export interface TenantExportConfig {
  maxLagDays?: number;
  /** Na co se má analýza zaměřit – jde do zadání pro AI. */
  focus?: string;
  /** Další věty do sekce o limitech dat. */
  caveats?: string[];
}

export interface TenantConfig {
  /** Interní ID zákazníka (např. "1151"). Nikdy není v URL. */
  id: string;
  /** Náhodný řetězec v URL: /t/<slug> */
  slug: string;
  /** Interní jméno zákazníka pro tebe (nezobrazuje se v appce). */
  customer?: string;
  /** Nadpis a podtitulek v hlavičce aplikace. */
  title: string;
  subtitle?: string;
  theme?: TenantTheme;
  modules?: TenantModules;
  scales?: ScaleDef[];
  dailyMetrics?: DailyMetricDef[];
  categories?: CategoryDef[];
  /**
   * Kategorie pro záznamy bez určené kategorie – typicky historická data z doby,
   * kdy aplikace kategorie ještě neměla. Bez ní se použije první kategorie v pořadí.
   */
  defaultCategory?: string;
  episodes?: EpisodeDef[];
  entrySymptoms?: EntrySymptomDef[];
  export?: TenantExportConfig;
  /** Poznámka pro tebe – co si zákazník přál, kdy naposledy měněno. */
  notes?: string;
  active?: boolean;
}

export const DEFAULT_SCALE_MIN = 1;
export const DEFAULT_SCALE_MAX = 10;
export const DEFAULT_MAX_LAG_DAYS = 14;

export function scaleMin(s: Pick<ScaleDef, 'min'>): number {
  return s.min ?? DEFAULT_SCALE_MIN;
}

export function scaleMax(s: Pick<ScaleDef, 'max'>): number {
  return s.max ?? DEFAULT_SCALE_MAX;
}
