// Volání modelu a nezávislá kontrola výsledku.
//
// Klíč k Anthropicu žije jen v serverovém prostředí. Do modelu jde pouze minimalizovaný
// dotazník (žádné jméno, e-mail, ID účtu ani Stripe identifikátory) a ven jde buď platná
// definice, nebo bezpečná kategorie chyby – nikdy částečný výsledek a nikdy syrová odpověď v logu.

import { MinimizedInput } from '../questionnaire';
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { TRACKER_JSON_SCHEMA } from './jsonSchema';
import { TrackerDefinition, validateTrackerDefinition } from './schema';

export const DEFAULT_MODEL = 'claude-opus-5';
const MAX_TOKENS = 16000;
// Kompilace gramatiky pro structured outputs proběhne u nového schématu jednou (pak se
// 24 h cachuje) a sama o sobě zabere desítky sekund – timeout musí počítat i s ní.
const TIMEOUT_MS = 240_000;
const MAX_RETRIES = 2;

/** Kategorie selhání. Uživateli se ukazuje hláška, do DB jde jen tenhle kód. */
export type FailureCategory =
  | 'not_configured'
  | 'timeout'
  | 'rate_limited'
  | 'upstream_error'
  | 'schema_too_complex'
  | 'refused'
  | 'truncated'
  | 'invalid_json'
  | 'invalid_schema';

export interface GenerationMeta {
  model: string;
  promptVersion: number;
  schemaVersion: number;
  durationMs: number;
}

/** Jeden tvar s volitelnými poli – projekt běží s `strict: false`, kde se union nezužuje. */
export interface GenerationResult {
  ok: boolean;
  definition?: TrackerDefinition;
  meta?: GenerationMeta;
  category?: FailureCategory;
  retryable?: boolean;
  problems?: string[];
}

/** Odpověď modelu zredukovaná na to, co potřebujeme – umožňuje testovat bez sítě. */
export interface ModelReply {
  text: string;
  stopReason?: string | null;
  model?: string;
}

export interface ModelCaller {
  (args: { system: string; user: string; schema: unknown }): Promise<ModelReply>;
}

/** Skutečné volání přes oficiální SDK. */
export const anthropicCaller: ModelCaller = async ({ system, user, schema }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw Object.assign(new Error('Chybí ANTHROPIC_API_KEY'), { category: 'not_configured' });

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey,
    // Timeout je v milisekundách; SDK samo opakuje 408/409/429/5xx a výpadky spojení.
    timeout: TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema } as any,
    },
  } as any);

  // U odmítnutí je `content` prázdný nebo částečný – čte se až po kontrole stop_reason.
  const stopReason = (response as any).stop_reason ?? null;
  const text = ((response as any).content ?? [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('');

  return { text, stopReason, model: (response as any).model };
};

function classifyError(error: any): { category: FailureCategory; retryable: boolean } {
  const status = error?.status ?? error?.statusCode;
  if (error?.category === 'not_configured') return { category: 'not_configured', retryable: false };
  // Chyba v našem schématu, ne v uživatelských datech – opakování nepomůže, musí se zjednodušit.
  const message = String(error?.error?.error?.message ?? error?.message ?? '');
  if (/grammar|schema compilation/i.test(message)) {
    return { category: 'schema_too_complex', retryable: false };
  }
  if (error?.name === 'APIConnectionTimeoutError' || /timeout/i.test(String(error?.message))) {
    return { category: 'timeout', retryable: true };
  }
  if (status === 429) return { category: 'rate_limited', retryable: true };
  if (typeof status === 'number' && status >= 500) return { category: 'upstream_error', retryable: true };
  return { category: 'upstream_error', retryable: status === undefined };
}

export async function generateTracker(
  input: MinimizedInput,
  caller: ModelCaller = anthropicCaller
): Promise<GenerationResult> {
  const startedAt = Date.now();
  let reply: ModelReply;

  try {
    reply = await caller({ system: SYSTEM_PROMPT, user: buildUserPrompt(input), schema: TRACKER_JSON_SCHEMA });
  } catch (error: any) {
    const classified = classifyError(error);
    // Do logu jen kategorie a stavový kód – nikdy prompt, odpověď ani klíč.
    console.error(`generování trackeru selhalo: ${classified.category} (status ${error?.status ?? '-'})`);
    return { ok: false, ...classified };
  }

  const duration = Date.now() - startedAt;

  if (reply.stopReason === 'refusal') {
    console.info('generování trackeru: model odmítl požadavek');
    return { ok: false, category: 'refused', retryable: false };
  }
  if (reply.stopReason === 'max_tokens') {
    console.info('generování trackeru: odpověď se nevešla do limitu');
    return { ok: false, category: 'truncated', retryable: true };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.text);
  } catch {
    console.info('generování trackeru: odpověď nebyla platný JSON');
    return { ok: false, category: 'invalid_json', retryable: true };
  }

  const validation = validateTrackerDefinition(parsed);
  if (!validation.ok || !validation.definition) {
    // Popisy problémů jsou naše vlastní hlášky o struktuře, ne obsah odpovědi.
    console.info(`generování trackeru: definice neprošla validací (${validation.problems?.length ?? 0} problémů)`);
    return { ok: false, category: 'invalid_schema', retryable: true, problems: validation.problems };
  }

  return {
    ok: true,
    definition: validation.definition,
    meta: {
      model: reply.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      promptVersion: PROMPT_VERSION,
      schemaVersion: validation.definition.schemaVersion,
      durationMs: duration,
    },
  };
}

/** Hlášky pro uživatele. Nikdy neukazujeme interní chyby ani odpovědi poskytovatele. */
export const FAILURE_MESSAGE: Record<FailureCategory, string> = {
  not_configured: 'Sestavení deníku teď není dostupné. Zkus to prosím později.',
  timeout: 'Sestavení trvalo příliš dlouho. Zkus to prosím znovu.',
  rate_limited: 'Momentálně je velký provoz. Zkus to prosím za chvíli.',
  upstream_error: 'Sestavení se nepodařilo dokončit. Zkus to prosím znovu.',
  schema_too_complex: 'Sestavení deníku je dočasně nedostupné. Pracujeme na tom.',
  refused: 'Z odpovědí se nepodařilo sestavit deník. Zkus je prosím upravit a odeslat znovu.',
  truncated: 'Návrh deníku byl příliš rozsáhlý. Zkus to prosím znovu.',
  invalid_json: 'Sestavení se nepodařilo dokončit. Zkus to prosím znovu.',
  invalid_schema: 'Návrh deníku neprošel kontrolou. Zkus to prosím znovu.',
};
