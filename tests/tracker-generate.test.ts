import { describe, expect, it, vi } from 'vitest';
import { FAILURE_MESSAGE, ModelCaller, generateTracker } from '../lib/tracker/generate';
import { minimizeForModel, validateAnswers, ALL_QUESTIONS, missingRequired, QUESTIONNAIRE } from '../lib/questionnaire';
import { SYSTEM_PROMPT, buildUserPrompt } from '../lib/tracker/prompt';

const validDefinition = {
  schemaVersion: 1,
  title: 'Deník energie',
  description: 'Sledování energie a spánku.',
  disclaimer: 'Jde o vlastní záznamy, ne o lékařskou zprávu.',
  estimatedDailyMinutes: 2,
  sections: [
    {
      id: 'den',
      title: 'Den',
      kind: 'daily',
      order: 0,
      fields: [{ id: 'energie', type: 'scale', label: 'Energie', required: false, order: 0, min: 1, max: 10, higherIsBetter: true }],
    },
  ],
};

const replyWith = (text: string, stopReason: string | null = 'end_turn'): ModelCaller =>
  async () => ({ text, stopReason, model: 'claude-opus-5' });

const input = minimizeForModel({ hlavni_otazka: 'Proč jsem unavený?', co_prozivas: 'Odpoledne mě přepadne útlum.' });

describe('generování trackeru', () => {
  it('platná odpověď vytvoří definici', async () => {
    const result = await generateTracker(input, replyWith(JSON.stringify(validDefinition)));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.definition.title).toBe('Deník energie');
      expect(result.meta.promptVersion).toBeGreaterThan(0);
      expect(result.meta.model).toBe('claude-opus-5');
    }
  });

  it('nevalidní JSON skončí bezpečnou chybou a ničím částečným', async () => {
    const result = await generateTracker(input, replyWith('{ "title": '));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('invalid_json');
      expect(result.retryable).toBe(true);
      expect(result).not.toHaveProperty('definition');
    }
  });

  it('odpověď mimo schéma se neuloží', async () => {
    const broken = { ...validDefinition, sections: [{ ...validDefinition.sections[0], fields: [{ id: 'x', type: 'iframe', label: 'X', required: false, order: 0 }] }] };
    const result = await generateTracker(input, replyWith(JSON.stringify(broken)));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('invalid_schema');
  });

  it('HTML v odpovědi se odmítne', async () => {
    const evil = { ...validDefinition, title: '<script>alert(1)</script>' };
    const result = await generateTracker(input, replyWith(JSON.stringify(evil)));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('invalid_schema');
  });

  it('odmítnutí modelu je neopakovatelná chyba', async () => {
    const result = await generateTracker(input, replyWith('', 'refusal'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('refused');
      expect(result.retryable).toBe(false);
    }
  });

  it('uříznutá odpověď se pozná podle stop_reason', async () => {
    const result = await generateTracker(input, replyWith('{"schemaVersion":1,"title":"Den', 'max_tokens'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.category).toBe('truncated');
  });

  it('timeout je opakovatelný', async () => {
    const caller: ModelCaller = async () => {
      throw Object.assign(new Error('Request timed out'), { name: 'APIConnectionTimeoutError' });
    };
    const result = await generateTracker(input, caller);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('timeout');
      expect(result.retryable).toBe(true);
    }
  });

  it('rate limit a chyba serveru jsou opakovatelné', async () => {
    const rate: ModelCaller = async () => {
      throw Object.assign(new Error('too many'), { status: 429 });
    };
    const server: ModelCaller = async () => {
      throw Object.assign(new Error('boom'), { status: 503 });
    };
    expect((await generateTracker(input, rate) as any).category).toBe('rate_limited');
    expect((await generateTracker(input, server) as any).category).toBe('upstream_error');
  });

  it('chybějící klíč není opakovatelný', async () => {
    const caller: ModelCaller = async () => {
      throw Object.assign(new Error('Chybí ANTHROPIC_API_KEY'), { category: 'not_configured' });
    };
    const result = await generateTracker(input, caller);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.category).toBe('not_configured');
      expect(result.retryable).toBe(false);
    }
  });

  it('hlášky pro uživatele neobsahují technické detaily', () => {
    for (const message of Object.values(FAILURE_MESSAGE)) {
      expect(message).not.toMatch(/anthropic|api|token|stack|500|429/i);
    }
  });

  it('do logu nejde obsah odpovědi', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await generateTracker(input, replyWith('{"tajemstvi":"citlivy obsah"}'));
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('citlivy obsah');
    spy.mockRestore();
  });
});

