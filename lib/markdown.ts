// Generátor .md exportu. Formát je navržený tak, aby ho LLM zvládlo analyzovat:
// nejdřív zadání a legenda, pak strojově čitelné CSV tabulky, pak čitelný denní zápis.
// Obsah se řídí konfigurací zákazníka – co v ní není, se v exportu neobjeví.

import {
  DayData,
  Entry,
  LabDoc,
  categories,
  dailyMetrics,
  episodes,
  labFlag,
  scales,
  symptomsFor,
} from './schema';
import { DEFAULT_MAX_LAG_DAYS, FieldDef, TenantConfig, scaleMax, scaleMin } from './tenant/types';
import { metricLabel, metricUnit, formatNumber, healthRows } from './health';
import { entryFieldsText } from './format';

const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

/** České skloňování: 1 den · 2 dny · 5 dní. */
function plural(n: number, [one, few, many]: [string, string, string]): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

function weekday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '?' : DOW[d.getUTCDay()];
}

function csv(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = Array.isArray(v) ? v.join('; ') : String(v);
  // Středník escapovat nemusíme (oddělovač je čárka) a bez uvozovek jsou vícehodnotová pole čitelnější.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csv).join(',');
}

function block(lines: string[], lang = 'csv'): string[] {
  return ['```' + lang, ...lines, '```', ''];
}

function fieldHeader(f: FieldDef): string {
  const unit = f.unit ? `_${f.unit.replace(/[^a-zA-Z0-9]/g, '')}` : '';
  return `${f.key}${unit}`;
}

export interface ExportInput {
  config: TenantConfig;
  days: Array<{ date: string } & DayData>;
  labs: LabDoc[];
  generatedAt?: Date;
}

