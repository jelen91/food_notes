// Onboardingový dotazník.
//
// Ptáme se jen na to, z čeho jde postavit užitečný deník. Žádné jméno, adresa, zaměstnavatel
// ani rodné číslo – tyhle údaje k sestavení trackeru nejsou potřeba, tak je nesbíráme.
// Struktura je verzovaná, aby staré odpovědi zůstaly srozumitelné i po změně otázek.
//
// Verze 3: upřesnění načasování a srovnání lepších a horších dní pomáhá sestavit deník
// s údaji, které lze po několika týdnech porovnat. ID a původní volby zůstávají platné.

export const QUESTIONNAIRE_VERSION = 3;

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
      description: 'Popiš svou situaci vlastními slovy. AI z ní vybere hlavní ukazatel a okolnosti, které bude užitečné porovnávat.',
      questions: [
        {
          id: 'hlavni_otazka',
          label: 'Hlavní otázka, na kterou hledáš odpověď',
          help: 'Zaměř se na jednu hlavní věc, ve které chceš mít jasněji. Například: „Co se opakuje ve dnech, kdy mě odpoledne přepadne únava?“',
          type: 'longtext',
          required: true,
          maxLength: 600,
        },
        {
          id: 'co_prozivas',
          label: 'Co teď prožíváš',
          help: 'Kdy během dne to přichází, jak často, jak dlouho to trvá a jak tě to omezuje? Stačí pár vět. Piš jen údaje potřebné k tomuto tématu.',
          type: 'longtext',
          maxLength: 800,
        },
        {
          id: 'kdy_se_meni',
          label: 'Kdy je to lepší a kdy horší',
          help: 'Dobrovolné. Uveď, čeho sis všiml/a, třeba rozdílu mezi pracovním dnem a víkendem. Pokud máš podezření na souvislost, popiš ji jako domněnku; nemusíš mít vysvětlení.',
          type: 'longtext',
          maxLength: 600,
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
      description: 'Tento kontext pomůže AI vybrat smysluplné údaje pro tvou hlavní otázku. Nemusíš sledovat všechno.',
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
      description: 'Všechno v této části je dobrovolné. Přidej pouze to, co souvisí s tvou otázkou. Jména, kontakty ani celé lékařské zprávy nepotřebujeme.',
      questions: [
        { id: 'strava', label: 'Něco specifického ve stravování', help: 'Pokud to s tématem souvisí, uveď běžný režim nebo nedávnou změnu.', type: 'text', maxLength: 300, placeholder: 'např. nepravidelné jídlo, pozdní večeře' },
        { id: 'leky', label: 'Léky, které bereš', help: 'Jen pokud jsou pro sledované téma relevantní. Tato odpověď neslouží k doporučení změny léčby.', type: 'text', maxLength: 300 },
        { id: 'doplnky', label: 'Doplňky stravy', help: 'Dobrovolně, pokud je považuješ za relevantní pro svou otázku.', type: 'text', maxLength: 300 },
        {
          id: 'diagnozy',
          label: 'Diagnózy, které považuješ za relevantní',
          help: 'Dobrovolné. Uveď jen to, co má podle tebe souvislost s tím, co chceš sledovat.',
          type: 'text',
          maxLength: 300,
        },
        { id: 'uz_sleduji', label: 'Co už si zapisuješ nebo měříš', help: 'Například délku spánku nebo čas potíží. AI může návrh přizpůsobit tomu, co už snadno zjistíš; údaje z přístrojů zadáváš ručně.', type: 'text', maxLength: 300 },
      ],
    },
    {
      id: 'rozsah',
      title: 'Kolik toho chceš zapisovat',
      description: 'Pravidelné údaje o potížích i běžném dni připraví podklad pro tvůj AI rozbor. Zvol rozsah, který zvládneš alespoň 21 dní.',
      questions: [
        {
          id: 'cas_denne',
          label: 'Kolik času denně chceš zápisu věnovat',
          help: 'AI podle toho omezí počet polí. I krátký pravidelný zápis má hodnotu; události a poznámky můžeš podle potřeby doplnit.',
          type: 'single',
          required: true,
          options: ['do 1 minuty', '2–3 minuty', 'asi 5 minut', 'klidně víc'],
        },
        {
          id: 'detail',
          label: 'Úroveň podrobnosti',
          help: 'Podrobnější kontext může pomoci při hledání souvislostí. Návrh se vždy přizpůsobí i času, který jsi zvolil/a.',
          type: 'single',
          required: true,
          options: ['jen to podstatné', 'střední', 'podrobné'],
        },
        { id: 'doplneni', label: 'Cokoli dalšího, co bychom měli vědět', help: 'Například směnný provoz, nepravidelný režim nebo údaj, který nedokážeš snadno zjišťovat. Vyplň jen relevantní informace.', type: 'longtext', maxLength: 800 },
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
