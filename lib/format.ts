// Čitelný popis záznamů. Sdílené mezi UI a .md exportem, ať se popisky neliší.

import { Entry, entryDef, symptomsFor } from './schema';
import { FieldDef, TenantConfig } from './tenant/types';

function fieldValueText(f: FieldDef, value: number | string | string[]): string {
  if (Array.isArray(value)) return value.join(', ');
  if (f.type === 'scale') return `${value}/${f.max ?? 10}`;
  const unit = f.unit ? (f.unit.startsWith('/') ? f.unit : ` ${f.unit}`) : '';
  return `${value}${unit}`;
}

/** Strukturovaná pole záznamu jako text: "délka: 60 min, intenzita: 7/10". */
export function entryFieldsText(config: TenantConfig, e: Entry): string {
  const def = entryDef(config, e);
  const parts: string[] = [];
  for (const f of def?.fields ?? []) {
    const v = e.fields?.[f.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    parts.push(`${f.label.toLowerCase()}: ${fieldValueText(f, v)}`);
  }
  if (e.kind === 'event') {
    for (const s of symptomsFor(config, e.key)) {
      const v = e.symptoms?.[s.key];
      if (v) parts.push(`${s.label.toLowerCase()}: ${v}/${s.max ?? 5}`);
    }
  }
  return parts.join(', ');
}

/** "ovesná kaše (plyny: 3/5)" */
export function entryDetail(config: TenantConfig, e: Entry): string {
  const fields = entryFieldsText(config, e);
  const note = e.note || '';
  if (!fields) return note;
  return note ? `${note} (${fields})` : `(${fields})`;
}

export function entryLabel(config: TenantConfig, e: Entry): string {
  const def = entryDef(config, e);
  if (!def) return e.key;
  return `${def.emoji ? `${def.emoji} ` : ''}${def.label}`;
}
