// Rychlé vložení výsledků: uživatel nakopíruje řádky z laboratorní zprávy a my z nich
// zkusíme vytáhnout název / hodnotu / jednotku / referenční rozmezí. Vše jde ručně opravit.

import { LabValue } from './schema';

const RANGE_AT_END = /[\(\[]?\s*(-?\d+(?:[.,]\d+)?)\s*[-–—]\s*(-?\d+(?:[.,]\d+)?)\s*[\)\]]?\s*$/;
const NAME_VALUE = /^(.*?)[\s:]+([<>]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(.*))?$/;

function toNum(s: string): number | undefined {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export function parseLabLines(text: string): LabValue[] {
  const out: LabValue[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.replace(/^[\s\-*•]+/, '').trim();
    if (!line) continue;

    let refLow: number | undefined;
    let refHigh: number | undefined;
    const range = line.match(RANGE_AT_END);
    if (range) {
      refLow = toNum(range[1]);
      refHigh = toNum(range[2]);
      line = line.slice(0, range.index).trim().replace(/[\(\[]\s*$/, '').replace(/(ref\.?|norma)\s*:?\s*$/i, '').trim();
    }

    const m = line.match(NAME_VALUE);
    if (!m) continue;
    const name = m[1].replace(/[:\-–]\s*$/, '').trim();
    const rawValue = m[2].replace(/\s+/g, '');
    if (!name) continue;

    // "<0.5" nechme jako text, jinak číslo.
    const numeric = /^[<>]/.test(rawValue) ? undefined : toNum(rawValue);
    const value: number | string = numeric !== undefined ? numeric : rawValue;
    const unit = (m[3] ?? '').trim().split(/\s+/)[0]?.replace(/[,;]$/, '') ?? '';

    const item: LabValue = { name, value };
    if (unit && !/^(ref|norma)/i.test(unit)) item.unit = unit;
    if (refLow !== undefined) item.refLow = refLow;
    if (refHigh !== undefined) item.refHigh = refHigh;
    out.push(item);
  }
  return out;
}
