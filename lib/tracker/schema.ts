// Schéma vygenerovaného trackeru a jeho nezávislá validace.
//
// Claude vrací **jen data**, nikdy kód. Tenhle modul je bezpečnostní hranice: cokoli, co
// neprojde, se neuloží ani po částech. Kontroluje se allowlist typů polí, limity velikosti,
// odkazy mezi poli, cykly v podmíněném zobrazení a nepřítomnost spustitelného obsahu.

import { z } from 'zod';

export const TRACKER_SCHEMA_VERSION = 1;

/** Povolené typy polí. Cokoli mimo tenhle seznam se odmítá. */
export const FIELD_TYPES = [
  'boolean',
  'number',
  'scale',
  'short_text',
  'long_text',
  'single_select',
  'multi_select',
  'date',
  'time',
  'duration',
  'meal',
  'sleep',
  'exercise',
  'symptom',
  'stool_bristol',
  'medication_or_supplement',
  'custom_observation',
] as const;

export type TrackerFieldType = (typeof FIELD_TYPES)[number];

/** Typy, které dávají smysl jako opakovaná událost s časem (sekce typu timeline). */
export const EVENT_FIELD_TYPES: TrackerFieldType[] = [
  'meal',
  'exercise',
  'medication_or_supplement',
  'symptom',
  'custom_observation',
  'short_text',
  'number',
  'duration',
  'scale',
  'single_select',
  'multi_select',
  'stool_bristol',
];

/** Typy, které potřebují volby. */
const NEEDS_OPTIONS: TrackerFieldType[] = ['single_select', 'multi_select'];

export const LIMITS = {
  sections: 12,
  fieldsTotal: 80,
  fieldsPerSection: 20,
  options: 30,
  labelChars: 120,
  descriptionChars: 600,
  titleChars: 120,
  idChars: 40,
  optionValueChars: 60,
  optionLabelChars: 80,
  disclaimerChars: 600,
} as const;

/** Bezpečný identifikátor: písmena, číslice, podtržítko. Použije se i jako klíč v databázi. */
const ID = z
  .string()
  .min(1)
  .max(LIMITS.idChars)
  .regex(/^[a-z][a-z0-9_]*$/, 'id musí být a–z, 0–9 a _ a začínat písmenem');

/**
 * Text bez spustitelného nebo aktivního obsahu. Kontrolujeme HTML značky, uvozovací sekvence,
 * javascript:/data: odkazy i obyčejné URL – vygenerovaný tracker nemá důvod nikam odkazovat.
 */
