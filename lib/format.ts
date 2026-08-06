// Čitelný popis záznamů. Sdílené mezi UI a .md exportem, ať se popisky neliší.

import { CATEGORY_BY_KEY, ENTRY_SYMPTOMS, EventEntry, SCALE_MAX, WeaknessEntry } from './schema';

/** Strukturovaná pole události jako text: "délka: 60 min, intenzita: 7/10". */
export function eventFieldsText(e: EventEntry): string {
  const def = CATEGORY_BY_KEY[e.category];
  const parts: string[] = [];
  for (const f of def?.fields ?? []) {
    const v = e.fields?.[f.key];
    if (v === undefined || v === null || v === '') continue;
    const unit = f.unit ? (f.unit.startsWith('/') ? f.unit : ` ${f.unit}`) : '';
    parts.push(`${f.label.toLowerCase()}: ${v}${unit}`);
  }
  for (const s of ENTRY_SYMPTOMS) {
    const v = e[s.key];
    if (v) parts.push(`${s.tag.toLowerCase()}: ${v}/5`);
  }
  return parts.join(', ');
}

/** "ovesná kaše (plyny: 3/5)" */
export function eventDetail(e: EventEntry): string {
  const fields = eventFieldsText(e);
  const note = e.note || '';
  if (!fields) return note;
  return note ? `${note} (${fields})` : `(${fields})`;
}

/** Souhrn epizody slabosti na jeden řádek. */
export function weaknessLine(w: WeaknessEntry): string {
  const parts: string[] = [];
  if (w.severity !== undefined) parts.push(`intenzita ${w.severity}/${SCALE_MAX}`);
  if (w.durationMin !== undefined) parts.push(`trvání ${w.durationMin} min`);
  if (w.bodyParts?.length) parts.push(`kde: ${w.bodyParts.join(', ')}`);
  if (w.triggers?.length) parts.push(`spouštěč: ${w.triggers.join(', ')}`);
  if (w.symptoms?.length) parts.push(`doprovodné: ${w.symptoms.join(', ')}`);
  if (w.lastMealHoursAgo !== undefined) parts.push(`poslední jídlo před ${w.lastMealHoursAgo} h`);
  if (w.relief?.length) parts.push(`pomohlo: ${w.relief.join(', ')}`);
  return parts.join(' · ');
}
