import { describe, expect, it } from 'vitest';
import { minimizeForModel } from '../lib/questionnaire';
import { trackerDesignProblems } from '../lib/tracker/design-quality';
import type { TrackerDefinition, TrackerField } from '../lib/tracker/schema';

function field(index: number): TrackerField {
  return {
    id: `udaj_${index}`, type: 'scale', label: 'Míra únavy',
    description: 'Ohodnoť dnešek: 0 = bez únavy, 10 = nejsilnější únava. Údaj umožní srovnání dní.',
    required: index === 0, order: index, min: 0, max: 10, higherIsBetter: false,
  };
}

function definition(count = 3): TrackerDefinition {
  return {
    schemaVersion: 1, title: 'Energie během dne', description: 'Denní sledování energie a okolností.',
    disclaimer: 'Vlastní pozorování, nikoli diagnóza.', estimatedDailyMinutes: 1,
    sections: [{ id: 'den', title: 'Dnešní den', kind: 'daily', order: 0, fields: Array.from({ length: count }, (_, i) => field(i)) }],
  };
}

const input = (budget = '2–3 minuty') => minimizeForModel({ hlavni_otazka: 'Kdy jsem unavený?', cas_denne: budget, detail: 'podrobné' });

describe('kontrola použitelnosti nového návrhu deníku', () => {
  it.each([
    ['do 1 minuty', 5, 1],
    ['2–3 minuty', 8, 3],
    ['asi 5 minut', 12, 5],
    ['klidně víc', 16, 8],
  ])('respektuje maximální počet polí pro %s i při podrobném zadání', (budget, count, minutes) => {
    const valid = definition(Number(count));
    valid.estimatedDailyMinutes = Number(minutes);
    expect(trackerDesignProblems(valid, input(String(budget)))).toEqual([]);
    const excessive = definition(Number(count) + 1);
    excessive.estimatedDailyMinutes = Number(minutes);
    expect(trackerDesignProblems(excessive, input(String(budget))).join(' ')).toContain('Počet denních polí');
  });

  it('počítá denní pole napříč sekcemi i podmíněná pole', () => {
    const diary = definition(4);
    diary.sections.push({ id: 'navic', title: 'Další údaje', kind: 'daily', order: 1, fields: [
      { ...field(4), visibility: { dependsOnFieldId: 'udaj_0', operator: 'equals', value: 3 } },
      field(5),
    ] });
    expect(trackerDesignProblems(diary, input('do 1 minuty')).join(' ')).toContain('Počet denních polí');
  });

  it('timeline kategorie nespotřebovávají limit denních polí', () => {
    const diary = definition(5);
    diary.sections.push({ id: 'udalosti', title: 'Události', kind: 'timeline', order: 1, fields: [
      { id: 'jidlo', type: 'meal', label: 'Jídlo', description: 'Zapiš jídlo a čas výskytu pro porovnání denního režimu.', required: false, order: 0 },
    ] });
    expect(trackerDesignProblems(diary, input('do 1 minuty'))).toEqual([]);
  });

  it('omezuje kategorie událostí napříč sekcemi', () => {
    const diary = definition();
    diary.sections.push({ id: 'udalosti', title: 'Události', kind: 'timeline', order: 1, fields: Array.from({ length: 5 }, (_, index) => field(index + 3)) });
    expect(trackerDesignProblems(diary, input()).join(' ')).toContain('čtyři kategorie');
  });

  it('hlavní měření nelze schovat pod podmínkou', () => {
    const diary = definition();
    diary.sections[0].fields[0].visibility = { dependsOnFieldId: 'udaj_1', operator: 'equals', value: 3 };
    expect(trackerDesignProblems(diary, input()).join(' ')).toContain('stále dostupné hlavní měření');
  });

  it('povinný volný text nenahrazuje srovnatelné hlavní měření', () => {
    const diary = definition();
    diary.sections[0].fields[0] = { id: 'popis', label: 'Popis dne', description: 'Popiš den.', required: true, order: 0, type: 'long_text' };
    expect(trackerDesignProblems(diary, input()).join(' ')).toContain('hlavní měření');
  });

  it('přijme jednoznačnou informaci o výskytu bez vnucování škály', () => {
    const diary = definition();
    diary.sections[0].fields[0] = { id: 'vyskyt', label: 'Dnes se objevila potíž?', description: 'Večer zapiš ano i ne pro porovnání dní.', required: true, order: 0, type: 'boolean' };
    expect(trackerDesignProblems(diary, input())).toEqual([]);
  });

  it('vyžaduje denní základ, ale nepřipouští příliš mnoho povinných polí', () => {
    const diary = definition();
    diary.sections[0].fields.forEach((entry) => { entry.required = true; });
    expect(trackerDesignProblems(diary, input()).join(' ')).toContain('jedno až dvě');
    diary.sections[0].kind = 'timeline';
    expect(trackerDesignProblems(diary, input()).join(' ')).toContain('neobsahuje denní sledování');
    expect(trackerDesignProblems(diary, input()).join(' ')).toContain('Události v průběhu dne musí zůstat nepovinné');
  });

  it('prázdná vysvětlení neprojdou', () => {
    const diary = definition();
    diary.sections[0].fields[1].description = '  ';
    expect(trackerDesignProblems(diary, input()).join(' ')).toContain('chybí vysvětlení');
  });

  it.each(['number', 'duration', 'sleep'] as const)('kontroluje jednotku u typu %s', (type) => {
    const diary = definition();
    diary.sections[0].fields[1] = { id: 'kontext', label: 'Sledovaný údaj', type, description: 'Denní údaj pro srovnání.', required: false, order: 1 };
    expect(trackerDesignProblems(diary, input()).join(' ')).toContain('chybí jednotka');
    diary.sections[0].fields[1].unit = type === 'number' ? 'počet' : 'h';
    expect(trackerDesignProblems(diary, input())).toEqual([]);
  });

  it('odhad minut nelze vynechat ani překročit čas uživatele', () => {
    const diary = definition();
    delete diary.estimatedDailyMinutes;
    expect(trackerDesignProblems(diary, input()).join(' ')).toContain('chybí odhad');
    diary.estimatedDailyMinutes = 4;
    expect(trackerDesignProblems(diary, input()).join(' ')).toContain('Odhad doby zápisu překračuje');
  });

  it('nebere libovolnou zmínku o čase za nastavení časového limitu', () => {
    const diary = definition(8);
    const noBudget = minimizeForModel({ hlavni_otazka: 'do 1 minuty' });
    expect(trackerDesignProblems(diary, noBudget)).toEqual([]);
  });

  it('výsledek kontroly neobsahuje citlivé texty z návrhu ani odpovědí', () => {
    const diary = definition();
    diary.sections[0].fields[0].label = 'tajná citlivá informace';
    diary.sections[0].fields[0].description = '';
    const problems = trackerDesignProblems(diary, input()).join(' ');
    expect(problems).not.toContain('tajná citlivá informace');
  });
});
