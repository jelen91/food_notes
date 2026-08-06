// Import a popisky dat z Apple Health (aplikace Health Auto Export).
// Cílem je nepřijít o žádnou metriku: co appka pošle, to uložíme – známé metriky
// dostanou hezký český popisek, neznámé se uloží pod odvozeným klíčem i s jednotkou.

import { Workout } from './schema';

export interface HealthMeta {
  label: string;
  unit?: string;
}

/** Popisky známých metrik. Neznámé klíče se humanizují automaticky. */
export const HEALTH_LABELS: Record<string, HealthMeta> = {
  activeEnergy: { label: 'Aktivní kalorie', unit: 'kcal' },
  totalEnergy: { label: 'Celkové kalorie', unit: 'kcal' },
  restingEnergy: { label: 'Klidové kalorie', unit: 'kcal' },
  exerciseMinutes: { label: 'Cvičení', unit: 'min' },
  standMinutes: { label: 'Minuty ve stoje', unit: 'min' },
  standHours: { label: 'Hodiny stání (kroužek)', unit: 'h' },
  steps: { label: 'Kroky' },
  distanceKm: { label: 'Vzdálenost (chůze/běh)', unit: 'km' },
  cyclingDistance: { label: 'Vzdálenost na kole', unit: 'km' },
  swimmingDistance: { label: 'Uplavaná vzdálenost', unit: 'm' },
  flightsClimbed: { label: 'Vyšlapaná patra' },
  sleepHours: { label: 'Spánek celkem', unit: 'h' },
  sleepInBed: { label: 'V posteli', unit: 'h' },
  sleepDeep: { label: 'Hluboký spánek', unit: 'h' },
  sleepRem: { label: 'REM spánek', unit: 'h' },
  sleepCore: { label: 'Lehký spánek', unit: 'h' },
  sleepAwake: { label: 'Probuzení v noci', unit: 'h' },
  restingHeartRate: { label: 'Klidový tep', unit: 'bpm' },
  heartRateAvg: { label: 'Průměrný tep', unit: 'bpm' },
  heartRateAvgMin: { label: 'Nejnižší tep', unit: 'bpm' },
  heartRateAvgMax: { label: 'Nejvyšší tep', unit: 'bpm' },
  walkingHeartRate: { label: 'Tep při chůzi', unit: 'bpm' },
  heartRateRecovery: { label: 'Zotavení tepu po cvičení', unit: 'bpm' },
  hrv: { label: 'HRV (variabilita tepu)', unit: 'ms' },
  respiratoryRate: { label: 'Dechová frekvence', unit: '/min' },
  bloodOxygen: { label: 'Kyslík v krvi', unit: '%' },
  bloodGlucose: { label: 'Glykémie', unit: 'mmol/l' },
  bloodPressureSystolic: { label: 'Tlak systolický', unit: 'mmHg' },
  bloodPressureDiastolic: { label: 'Tlak diastolický', unit: 'mmHg' },
  bodyTemperature: { label: 'Tělesná teplota', unit: '°C' },
  wristTemperature: { label: 'Teplota zápěstí (odchylka)', unit: '°C' },
  weightKg: { label: 'Váha', unit: 'kg' },
  bodyFatPct: { label: 'Tělesný tuk', unit: '%' },
  leanBodyMass: { label: 'Aktivní tělesná hmota', unit: 'kg' },
  bmi: { label: 'BMI' },
  vo2Max: { label: 'VO2 max', unit: 'ml/kg/min' },
  timeInDaylight: { label: 'Na denním světle', unit: 'min' },
  walkingSpeed: { label: 'Rychlost chůze', unit: 'km/h' },
  walkingStepLength: { label: 'Délka kroku', unit: 'cm' },
  walkingAsymmetryPercentage: { label: 'Asymetrie chůze', unit: '%' },
  walkingDoubleSupportPercentage: { label: 'Dvojí opora při chůzi', unit: '%' },
  sixMinuteWalkingTestDistance: { label: '6minutový test chůze', unit: 'm' },
  stairSpeedUp: { label: 'Rychlost do schodů', unit: 'm/s' },
  stairSpeedDown: { label: 'Rychlost ze schodů', unit: 'm/s' },
  physicalEffort: { label: 'Fyzická námaha', unit: 'MET' },
  headphoneAudioExposure: { label: 'Hlasitost ve sluchátkách', unit: 'dB' },
  environmentalAudioExposure: { label: 'Hlučnost okolí', unit: 'dB' },
  dietaryEnergy: { label: 'Přijatá energie', unit: 'kcal' },
  dietaryWater: { label: 'Vypitá voda', unit: 'l' },
  dietaryCaffeine: { label: 'Kofein (Health)', unit: 'mg' },
  dietaryProtein: { label: 'Bílkoviny', unit: 'g' },
  dietaryCarbohydrates: { label: 'Sacharidy', unit: 'g' },
  dietaryFatTotal: { label: 'Tuky', unit: 'g' },
  mindfulMinutes: { label: 'Mindfulness', unit: 'min' },
};

