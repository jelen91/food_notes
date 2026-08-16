// JSON Schema, kterým se omezuje výstup modelu (structured outputs).
//
// Píšeme ho ručně místo generování ze Zod schématu: structured outputs nepodporují číselné
// ani délkové constraints, takže by se stejně musely odstranit. Tenhle soubor drží tvar
// (typy, výčty, povinná pole), limity a bezpečnostní kontroly hlídá `validateTrackerDefinition`.
//
// POZOR na složitost: API ze schématu kompiluje gramatiku a má na to vlastní časový limit.
// Každá unie (`anyOf`) a každá volitelná vlastnost navíc kompilaci prodlužují. Měřeno na
// claude-opus-5: plná verze s unií spadla na „Grammar compilation timed out", bez unie
// 101 s, bez unie a bez `step` 56 s. Než sem něco přidáš, změř to.

import { EVENT_FIELD_TYPES, FIELD_TYPES, TRACKER_SCHEMA_VERSION } from './schema';

const optionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    value: { type: 'string', description: 'strojový klíč volby: malá písmena, číslice, podtržítko' },
    label: { type: 'string', description: 'text volby pro uživatele, česky' },
  },
  required: ['value', 'label'],
};

const visibilitySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dependsOnFieldId: { type: 'string', description: 'id jiného pole, které je ve výstupu uvedené dřív' },
    operator: { type: 'string', enum: ['equals', 'not_equals', 'contains'] },
    // Vždy string, i pro čísla a ano/ne. Unie tady dramaticky prodlužuje kompilaci
    // gramatiky pro structured outputs (u nás z 56 s na 101 s); porovnání je typově tolerantní.
    value: { type: 'string' },
  },
  required: ['dependsOnFieldId', 'operator', 'value'],
};

const fieldSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'malá písmena, číslice a podtržítko, začíná písmenem' },
    type: { type: 'string', enum: [...FIELD_TYPES] },
    label: { type: 'string', description: 'česky, stručně' },
    description: { type: 'string', description: 'nepovinné neutrální vysvětlení, česky' },
    required: { type: 'boolean' },
    order: { type: 'integer', description: 'pořadí v sekci od 0' },
    unit: { type: 'string', description: 'jednotka u číselných polí, např. l, mg, min' },
    min: { type: 'number' },
    max: { type: 'number' },
    higherIsBetter: { type: 'boolean', description: 'u typu scale povinné: znamená vyšší hodnota lepší stav?' },
    options: { type: 'array', items: optionSchema, description: 'jen u single_select a multi_select' },
    visibility: visibilitySchema,
  },
  required: ['id', 'type', 'label', 'required', 'order'],
};

const sectionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string', description: 'česky' },
    description: { type: 'string' },
    kind: {
      type: 'string',
      enum: ['daily', 'timeline'],
      description: `daily = jednou za den; timeline = události s časem (povolené typy: ${EVENT_FIELD_TYPES.join(', ')})`,
    },
    order: { type: 'integer' },
    fields: { type: 'array', items: fieldSchema },
  },
  required: ['id', 'title', 'kind', 'order', 'fields'],
};

export const TRACKER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'integer', enum: [TRACKER_SCHEMA_VERSION] },
    title: { type: 'string', description: 'název záznamníku, česky' },
    description: { type: 'string', description: 'k čemu záznamník je, česky, 1–2 věty' },
    disclaimer: { type: 'string', description: 'neutrální upozornění, že nejde o lékařskou zprávu ani diagnózu' },
    estimatedDailyMinutes: { type: 'integer', description: 'realistický odhad minut denně' },
    sections: { type: 'array', items: sectionSchema },
  },
  required: ['schemaVersion', 'title', 'description', 'disclaimer', 'sections'],
} as const;