const UNSAFE_PATTERNS: Array<{ re: RegExp; why: string }> = [
  { re: /<[^>]*>/, why: 'HTML značka' },
  { re: /&#|&lt;|&gt;/i, why: 'HTML entita' },
  { re: /javascript:|data:|vbscript:/i, why: 'aktivní odkaz' },
  { re: /https?:\/\//i, why: 'odkaz' },
  { re: /\{\{|\}\}|\$\{/, why: 'šablonový výraz' },
  { re: /\bon(click|error|load|mouseover)\s*=/i, why: 'obsluha události' },
  // eslint-disable-next-line no-control-regex
  { re: /[\u0000-\u001f\u007f]/, why: 'řídicí znak' },
];

function safeText(max: number, label: string) {
  return z
    .string()
    .max(max, `${label}: překročena délka ${max}`)
    .superRefine((value, ctx) => {
      const hit = UNSAFE_PATTERNS.find((p) => p.re.test(value));
      if (hit) {
        ctx.addIssue({ code: 'custom', message: `${label}: nepovolený obsah (${hit.why})` });
      }
    });
}

const OptionSchema = z
  .object({
    value: ID.max(LIMITS.optionValueChars),
    label: safeText(LIMITS.optionLabelChars, 'volba').min(1),
  })
  .strict();

const VisibilitySchema = z
  .object({
    dependsOnFieldId: ID,
    operator: z.enum(['equals', 'not_equals', 'contains']),
    value: z.union([safeText(LIMITS.optionValueChars, 'podmínka'), z.number(), z.boolean()]),
  })
  .strict();

const FieldSchema = z
  .object({
    id: ID,
    type: z.enum(FIELD_TYPES),
    label: safeText(LIMITS.labelChars, 'popisek').min(1),
    description: safeText(LIMITS.descriptionChars, 'popis').optional(),
    required: z.boolean(),
    order: z.number().int().min(0).max(999),
    unit: safeText(24, 'jednotka').optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    /** U škál: znamená vyšší hodnota lepší stav? Bez toho nejde korelace interpretovat. */
    higherIsBetter: z.boolean().optional(),
    options: z.array(OptionSchema).max(LIMITS.options).optional(),
    visibility: VisibilitySchema.optional(),
  })
  .strict();

const SectionSchema = z
  .object({
    id: ID,
    title: safeText(LIMITS.titleChars, 'nadpis sekce').min(1),
    description: safeText(LIMITS.descriptionChars, 'popis sekce').optional(),
    /** daily = vyplňuje se jednou za den, timeline = události s časem, klidně víckrát denně. */
    kind: z.enum(['daily', 'timeline']),
    order: z.number().int().min(0).max(999),
    fields: z.array(FieldSchema).min(1).max(LIMITS.fieldsPerSection),
  })
  .strict();

export const TrackerDefinitionSchema = z
  .object({
    schemaVersion: z.literal(TRACKER_SCHEMA_VERSION),
    title: safeText(LIMITS.titleChars, 'název').min(1),
    description: safeText(LIMITS.descriptionChars, 'popis').min(1),
    disclaimer: safeText(LIMITS.disclaimerChars, 'upozornění').min(1),
    estimatedDailyMinutes: z.number().int().min(1).max(60).optional(),
    sections: z.array(SectionSchema).min(1).max(LIMITS.sections),
  })
  .strict();

export type TrackerDefinition = z.infer<typeof TrackerDefinitionSchema>;
export type TrackerSection = z.infer<typeof SectionSchema>;
export type TrackerField = z.infer<typeof FieldSchema>;

// Projekt běží s `strict: false`, kde se rozlišené sjednocení podle boolean literálu
// nezužuje spolehlivě – proto jeden tvar s volitelnými poli.
export interface ValidationResult {
  ok: boolean;
  definition?: TrackerDefinition;
  problems?: string[];
}

/**
 * Kontroly, které Zod sám neudělá: jedinečnost ID napříč celou definicí, celkový počet polí,
 * smysluplnost číselných mezí, existence odkazů v podmíněném zobrazení a absence cyklů.
 */
function semanticProblems(def: TrackerDefinition): string[] {
  const problems: string[] = [];

  const sectionIds = new Set<string>();
  for (const s of def.sections) {
    if (sectionIds.has(s.id)) problems.push(`sekce "${s.id}" je definovaná dvakrát`);
    sectionIds.add(s.id);
  }

  const fieldById = new Map<string, TrackerField>();
  let total = 0;
  for (const section of def.sections) {
    for (const f of section.fields) {
      total += 1;
      if (fieldById.has(f.id)) problems.push(`pole "${f.id}" je definované dvakrát`);
      fieldById.set(f.id, f);

      if (NEEDS_OPTIONS.includes(f.type) && !f.options?.length) {
        problems.push(`pole "${f.id}": typ ${f.type} vyžaduje options`);
      }
      if (!NEEDS_OPTIONS.includes(f.type) && f.options?.length) {
        problems.push(`pole "${f.id}": typ ${f.type} nesmí mít options`);
      }
      if (f.options) {
        const values = new Set<string>();
        for (const o of f.options) {
          if (values.has(o.value)) problems.push(`pole "${f.id}": volba "${o.value}" je dvakrát`);
          values.add(o.value);
        }
      }
      if (f.min !== undefined && f.max !== undefined && f.min >= f.max) {
        problems.push(`pole "${f.id}": min musí být menší než max`);
      }
      if (f.type === 'scale') {
        if (f.min === undefined || f.max === undefined) {
          problems.push(`pole "${f.id}": škála musí mít min a max`);
        } else if (f.max - f.min > 10 || f.max - f.min < 2) {
          problems.push(`pole "${f.id}": škála musí mít 3 až 11 stupňů`);
        }
      }
      if (f.step !== undefined && f.min !== undefined && f.max !== undefined && f.step > f.max - f.min) {
        problems.push(`pole "${f.id}": step je větší než celý rozsah`);
      }
      if (section.kind === 'timeline' && !EVENT_FIELD_TYPES.includes(f.type)) {
        problems.push(`pole "${f.id}": typ ${f.type} nelze použít v sekci typu timeline`);
      }
    }
  }

  if (total > LIMITS.fieldsTotal) problems.push(`celkem ${total} polí, maximum je ${LIMITS.fieldsTotal}`);

  // Reference a cykly v podmíněném zobrazení.
  for (const [id, field] of Array.from(fieldById.entries())) {
    if (!field.visibility) continue;
    const target = field.visibility.dependsOnFieldId;
    if (target === id) {
      problems.push(`pole "${id}": podmínka odkazuje samo na sebe`);
      continue;
    }
    if (!fieldById.has(target)) {
      problems.push(`pole "${id}": podmínka odkazuje na neexistující pole "${target}"`);
      continue;
    }
    const seen = new Set<string>([id]);
    let cursor = target;
    while (true) {
      if (seen.has(cursor)) {
        problems.push(`pole "${id}": cyklická závislost v podmíněném zobrazení`);
        break;
      }
      seen.add(cursor);
      const next = fieldById.get(cursor)?.visibility?.dependsOnFieldId;
      if (!next) break;
      cursor = next;
    }
  }

  return problems;
}

/** Jediný vstupní bod validace. Buď je definice celá v pořádku, nebo se neuloží nic. */
export function validateTrackerDefinition(raw: unknown): ValidationResult {
  const parsed = TrackerDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(kořen)'}: ${i.message}`);
    return { ok: false, problems };
  }
  const problems = semanticProblems(parsed.data);
  if (problems.length) return { ok: false, problems };
  return { ok: true, definition: parsed.data };
}