/** Názvy metrik z Health Auto Export → naše klíče. Co tu není, se převede na camelCase. */
const HAE_METRIC_MAP: Record<string, string> = {
  step_count: 'steps',
  active_energy: 'activeEnergy',
  basal_energy_burned: 'restingEnergy',
  apple_exercise_time: 'exerciseMinutes',
  apple_stand_time: 'standMinutes',
  apple_stand_hour: 'standHours',
  walking_running_distance: 'distanceKm',
  heart_rate: 'heartRateAvg',
  resting_heart_rate: 'restingHeartRate',
  walking_heart_rate_average: 'walkingHeartRate',
  heart_rate_variability: 'hrv',
  heart_rate_recovery_one_minute: 'heartRateRecovery',
  respiratory_rate: 'respiratoryRate',
  blood_oxygen_saturation: 'bloodOxygen',
  blood_glucose: 'bloodGlucose',
  blood_pressure: 'bloodPressure',
  body_temperature: 'bodyTemperature',
  apple_sleeping_wrist_temperature: 'wristTemperature',
  weight_body_mass: 'weightKg',
  body_fat_percentage: 'bodyFatPct',
  lean_body_mass: 'leanBodyMass',
  body_mass_index: 'bmi',
  vo2_max: 'vo2Max',
  sleep_analysis: 'sleep',
  mindful_minutes: 'mindfulMinutes',
  dietary_energy: 'dietaryEnergy',
  dietary_water: 'dietaryWater',
  dietary_caffeine: 'dietaryCaffeine',
};

/** Metriky, které se přes den sčítají. Ostatní se průměrují. */
const CUMULATIVE_NAMES = new Set([
  'step_count',
  'active_energy',
  'basal_energy_burned',
  'apple_exercise_time',
  'apple_stand_time',
  'apple_stand_hour',
  'walking_running_distance',
  'cycling_distance',
  'swimming_distance',
  'wheelchair_distance',
  'flights_climbed',
  'time_in_daylight',
  'sleep_analysis',
  'mindful_minutes',
  'toothbrushing',
  'handwashing',
]);

function isCumulative(rawName: string): boolean {
  if (CUMULATIVE_NAMES.has(rawName)) return true;
  // Heuristika pro metriky, které v mapě nejsou (uživatel si v HAE může zapnout cokoli).
  return /_(count|distance|energy|time|intake)$/.test(rawName) || rawName.startsWith('dietary_');
}

export function camelCase(s: string): string {
  return s.replace(/[_\s]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
}

/** "resting_heart_rate" / "restingHeartRate" → "Resting heart rate" (fallback popisek). */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function metricLabel(key: string): string {
  return HEALTH_LABELS[key]?.label ?? humanizeKey(key);
}

export function metricUnit(key: string, units?: Record<string, string> | null): string {
  // U známých metrik dáváme přednost vlastní jednotce (hezčí než "hr" nebo "count" z HAE).
  const known = HEALTH_LABELS[key];
  if (known) return known.unit ?? '';
  const raw = units?.[key] ?? '';
  return raw === 'count' ? '' : raw;
}

export function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) >= 1000) return v.toLocaleString('cs-CZ', { maximumFractionDigits: 0 });
  return String(Math.round(v * 100) / 100);
}