describe('minimalizace dat pro model', () => {
  it('obsahuje jen otázky a odpovědi', () => {
    const { answers } = validateAnswers({ hlavni_otazka: 'Proč jsem unavený?', spanek: 'kolísá', cas_denne: '2–3 minuty' });
    const minimized = minimizeForModel(answers);
    expect(minimized.questionnaireVersion).toBeGreaterThan(0);
    expect(Object.keys(minimized)).toEqual(['questionnaireVersion', 'answers']);
    expect(minimized.answers[0]).toHaveProperty('question');
    expect(minimized.answers[0]).toHaveProperty('answer');
  });

  it('neobsahuje identifikátory účtu ani platby', () => {
    const { answers } = validateAnswers({ hlavni_otazka: 'Proč jsem unavený?', spanek: 'kolísá' });
    const serialized = JSON.stringify(minimizeForModel(answers));
    for (const forbidden of ['acc_', 'cus_', 'pi_', 'cs_', '@', 'tenantId', 'accountId', 'slug', 'sk_']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('prázdné odpovědi se neposílají', () => {
    const minimized = minimizeForModel({ hlavni_otazka: 'x', leky: '   ' } as any);
    expect(minimized.answers.map((a) => a.answer)).not.toContain('');
    expect(minimized.answers).toHaveLength(1);
  });

  it('uživatelský vstup jde do zprávy, ne do systémového promptu', () => {
    const { answers } = validateAnswers({ hlavni_otazka: 'Proč jsem unavený?' });
    expect(SYSTEM_PROMPT).not.toContain('Proč jsem unavený');
    expect(buildUserPrompt(minimizeForModel(answers))).toContain('Proč jsem unavený');
  });
});

describe('systémový prompt', () => {
  it('zakazuje diagnózu, léčbu a spustitelný obsah', () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain('diagnóz');
    expect(lower).toContain('léčbu');
    expect(lower).toContain('skripty');
    expect(lower).toContain('nenahrazuje lékařské vyšetření');
  });

  it('obsahuje neutrální i zakázané formulace', () => {
    expect(SYSTEM_PROMPT).toContain('Pravděpodobně máte');
    expect(SYSTEM_PROMPT).toContain('Tento údaj může pomoci při hledání souvislostí.');
  });
});

describe('dotazník neurčuje oblasti za uživatele', () => {
  it('bez výběru oblastí projde odeslání', () => {
    const { ok, problems } = validateAnswers(
      {
        hlavni_otazka: 'Proč mě odpoledne přepadne únava?',
        cas_denne: 'do 1 minuty',
        detail: 'jen to podstatné',
      },
      { requireComplete: true }
    );
    expect(problems).toEqual([]);
    expect(ok).toBe(true);
  });

  it('výběr oblastí už mezi otázkami není', () => {
    expect(ALL_QUESTIONS.find((q) => q.id === 'oblasti')).toBeUndefined();
  });

  it('povinné jsou jen tři otázky, každá v jiné sekci než ostatní povinné', () => {
    const required = ALL_QUESTIONS.filter((q) => q.required);
    expect(required.map((q) => q.id)).toEqual(['hlavni_otazka', 'cas_denne', 'detail']);
  });
});

describe('kontrola povinných odpovědí po sekcích', () => {
  const sekce = (id: string) => QUESTIONNAIRE.sections.find((s) => s.id === id)!.questions;

  it('chybějící odpověď se pozná už v její sekci', () => {
    const problemy = missingRequired({}, sekce('cil'));
    // Uživatel se to dozví na první obrazovce, ne až na konci dotazníku.
    expect(Object.keys(problemy)).toEqual(['hlavni_otazka']);
  });

  it('vyplněná sekce projde', () => {
    expect(missingRequired({ hlavni_otazka: 'Proč jsem unavený?' }, sekce('cil'))).toEqual({});
  });

  it('sekce bez povinných otázek nikdy neblokuje', () => {
    expect(missingRequired({}, sekce('oblasti'))).toEqual({});
    expect(missingRequired({}, sekce('kontext'))).toEqual({});
  });

  it('samá mezera se nepočítá jako odpověď', () => {
    expect(missingRequired({ hlavni_otazka: '   ' }, sekce('cil'))).toHaveProperty('hlavni_otazka');
  });

  it('u výběru je hláška o výběru, u textu o odpovědi', () => {
    const vsechno = missingRequired({});
    expect(vsechno.cas_denne).toContain('Vyber');
    expect(vsechno.hlavni_otazka).not.toContain('Vyber');
  });
});