export function buildMarkdown({ config, days, labs, generatedAt = new Date() }: ExportInput): string {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const sortedLabs = [...labs].sort((a, b) => a.date.localeCompare(b.date));
  const labsByDate = new Map(sortedLabs.map((l) => [l.date, l]));
  const maxLag = config.export?.maxLagDays ?? DEFAULT_MAX_LAG_DAYS;

  const cfgScales = scales(config);
  const cfgMetrics = dailyMetrics(config);
  const cfgCategories = categories(config);
  const cfgEpisodes = episodes(config);
  const labsEnabled = config.modules?.labs !== false;

  const metricKeys = Array.from(new Set(sorted.flatMap((d) => Object.keys(d.health ?? {})))).sort((a, b) =>
    a.localeCompare(b)
  );
  const unitsByKey: Record<string, string> = {};
  for (const key of metricKeys) {
    const day = sorted.find((d) => d.healthUnits?.[key]);
    unitsByKey[key] = metricUnit(key, day?.healthUnits ?? null);
  }

  const allEntries = sorted.flatMap((d) => (d.entries ?? []).map((e) => ({ date: d.date, e })));
  const events = allEntries.filter((x) => x.e.kind === 'event');
  const allEpisodes = allEntries.filter((x) => x.e.kind === 'episode');
  const daysWithScales = sorted.filter((d) => Object.keys(d.scales ?? {}).length > 0);
  const first = sorted[0]?.date ?? '—';
  const last = sorted[sorted.length - 1]?.date ?? '—';

  const L: string[] = [];
  const p = (...lines: string[]) => L.push(...lines);

  // ---------- hlavička ----------
  p(
    `# ${config.title} — strukturovaný export pro analýzu`,
    '',
    `Vygenerováno: ${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    `Rozsah dat: ${first} – ${last} (${plural(sorted.length, ['den', 'dny', 'dní'])} se záznamem)`,
    `Obsah: ${plural(daysWithScales.length, ['den', 'dny', 'dní'])} s vyplněnými subjektivními škálami · ${plural(
      events.length,
      ['událost', 'události', 'událostí']
    )} · ${plural(allEpisodes.length, ['strukturovaná epizoda', 'strukturované epizody', 'strukturovaných epizod'])} · ${plural(
      sortedLabs.length,
      ['laboratorní odběr', 'laboratorní odběry', 'laboratorních odběrů']
    )} · ${plural(metricKeys.length, ['metrika', 'metriky', 'metrik'])} z Apple Health`,
    '',
    'Data pochází od jednoho člověka (self-tracking). Jde o denní deník, ne o klinickou dokumentaci.',
    ''
  );

  // ---------- 1. zadání ----------
  p(
    '## 1. Zadání pro analýzu',
    '',
    'Cílem je najít **dlouhodobé souvislosti mezi subjektivními příznaky a objektivními daty**.',
    ''
  );
  if (config.export?.focus) p(config.export.focus, '');
  p(
    '**Co analyzovat**',
    '',
    '- Závislé proměnné (výstupy): denní subjektivní škály (sekce 2.1) a strukturované epizody (výskyt, intenzita, trvání).',
    `- Nezávislé proměnné (expozice): metriky z Apple Health, denní údaje (sekce 2.2), události podle kategorií${
      labsEnabled ? ' a laboratorní hodnoty' : ''
    }.`,
    `- **Časový posun (lag) 0 až ${maxLag} dní**: expozice v den D → příznak v den D+lag, pro každý lag zvlášť. Zajímavé jsou i kumulativní expozice (klouzavý průměr/součet za 3, 7 a 14 dní) a naopak zpožděné doznívání.`,
    '- Opakující se vzorce: dny v týdnu, sekvence dnů, kombinace faktorů, prahové hodnoty (např. spánek < 6 h), sezónnost.',
    '- Kolem epizod: co jim předcházelo v horizontu hodin i dní.',
    ...(labsEnabled
      ? [
          '- Laboratorní hodnoty: porovnej trend v čase a dej ho do souvislosti s obdobími horších/lepších příznaků. Zohledni metadata odběru (nalačno, čas, kontext).',
        ]
      : []),
    '',
    '**Jak reportovat**',
    '',
    '1. Tabulka nejsilnějších nálezů: vzorec · lag · n (počet použitých dní/dvojic) · směr a velikost efektu (rozdíl průměrů nebo Spearmanovo ρ) · orientační p-hodnota nebo poznámka o nejistotě · síla důkazu (silná / slabá / náhoda).',
    '2. Hypotézy: co by mohlo pozorované vzorce vysvětlovat, seřazené podle věrohodnosti.',
    '3. Návrh, co dál sledovat nebo cíleně otestovat.',
    '4. Otázky, které stojí za probrání s lékařem — bez vlastního závěru o diagnóze.',
    '',
    '**Pravidla**',
    '',
    '- **Nediagnostikuj a nedoporučuj léčbu ani dávkování.** Formuluj hypotézy a upozornění, ne závěry o nemoci.',
    '- Vždy uveď `n`. Nálezy s méně než ~5 pozorováními označ jako neprůkazné.',
    `- Hlídej vícenásobné testování: desítky metrik × ${maxLag + 1} posunů generuje falešné nálezy. Preferuj vzorce konzistentní napříč sousedními lagy a fyziologicky smysluplné.`,
    '- Rozlišuj korelaci a kauzalitu a zvaž obrácený směr i společné příčiny.',
    '- Chybějící údaj neznamená nulu. Prázdné buňky vynech z výpočtu, nedoplňuj je.',
    '- Pozor na nestejnou hustotu dat: některé metriky začaly být měřené později, některé dny nejsou vyplněné vůbec.',
    ''
  );

  // ---------- 2. legenda ----------
  p('## 2. Legenda a datový model', '');

  if (cfgScales.length) {
    p(
      `### 2.1 Denní subjektivní škály`,
      '',
      'Vyplňují se jednou za den, zpětně za celý den. Sloupec „směr“ říká, co znamená vyšší číslo.',
      '',
      '| klíč | škála | rozsah | směr | význam |',
      '| --- | --- | --- | --- | --- |'
    );
    for (const s of cfgScales) {
      p(
        `| \`${s.key}\` | ${s.label} | ${scaleMin(s)}–${scaleMax(s)} | ${
          s.direction === 'higherBetter' ? 'vyšší = lépe' : 'vyšší = hůř'
        } | ${s.hint ?? '—'} |`
      );
    }
    p('');
  }

  if (cfgMetrics.length) {
    p(
      '### 2.2 Denní číselné údaje',
      '',
      'Ručně zapisované denní součty.',
      '',
      '| klíč | údaj | jednotka |',
      '| --- | --- | --- |'
    );
    for (const m of cfgMetrics) p(`| \`${m.key}\` | ${m.label} | ${m.unit ?? '—'} |`);
    p('');
  }

  if (cfgCategories.length) {
    p(
      '### 2.3 Kategorie událostí',
      '',
      'Události jsou zaznamenané s časem (HH:MM). Kategorie mají volitelná strukturovaná pole.',
      '',
      '| klíč | kategorie | strukturovaná pole |',
      '| --- | --- | --- |'
    );
    for (const c of cfgCategories) {
      const fields = c.fields?.length
        ? c.fields.map((f) => `${f.label}${f.unit ? ` (${f.unit})` : ''} → \`${fieldHeader(f)}\``).join(', ')
        : '—';
      p(`| \`${c.key}\` | ${c.label} | ${fields} |`);
    }
    p('');
    const symptomAll = config.entrySymptoms ?? [];
    if (symptomAll.length) {
      p(
        `U události mohou být navíc symptomy: ${symptomAll
          .map((s) => `${s.label} (\`${s.key}\`, 1–${s.max ?? 5})`)
          .join(', ')}.`,
        ''
      );
    }
  }

  if (cfgEpisodes.length) {
    p('### 2.4 Strukturované epizody', '');
    for (const ep of cfgEpisodes) {
      p(`**${ep.label}** (\`${ep.key}\`) — pole:`);
      for (const f of ep.fields ?? []) {
        const range = f.type === 'scale' ? ` (${f.min ?? 1}–${f.max ?? 10})` : f.unit ? ` (${f.unit})` : '';
        const options = f.options?.length ? `, volby: ${f.options.join(' / ')}` : '';
        p(`- \`${fieldHeader(f)}\` – ${f.label}${range}${options}`);
      }
      p('');
    }
    p('Víc hodnot v jednom poli je v CSV oddělených středníkem.', '');
  }

  if (metricKeys.length) {
    p(
      '### 2.5 Data z Apple Health',
      '',
      'Importuje se automaticky vše, co aplikace posílá. Denní hodnota vzniká agregací měření v rámci dne:',
      'kumulativní metriky (kroky, kalorie, vzdálenost, minuty aktivity, spánek) se **sčítají**, ostatní (tep, HRV, saturace, váha) se **průměrují**.',
      'Klíče s příponou `Min`/`Max` jsou denní minimum/maximum. `sleepHours` je celkový spánek, `sleepDeep`/`sleepRem`/`sleepCore`/`sleepAwake` jeho fáze.',
      '',
      '| klíč | metrika | jednotka | dní s daty |',
      '| --- | --- | --- | --- |'
    );
    for (const key of metricKeys) {
      const count = sorted.filter((d) => d.health && d.health[key] !== undefined).length;
      p(`| \`${key}\` | ${metricLabel(key)} | ${unitsByKey[key] || '—'} | ${count} |`);
    }
    p('');
  }

  if (labsEnabled) {
    p(
      '### 2.6 Laboratorní výsledky',
      '',
      'Každý odběr má datum, metadata (čas, nalačno, laboratoř, kontext, medikace) a jednotlivé analyty',
      's hodnotou, jednotkou a referenčním rozmezím. `flag` = `low`/`high`/`ok` podle reference.',
      'Odběry jsou řídké — používej je jako body v čase, ne jako denní řadu.',
      ''
    );
  }

  // ---------- 3. CSV ----------
  p('## 3. Strojově čitelné tabulky (CSV)', '', 'Prázdná buňka = nevyplněno / neměřeno. Desetinný oddělovač je tečka.', '');

  p('### 3.1 daily — denní škály a údaje', '');
  const dailyHeader = [
    'date',
    'dow',
    ...cfgScales.map((s) => s.key),
    ...cfgMetrics.map((m) => `${m.key}${m.unit ? `_${m.unit.replace(/[^a-zA-Z0-9]/g, '')}` : ''}`),
    'events',
    'episodes',
  ];
  const dailyRows = sorted.map((d) => {
    const entries = d.entries ?? [];
    return csvRow([
      d.date,
      weekday(d.date),
      ...cfgScales.map((s) => d.scales?.[s.key] ?? ''),
      ...cfgMetrics.map((m) => d.metrics?.[m.key] ?? ''),
      entries.filter((e) => e.kind === 'event').length,
      entries.filter((e) => e.kind === 'episode').length,
    ]);
  });
  p(...block([csvRow(dailyHeader), ...dailyRows]));

  if (metricKeys.length) {
    p('### 3.2 apple_health — denní metriky', '');
    const healthRowsCsv = sorted
      .filter((d) => d.health && Object.keys(d.health).length)
      .map((d) => csvRow([d.date, ...metricKeys.map((k) => d.health?.[k] ?? '')]));
    p(...block([csvRow(['date', ...metricKeys]), ...healthRowsCsv]));
  }

  if (cfgCategories.length) {
    p('### 3.3 events — časované události', '');
    // Sloupce = sjednocení polí všech kategorií; význam upřesňuje sloupec category a legenda 2.3.
    const fieldCols: Array<{ key: string; header: string }> = [];
    for (const c of cfgCategories) {
      for (const f of c.fields ?? []) {
        if (!fieldCols.some((x) => x.key === f.key)) fieldCols.push({ key: f.key, header: fieldHeader(f) });
      }
    }
    const symptomCols = (config.entrySymptoms ?? []).map((s) => s.key);
    const rows = events.map(({ date, e }) =>
      csvRow([
        date,
        e.time,
        e.key,
        e.note ?? '',
        ...fieldCols.map((c) => e.fields?.[c.key] ?? ''),
        ...symptomCols.map((k) => e.symptoms?.[k] ?? ''),
      ])
    );
    p(
      ...block([
        csvRow(['date', 'time', 'category', 'note', ...fieldCols.map((c) => c.header), ...symptomCols]),
        ...rows,
      ])
    );
  }

  cfgEpisodes.forEach((ep, i) => {
    p(`### 3.${4 + i} episodes_${ep.key} — ${ep.label}`, '');
    const cols = ep.fields ?? [];
    const rows = allEpisodes
      .filter((x) => x.e.key === ep.key)
      .map(({ date, e }) => csvRow([date, e.time, ...cols.map((f) => e.fields?.[f.key] ?? ''), e.note ?? '']));
    p(...block([csvRow(['date', 'time', ...cols.map(fieldHeader), 'note']), ...rows]));
  });

  if (labsEnabled) {
    p(`### 3.${4 + cfgEpisodes.length} labs — laboratorní hodnoty (dlouhý formát)`, '');
    const labRows: string[] = [];
    for (const lab of sortedLabs) {
      for (const v of lab.values ?? []) {
        labRows.push(
          csvRow([
            lab.date,
            lab.meta?.time ?? '',
            lab.meta?.fasting === undefined ? '' : lab.meta.fasting ? 'ano' : 'ne',
            lab.meta?.lab ?? '',
            v.name,
            v.value,
            v.unit ?? '',
            v.refLow ?? '',
            v.refHigh ?? '',
            labFlag(v) ?? '',
          ])
        );
      }
    }
    p(
      ...block([
        csvRow(['date', 'time', 'fasting', 'lab', 'analyte', 'value', 'unit', 'ref_low', 'ref_high', 'flag']),
        ...labRows,
      ])
    );
  }

  // ---------- 4. denní zápisy ----------
  p('## 4. Denní zápisy', '', 'Chronologicky vzestupně. Slouží pro kontext a detaily, které se do tabulek nevešly.', '');
  for (const day of sorted) {
    const entries = [...(day.entries ?? [])].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const dayEvents = entries.filter((e) => e.kind === 'event');
    const dayEpisodes = entries.filter((e) => e.kind === 'episode');
    const filled = cfgScales.filter((s) => day.scales?.[s.key] !== undefined);
    const filledMetrics = cfgMetrics.filter((m) => day.metrics?.[m.key] !== undefined);
    const rows = healthRows(day.health, day.healthUnits);
    const lab = labsByDate.get(day.date);
    const workouts = day.workouts ?? [];

    p(`### ${day.date} (${weekday(day.date)})`, '');
    p(
      filled.length
        ? `**Škály:** ${filled.map((s) => `${s.label} ${day.scales[s.key]}/${scaleMax(s)}`).join(' · ')}`
        : '**Škály:** nevyplněno'
    );
    if (filledMetrics.length) {
      p('', `**Denní údaje:** ${filledMetrics.map((m) => `${m.label} ${day.metrics[m.key]}${m.unit ? ` ${m.unit}` : ''}`).join(' · ')}`);
    }

    if (dayEvents.length) {
      p('', '**Události:**');
      for (const e of dayEvents) p(`- ${e.time || '--:--'} · ${e.key}${detailOf(config, e)}`);
    }

    if (dayEpisodes.length) {
      p('', '**Epizody:**');
      for (const e of dayEpisodes) {
        const fields = entryFieldsText(config, e);
        const detail = [fields, e.note ? `pozn.: ${e.note}` : ''].filter(Boolean).join(' · ');
        p(`- ${e.time || '--:--'} · ${e.key} — ${detail || 'bez detailů'}`);
      }
    }

    if (workouts.length) {
      p('', '**Tréninky z Apple Health:**');
      for (const w of workouts) {
        const bits = [
          w.start ? `${w.start}${w.end ? `–${w.end}` : ''}` : '',
          w.durationMin !== undefined ? `${w.durationMin} min` : '',
          w.energyKcal !== undefined ? `${formatNumber(w.energyKcal)} kcal` : '',
          w.distanceKm !== undefined ? `${formatNumber(w.distanceKm)} km` : '',
          w.heartRateAvg !== undefined ? `tep ⌀ ${formatNumber(w.heartRateAvg)}` : '',
          w.heartRateMax !== undefined ? `max ${formatNumber(w.heartRateMax)}` : '',
        ].filter(Boolean);
        p(`- ${w.name}${bits.length ? ` — ${bits.join(', ')}` : ''}`);
      }
    }

    if (rows.length) p('', `**Apple Health:** ${rows.map((r) => `${r.label}: ${r.value}`).join(' · ')}`);
    if (lab) p('', `**Laboratorní odběr:** ${(lab.values ?? []).length} hodnot — detail v sekci 5.`);
    p('');
  }

  // ---------- 5. laboratoře ----------
  if (labsEnabled) {
    p('## 5. Laboratorní odběry', '');
    if (!sortedLabs.length) {
      p('_Zatím žádné uložené výsledky._', '');
    } else {
      for (const lab of sortedLabs) {
        p(`### ${lab.date}`, '');
        const meta: string[] = [];
        if (lab.meta?.time) meta.push(`čas odběru: ${lab.meta.time}`);
        if (lab.meta?.fasting !== undefined) meta.push(lab.meta.fasting ? 'nalačno: ano' : 'nalačno: ne');
        if (lab.meta?.lab) meta.push(`laboratoř: ${lab.meta.lab}`);
        if (lab.meta?.reason) meta.push(`důvod: ${lab.meta.reason}`);
        if (lab.meta?.context) meta.push(`kontext: ${lab.meta.context}`);
        if (lab.meta?.medication) meta.push(`medikace v době odběru: ${lab.meta.medication}`);
        if (lab.meta?.note) meta.push(`poznámka: ${lab.meta.note}`);
        p(meta.length ? `**Metadata odběru:** ${meta.join(' · ')}` : '**Metadata odběru:** nevyplněna', '');
        if ((lab.values ?? []).length) {
          for (const v of lab.values) {
            const flag = labFlag(v);
            const mark = flag === 'low' ? ' ⬇ pod referencí' : flag === 'high' ? ' ⬆ nad referencí' : '';
            const ref =
              v.refLow !== undefined || v.refHigh !== undefined ? ` [ref ${v.refLow ?? ''}–${v.refHigh ?? ''}]` : '';
            const value = typeof v.value === 'number' ? formatNumber(v.value) : v.value;
            p(`- ${v.name}: ${value}${v.unit ? ` ${v.unit}` : ''}${ref}${mark}${v.note ? ` – ${v.note}` : ''}`);
          }
        } else {
          p('- (žádné strukturované hodnoty)');
        }
        if (lab.filename) p('', `Původní PDF: ${lab.filename} (uložené v aplikaci, není součástí exportu).`);
        p('');
      }
    }
  }

  // ---------- 6. kvalita dat ----------
  const categoryCounts = cfgCategories
    .map((c) => ({ label: c.label, n: events.filter((x) => x.e.key === c.key).length }))
    .filter((x) => x.n > 0);

  p(
    `## ${labsEnabled ? 6 : 5}. Kvalita a limity dat`,
    '',
    `- Dní se záznamem: ${sorted.length}; z toho s vyplněnými škálami: ${daysWithScales.length}.`,
    `- Události podle kategorií: ${categoryCounts.length ? categoryCounts.map((c) => `${c.label} ${c.n}×`).join(' · ') : 'žádné'}.`,
    ...cfgEpisodes.map((ep) => `- ${ep.label}: ${allEpisodes.filter((x) => x.e.key === ep.key).length}×.`),
    '- Deník je vyplňovaný ručně, takže chybějící události nejsou důkazem, že se nestaly.',
    '- Subjektivní škály jsou vyplňované zpětně a mohou být ovlivněné náladou v okamžiku vyplnění.',
    ...(metricKeys.length
      ? ['- Data z hodinek chybí ve dnech, kdy je uživatel nenosil; nízké kroky mohou znamenat i nenošení, nejen nízkou aktivitu.']
      : []),
    '- Čas u události je čas, kdy se věc stala, ne kdy byla zapsaná.',
    ...(config.export?.caveats ?? []).map((c) => `- ${c}`),
    '',
    `## ${labsEnabled ? 7 : 6}. Připomenutí`,
    '',
    `Hledej vzorce s posunem 0–${maxLag} dní, uveď u každého nálezu n a nejistotu, odliš korelaci od kauzality,`,
    'upozorni na to, co vypadá statisticky zajímavě, a navrhni hypotézy — ale nestanovuj diagnózu ani léčbu.',
    ''
  );

  return L.join('\n');
}

function detailOf(config: TenantConfig, e: Entry): string {
  const fields = entryFieldsText(config, e);
  const note = e.note || '';
  if (!note && !fields) return '';
  if (!fields) return ` — ${note}`;
  return ` — ${note}${note ? ' ' : ''}(${fields})`;
}
