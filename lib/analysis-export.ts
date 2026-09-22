import type { AnalysisResponse } from './analysis/types';
import { BRAND } from './brand';

/** Plain text keeps AI output inert when saving a copy for a consultation. */
export function analysisAsText(data: AnalysisResponse): string {
  if (!data.report || data.status !== 'completed') return '';
  const { report, coverage } = data;
  const lines = [
    BRAND.name,
    'AI přehled z vlastních pozorování',
    '',
    'Výstup AI může obsahovat chyby. Není diagnózou ani doporučením léčby.',
    data.completedAt ? `Vytvořeno: ${data.completedAt}` : '',
    coverage
      ? `Období: ${coverage.from} – ${coverage.to}. Analyzovaných dní: ${coverage.analyzedDays}. Vynechaných dní: ${coverage.omittedDays}.`
      : '',
    '',
    'SHRNUTÍ',
    report.summary,
    '',
    'KVALITA DAT',
    ...report.dataQuality.map((item) => `• ${item}`),
    '',
    'SOUVISLOSTI V ZÁZNAMECH',
  ];
  for (const p of report.patterns)
    lines.push(
      '',
      p.title,
      p.observation,
      `Opora v záznamech: ${p.strength === 'medium' ? 'střední' : 'slabá'}. Nejde o důkaz příčiny.`,
      `Dny: ${p.evidenceDates.join(', ')}`,
      ...p.alternativeExplanations.map((item) => `Jiné vysvětlení: ${item}`)
    );
  lines.push('', 'MOŽNÁ VYSVĚTLENÍ K OVĚŘENÍ');
  for (const h of report.hypotheses)
    lines.push('', h.possibility, `O co se opírá: ${h.basis}`, `Co zůstává nejisté: ${h.uncertainty}`);
  lines.push('', 'DALŠÍ KROKY');
  for (const s of report.nextSteps) lines.push(`• ${s.action}`, `  ${s.reason}`);
  lines.push(
    '',
    'OTÁZKY PRO KONZULTACI',
    ...report.clinicianQuestions.map((q) => `• ${q}`),
    '',
    'LIMITY VYHODNOCENÍ',
    ...report.limitations.map((l) => `• ${l}`)
  );
  if (coverage?.omittedDates.length) lines.push(`Vynechané dny: ${coverage.omittedDates.join(', ')}`);
  if (coverage?.missingDefinitionDays.length)
    lines.push(`Chybějící podoba deníku pro dny: ${coverage.missingDefinitionDays.join(', ')}`);
  return lines.join('\n');
}
