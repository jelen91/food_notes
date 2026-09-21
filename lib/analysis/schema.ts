import { z } from 'zod';
import type { AnalysisReport } from './types';

function text(max: number) {
  return z.string().min(1).max(max).refine((value) => Boolean(value.trim()) &&
    !/<[^>]*>|&#|&lt;|&gt;|https?:\/\/|javascript:|data:|\[[^\]]*\]\(|```/i.test(value) &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(value));
}
const ReportSchema = z.object({
  schemaVersion: z.literal(1), summary: text(1500),
  dataQuality: z.array(text(700)).min(1).max(6),
  patterns: z.array(z.object({
    title: text(120), observation: text(1000),
    evidenceDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(12),
    strength: z.enum(['low', 'medium']), alternativeExplanations: z.array(text(500)).min(1).max(4),
  }).strict()).max(6),
  hypotheses: z.array(z.object({ possibility: text(300), basis: text(700), uncertainty: text(700) }).strict()).max(4),
  nextSteps: z.array(z.object({
    kind: z.enum(['observation', 'prepare_consultation']), action: text(500), reason: text(500),
  }).strict()).min(1).max(6),
  clinicianQuestions: z.array(text(400)).min(1).max(6), limitations: z.array(text(700)).min(1).max(6),
}).strict();

export function validateAnalysisReport(raw: unknown, inputDates: string[]): AnalysisReport | null {
  const parsed = ReportSchema.safeParse(raw);
  if (!parsed.success) return null;
  const report = parsed.data as AnalysisReport;
  const allowed = new Set(inputDates);
  for (const pattern of report.patterns) {
    if (pattern.evidenceDates.some((date) => !allowed.has(date))) return null;
    if (new Set(pattern.evidenceDates).size !== pattern.evidenceDates.length) return null;
    if (pattern.strength === 'medium' && pattern.evidenceDates.length < 2) return null;
  }
  // Also reject invented ISO dates hidden in prose, not only evidenceDates.
  const mentioned = JSON.stringify(report).match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  if (mentioned.some((date) => !allowed.has(date))) return null;
  // Defence in depth for explicit treatment directions. This is not a clinical
  // classifier; the system prompt defines the narrower observation-only task.
  const actions = report.nextSteps.map((step) => `${step.action} ${step.reason}`).join(' ');
  if (/\b(vysaď(?:te)?|nasadit|nasaď(?:te)?|zdvojnásob(?:te)?|sniž(?:te)? dávk|zvyš(?:te)? dávk|užívej(?:te)?|užívat)\b/i.test(actions)) return null;
  if (/\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|μg|µg)\b/i.test(actions)) return null;
  return report;
}

const str = { type: 'string' };
const arr = (items: unknown) => ({ type: 'array', items });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

// Simple grammar for provider structured output. Limits and semantic checks are
// independently enforced above before anything can be saved or shown.
export const ANALYSIS_JSON_SCHEMA = obj({
  schemaVersion: { type: 'integer', enum: [1] }, summary: str, dataQuality: arr(str),
  patterns: arr(obj({ title: str, observation: str, evidenceDates: arr(str), strength: { type: 'string', enum: ['low', 'medium'] }, alternativeExplanations: arr(str) })),
  hypotheses: arr(obj({ possibility: str, basis: str, uncertainty: str })),
  nextSteps: arr(obj({ kind: { type: 'string', enum: ['observation', 'prepare_consultation'] }, action: str, reason: str })),
  clinicianQuestions: arr(str), limitations: arr(str),
});
