export const ANALYSIS_CONSENT_VERSION = '2026-09-12.analysis.v1';
export const ANALYSIS_CONSENT_TEXT =
  'Výslovně souhlasím, aby vybrané záznamy mého deníku a popisy jeho polí, včetně údajů o zdraví, zpracoval Claude (Anthropic) pro jednorázové AI vyhodnocení. Vyhodnocení a tento souhlas se uloží zašifrovaně v mém účtu. Jde o podněty k dalšímu pozorování a konzultaci, nikoli o diagnózu nebo léčebný plán.';

export interface AnalysisConsent { version: string; text: string; acceptedAt: string }

export function hasAnalysisConsent(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const input = body as Record<string, unknown>;
  return input.consent === true && input.consentVersion === ANALYSIS_CONSENT_VERSION;
}

export function createAnalysisConsent(now: Date): AnalysisConsent {
  return { version: ANALYSIS_CONSENT_VERSION, text: ANALYSIS_CONSENT_TEXT, acceptedAt: now.toISOString() };
}
