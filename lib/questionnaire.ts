// Onboardingový dotazník.
//
// Ptáme se jen na to, z čeho jde postavit užitečný deník. Žádné jméno, adresa, zaměstnavatel
// ani rodné číslo – tyhle údaje k sestavení trackeru nejsou potřeba, tak je nesbíráme.
// Struktura je verzovaná, aby staré odpovědi zůstaly srozumitelné i po změně otázek.
//
// Verze 2: zmizel výběr „oblastí, které chceš zapisovat“. Co má smysl sledovat, plyne
// z popsaného problému – vybrat si to má nástroj, ne člověk, který sem přišel s potížemi.

export const QUESTIONNAIRE_VERSION = 2;

export type QuestionType = 'text' | 'longtext' | 'single' | 'multi';

export interface QuestionDef {
  id: string;
  label: string;
  help?: string;
  type: QuestionType;
  options?: string[];
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}

export interface QuestionnaireSection {
  id: string;
  title: string;
  description?: string;
  questions: QuestionDef[];
}

export const QUESTIONNAIRE: { version: number; sections: QuestionnaireSection[] } = {
  version: QUESTIONNAIRE_VERSION,
  sections: [
    {
      id: 'cil',
      title: 'Co chceš zjistit',
      description: 'Podle toho se řídí, co bude deník sledovat.',
      questions: [
        {
          id: 'hlavni_otazka',
          label: 'Hlavní otázka, na kterou hledáš odpověď',
          help: 'Například: „Proč bývám odpoledne úplně bez energie?“',
          type: 'longtext',
          required: true,
          maxLength: 600,
        },
        {
          id: 'co_prozivas',
          label: 'Co teď prožíváš',
          help: 'Stručně, vlastními slovy.',
          type: 'longtext',
          maxLength: 800,
        },
        {
          id: 'jak_dlouho',
          label: 'Jak dlouho to trvá',
          type: 'single',
          options: ['dny', 'týdny', 'měsíce', 'roky', 'nevím'],
        },
      ],
    },
    {
      id: 'oblasti',
      title: 'Jak na tom teď jsi',
      description: 'Pár klepnutí. Co se bude v deníku sledovat, z toho odvodíme sami.',
      questions: [
        { id: 'spanek', label: 'Spánek', type: 'single', options: ['dobrý', 'kolísá', 'spíš špatný', 'nevím'] },
        { id: 'traveni', label: 'Trávení', type: 'single', options: ['v pohodě', 'občas potíže', 'často potíže', 'nevím'] },
        { id: 'pohyb', label: 'Pohyb', type: 'single', options: ['skoro žádný', 'občas', 'pravidelně', 'intenzivně'] },
        { id: 'energie', label: 'Energie během dne', type: 'single', options: ['stabilní', 'kolísá', 'většinou nízká', 'nevím'] },
        { id: 'stres', label: 'Míra stresu', type: 'single', options: ['nízká', 'střední', 'vysoká', 'nevím'] },
      ],
    },
    {
      id: 'kontext',
      title: 'Kontext',
      description: 'Všechno v této části je dobrovolné. Vyplň jen to, co sám považuješ za důležité.',
      questions: [
        { id: 'strava', label: 'Něco specifického ve stravování', type: 'text', maxLength: 300, placeholder: 'např. bez lepku, nepravidelné jídlo' },
        { id: 'leky', label: 'Léky, které bereš', type: 'text', maxLength: 300 },
        { id: 'doplnky', label: 'Doplňky stravy', type: 'text', maxLength: 300 },
        {
          id: 'diagnozy',
          label: 'Diagnózy, které považuješ za relevantní',
          help: 'Dobrovolné. Uveď jen to, co má podle tebe souvislost s tím, co chceš sledovat.',
          type: 'text',
          maxLength: 300,
        },
        { id: 'uz_sleduji', label: 'Co už si zapisuješ nebo měříš', type: 'text', maxLength: 300 },
      ],
    },
    {
      id: 'rozsah',
      title: 'Kolik toho chceš zapisovat',
      questions: [
        {
          id: 'cas_denne',
          label: 'Kolik času denně chceš zápisu věnovat',
          type: 'single',
          required: true,
          options: ['do 1 minuty', '2–3 minuty', 'asi 5 minut', 'klidně víc'],
        },
        {
          id: 'detail',
          label: 'Úroveň podrobnosti',
          type: 'single',
          required: true,
          options: ['jen to podstatné', 'střední', 'podrobné'],
        },
        { id: 'doplneni', label: 'Cokoli dalšího, co bychom měli vědět', type: 'longtext', maxLength: 800 },
      ],
    },
  ],
};