export function healthRows(
  health: Record<string, number | string> | null | undefined,
  units?: Record<string, string> | null
): Array<{ key: string; label: string; value: string }> {
  if (!health) return [];
  return Object.entries(health)
    .map(([key, value]) => {
      const unit = metricUnit(key, units);
      const shown = typeof value === 'number' ? formatNumber(value) : String(value);
      return { key, label: metricLabel(key), value: unit ? `${shown} ${unit}` : shown };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'cs'));
}

// ---------- parsování payloadu z Health Auto Export ----------

type Agg = 'sum' | 'avg' | 'min' | 'max';

interface Bucket {
  sum: number;
  count: number;
  min: number;
  max: number;
  agg: Agg;
  unit?: string;
}

export interface ParsedDay {
  health: Record<string, number>;
  units: Record<string, string>;
  workouts: Workout[];
}

function toNum(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

/** "2026-05-12 00:00:00 +0200" i "2026-05-12T10:00:00Z" → "2026-05-12" */
function toDateKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

const IGNORED_POINT_FIELDS = new Set(['date', 'source', 'timezone', 'units', 'sleepStart', 'sleepEnd', 'sleepEndDate', 'sleepStartDate']);

/** Pole datového bodu → (klíč metriky, způsob agregace). */
function fieldToKey(baseKey: string, field: string, cumulative: boolean): { key: string; agg: Agg } | null {
  const f = field.toLowerCase();
  if (f === 'qty' || f === 'value' || f === 'avg') {
    // U spánku je "hlavní" hodnota celková doba spánku, ne holý klíč "sleep".
    if (baseKey === 'sleep') return { key: 'sleepHours', agg: 'sum' };
    return { key: baseKey, agg: cumulative ? 'sum' : 'avg' };
  }
  if (f === 'min') return { key: `${baseKey}Min`, agg: 'min' };
  if (f === 'max') return { key: `${baseKey}Max`, agg: 'max' };
  // Ostatní pojmenovaná pole (asleep, inBed, deep, rem, core, awake, systolic, diastolic, …)
  const suffix = field.charAt(0).toUpperCase() + field.slice(1);
  if (baseKey === 'sleep') {
    const map: Record<string, string> = {
      asleep: 'sleepHours',
      totalSleep: 'sleepHours',
      inBed: 'sleepInBed',
      deep: 'sleepDeep',
      rem: 'sleepRem',
      core: 'sleepCore',
      awake: 'sleepAwake',
    };
    const key = map[field] ?? `sleep${suffix}`;
    return { key, agg: 'sum' };
  }
  return { key: `${baseKey}${suffix}`, agg: cumulative ? 'sum' : 'avg' };
}

function push(acc: Record<string, Record<string, Bucket>>, date: string, key: string, value: number, agg: Agg, unit?: string) {
  if (!acc[date]) acc[date] = {};
  const b = acc[date][key];
  if (!b) {
    acc[date][key] = { sum: value, count: 1, min: value, max: value, agg, unit };
    return;
  }
  b.sum += value;
  b.count += 1;
  b.min = Math.min(b.min, value);
  b.max = Math.max(b.max, value);
  if (!b.unit && unit) b.unit = unit;
}

function reduceBucket(b: Bucket): number {
  const v = b.agg === 'sum' ? b.sum : b.agg === 'min' ? b.min : b.agg === 'max' ? b.max : b.sum / b.count;
  return Math.round(v * 100) / 100;
}

function parseWorkouts(raw: unknown): Record<string, Workout[]> {
  const byDate: Record<string, Workout[]> = {};
  if (!Array.isArray(raw)) return byDate;
  for (const w of raw) {
    const date = toDateKey(w?.start ?? w?.startDate ?? w?.date);
    if (!date) continue;
    const qty = (v: any): number | undefined => {
      const n = toNum(v?.qty ?? v);
      return n == null ? undefined : Math.round(n * 100) / 100;
    };
    // HAE posílá duration v sekundách; menší čísla ale bývají minuty – normalizujeme na minuty.
    const rawDuration = toNum(w?.duration);
    let durationMin: number | undefined;
    if (rawDuration != null) durationMin = Math.round(rawDuration > 600 ? rawDuration / 60 : rawDuration);
    const workout: Workout = { name: String(w?.name ?? w?.workoutActivityType ?? 'Trénink').slice(0, 80) };
    if (typeof w?.start === 'string') workout.start = w.start.slice(11, 16);
    if (typeof w?.end === 'string') workout.end = w.end.slice(11, 16);
    if (durationMin !== undefined) workout.durationMin = durationMin;
    const energy = qty(w?.activeEnergyBurned ?? w?.activeEnergy);
    const distance = qty(w?.distance);
    const hrAvg = qty(w?.avgHeartRate ?? w?.averageHeartRate);
    const hrMax = qty(w?.maxHeartRate);
    if (energy !== undefined) workout.energyKcal = energy;
    if (distance !== undefined) workout.distanceKm = distance;
    if (hrAvg !== undefined) workout.heartRateAvg = hrAvg;
    if (hrMax !== undefined) workout.heartRateMax = hrMax;
    (byDate[date] ||= []).push(workout);
  }
  return byDate;
}

/**
 * Health Auto Export posílá { data: { metrics: [ { name, units, data: [ { date, qty | Avg | asleep … } ] } ], workouts: [...] } }.
 * Datové body chodí po hodinách/minutách – kumulativní metriky sečteme, ostatní zprůměrujeme,
 * min/max si necháme zvlášť. Vrací data rozpadlá po dnech, nebo null když payload není z HAE.
 */
export function parseHealthAutoExport(body: any): Record<string, ParsedDay> | null {
  const metrics = body?.data?.metrics ?? body?.metrics;
  const workoutsRaw = body?.data?.workouts ?? body?.workouts;
  if (!Array.isArray(metrics) && !Array.isArray(workoutsRaw)) return null;

  const acc: Record<string, Record<string, Bucket>> = {};

  for (const metric of Array.isArray(metrics) ? metrics : []) {
    const rawName = String(metric?.name ?? '').trim();
    if (!rawName || !Array.isArray(metric?.data)) continue;
    const baseKey = HAE_METRIC_MAP[rawName] ?? camelCase(rawName);
    const cumulative = isCumulative(rawName);
    const unit = typeof metric?.units === 'string' ? metric.units : undefined;

    for (const point of metric.data) {
      const date = toDateKey(point?.date);
      if (!date || !point || typeof point !== 'object') continue;
      for (const [field, rawValue] of Object.entries(point)) {
        if (IGNORED_POINT_FIELDS.has(field)) continue;
        const value = toNum(rawValue);
        if (value == null) continue;
        const target = fieldToKey(baseKey, field, cumulative);
        if (!target) continue;
        push(acc, date, target.key, value, target.agg, unit);
      }
    }
  }

  const workoutsByDate = parseWorkouts(workoutsRaw);
  const dates = Array.from(new Set([...Object.keys(acc), ...Object.keys(workoutsByDate)]));
  if (!dates.length) return null;

  const out: Record<string, ParsedDay> = {};
  for (const date of dates) {
    const health: Record<string, number> = {};
    const units: Record<string, string> = {};
    for (const [key, bucket] of Object.entries(acc[date] ?? {})) {
      health[key] = reduceBucket(bucket);
      if (bucket.unit) units[key] = bucket.unit;
    }
    out[date] = { health, units, workouts: workoutsByDate[date] ?? [] };
  }
  return out;
}
