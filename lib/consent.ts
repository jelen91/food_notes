// This exact versioned statement is shown before answers leave the browser.
// Change the version whenever the wording or the described processing changes.
export const QUESTIONNAIRE_CONSENT_VERSION = '2026-09-12.v1';
export const QUESTIONNAIRE_CONSENT_TEXT =
  'Výslovně souhlasím se zpracováním svých odpovědí, včetně údajů o zdraví, pro uložení dotazníku a sestavení osobního deníku. Odpovědi se ukládají zašifrovaně a po zaplacení je pro sestavení polí deníku zpracuje Claude (Anthropic).';

export interface QuestionnaireConsent {
  version: string;
  text: string;
  acceptedAt: string;
}

export function hasCurrentQuestionnaireConsent(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const input = body as Record<string, unknown>;
  return input.consent === true && input.consentVersion === QUESTIONNAIRE_CONSENT_VERSION;
}