export const ALL_QUESTIONS: QuestionDef[] = QUESTIONNAIRE.sections.flatMap((s) => s.questions);

export type Answers = Record<string, string | string[]>;

export interface AnswerValidation {
  ok: boolean;
  answers: Answers;
  problems: string[];
}

const DEFAULT_MAX = 300;

/** Přijme jen známé otázky a povolené volby; ostatní klíče zahodí, chyby vypíše. */
export function validateAnswers(raw: unknown, opts: { requireComplete?: boolean } = {}): AnswerValidation {
  const problems: string[] = [];
  const answers: Answers = {};
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  for (const q of ALL_QUESTIONS) {
    const value = source[q.id];

    if (q.type === 'multi') {
      const list = Array.isArray(value) ? value.map((v) => String(v)) : [];
      const allowed = list.filter((v) => q.options?.includes(v));
      if (list.length !== allowed.length) problems.push(`${q.label}: neplatná volba`);
      if (allowed.length) answers[q.id] = Array.from(new Set(allowed)).slice(0, 30);
      else if (q.required && opts.requireComplete) problems.push(`${q.label}: vyber aspoň jednu možnost`);
      continue;
    }

    const text = value === undefined || value === null ? '' : String(value).trim();
    if (!text) {
      if (q.required && opts.requireComplete) problems.push(`${q.label}: je potřeba vyplnit`);
      continue;
    }
    if (q.type === 'single') {
      if (!q.options?.includes(text)) {
        problems.push(`${q.label}: neplatná volba`);
        continue;
      }
      answers[q.id] = text;
      continue;
    }
    const max = q.maxLength ?? DEFAULT_MAX;
    if (text.length > max) {
      problems.push(`${q.label}: maximálně ${max} znaků`);
      continue;
    }
    answers[q.id] = text;
  }

  return { ok: problems.length === 0, answers, problems };
}

/**
 * Povinné otázky, které zůstaly bez odpovědi. Používá se v prohlížeči po každé sekci,
 * aby se člověk o chybějící odpovědi dozvěděl hned, ne až při odeslání.
 */
export function missingRequired(answers: Answers, questions: QuestionDef[] = ALL_QUESTIONS): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) {
    if (!q.required) continue;
    const value = answers[q.id];
    const filled = Array.isArray(value) ? value.length > 0 : Boolean(value && String(value).trim());
    if (filled) continue;
    out[q.id] = q.type === 'single' || q.type === 'multi' ? 'Vyber prosím jednu možnost.' : 'Tuhle odpověď potřebujeme.';
  }
  return out;
}

export interface MinimizedInput {
  questionnaireVersion: number;
  answers: Array<{ question: string; answer: string }>;
}

/**
 * Podklad pro model. Obsahuje jen otázky a odpovědi – žádné jméno, e-mail, ID účtu,
 * Stripe identifikátory, IP adresu ani časová razítka.
 */
export function minimizeForModel(answers: Answers): MinimizedInput {
  const out: MinimizedInput = { questionnaireVersion: QUESTIONNAIRE_VERSION, answers: [] };
  for (const q of ALL_QUESTIONS) {
    const value = answers[q.id];
    if (value === undefined || value === null) continue;
    const text = Array.isArray(value) ? value.join(', ') : String(value);
    if (!text.trim()) continue;
    out.answers.push({ question: q.label, answer: text.trim() });
  }
  return out;
}
