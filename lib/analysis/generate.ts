import { DEFAULT_MODEL } from '../tracker/generate';
import type { AnalysisInput } from './input';
import type { AnalysisReport } from './types';
import { ANALYSIS_SYSTEM_PROMPT, ANALYSIS_PROMPT_VERSION, analysisUserPrompt } from './prompt';
import { ANALYSIS_JSON_SCHEMA, validateAnalysisReport } from './schema';

export const ANALYSIS_TIMEOUT_MS = 190_000;
export const ANALYSIS_MAX_RETRIES = 0;
export type AnalysisFailure = 'not_configured' | 'timeout' | 'rate_limited' | 'upstream_error' | 'invalid_output' | 'input_too_large' | 'interrupted';
export const ANALYSIS_FAILURE_MESSAGES: Record<AnalysisFailure, string> = {
  not_configured: 'AI vyhodnocení teď není dostupné. Tvůj nárok zůstává zachovaný. Zkus to prosím později.',
  timeout: 'Vyhodnocení trvalo příliš dlouho. Nárok zůstává zachovaný a můžeš to zkusit znovu.',
  rate_limited: 'Vyhodnocení je právě vytížené. Zkus to za chvíli. Tvůj nárok zůstává zachovaný.',
  upstream_error: 'Vyhodnocení se nepodařilo dokončit. Tvůj nárok zůstává zachovaný. Zkus to znovu.',
  invalid_output: 'Výsledek neprošel kontrolou a neuložil se. Tvůj nárok zůstává zachovaný. Zkus to znovu.',
  input_too_large: 'Nejnovějších 21 vyplněných dní je pro jedno vyhodnocení příliš rozsáhlých. Nárok zůstává zachovaný. Kontaktuj podporu; záznamy nemaž.',
  interrupted: 'Předchozí vyhodnocení se přerušilo. Tvůj nárok zůstává zachovaný. Můžeš ho spustit znovu.',
};
export interface AnalysisMeta { model: string; promptVersion: number; schemaVersion: number; durationMs: number }
export interface AnalysisModelCaller { (args: { system: string; user: string; schema: unknown }): Promise<{ text: string; stopReason?: string; model?: string }> }
export interface AnalysisGeneration { ok: boolean; report?: AnalysisReport; meta?: AnalysisMeta; failure?: AnalysisFailure }

export function isAnalysisConfigured(): boolean { return Boolean(process.env.ANTHROPIC_API_KEY); }

export const analysisModelCaller: AnalysisModelCaller = async ({ system, user, schema }) => {
  if (!isAnalysisConfigured()) throw Object.assign(new Error('not_configured'), { category: 'not_configured' });
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: ANALYSIS_TIMEOUT_MS, maxRetries: ANALYSIS_MAX_RETRIES });
  const reply = await client.messages.create({
    model: process.env.ANTHROPIC_ANALYSIS_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 8000, system, messages: [{ role: 'user', content: user }],
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
  } as any);
  return {
    text: reply.content.filter((block) => block.type === 'text').map((block: any) => block.text).join(''),
    stopReason: reply.stop_reason, model: reply.model,
  };
};

export async function generateAnalysis(input: AnalysisInput, caller: AnalysisModelCaller = analysisModelCaller): Promise<AnalysisGeneration> {
  const start = Date.now();
  try {
    const reply = await caller({ system: ANALYSIS_SYSTEM_PROMPT, user: analysisUserPrompt(input), schema: ANALYSIS_JSON_SCHEMA });
    if (reply.stopReason !== 'end_turn') return { ok: false, failure: 'invalid_output' };
    if (Buffer.byteLength(reply.text, 'utf8') > 70_000) return { ok: false, failure: 'invalid_output' };
    let raw: unknown;
    try { raw = JSON.parse(reply.text); } catch { return { ok: false, failure: 'invalid_output' }; }
    const report = validateAnalysisReport(raw, input.days.map((day) => day.date));
    if (!report) return { ok: false, failure: 'invalid_output' };
    return { ok: true, report, meta: {
      model: reply.model || process.env.ANTHROPIC_ANALYSIS_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      promptVersion: ANALYSIS_PROMPT_VERSION, schemaVersion: 1, durationMs: Date.now() - start,
    } };
  } catch (error: any) {
    // No raw errors, prompts or model responses in logs or return values.
    if (error?.category === 'not_configured') return { ok: false, failure: 'not_configured' };
    if (error?.name === 'APIConnectionTimeoutError' || /timeout|timed out/i.test(String(error?.message))) return { ok: false, failure: 'timeout' };
    if (error?.status === 429) return { ok: false, failure: 'rate_limited' };
    return { ok: false, failure: 'upstream_error' };
  }
}
