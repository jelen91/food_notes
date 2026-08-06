// Generátor .md exportu. Formát je navržený tak, aby ho LLM zvládlo analyzovat:
// nejdřív zadání a legenda, pak strojově čitelné CSV tabulky, pak čitelný denní zápis.

import {
  DAILY_SCALES,
  EVENT_CATEGORIES,
  CATEGORY_BY_KEY,
  SCALE_MAX,
  SCALE_MIN,
  DayDoc,
  Entry,
  EventEntry,
  WeaknessEntry,
  LabDoc,
  labFlag,
} from './schema';
import { metricLabel, metricUnit, formatNumber, healthRows } from './health';
import { eventDetail, weaknessLine } from './format';

export const MAX_LAG_DAYS = 14;

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
  const s = String(v);
  // Středník escapovat nemusíme (oddělovač je čárka) a bez uvozovek jsou víchodnotová pole čitelnější.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csv).join(',');
}

function block(lines: string[], lang = 'csv'): string[] {
  return ['```' + lang, ...lines, '```', ''];
}

function isWeakness(e: Entry): e is WeaknessEntry {
  return e.type === 'weakness';
}

function isEvent(e: Entry): e is EventEntry {
  return e.type !== 'weakness';
}

function labValueLine(v: LabDoc['values'][number]): string {
  const flag = labFlag(v);
  const mark = flag === 'low' ? ' ⬇ pod referencí' : flag === 'high' ? ' ⬆ nad referencí' : '';
  const ref =
    v.refLow !== undefined || v.refHigh !== undefined
      ? ` [ref ${v.refLow ?? ''}–${v.refHigh ?? ''}]`
      : '';
  const value = typeof v.value === 'number' ? formatNumber(v.value) : v.value;
  return `${v.name}: ${value}${v.unit ? ` ${v.unit}` : ''}${ref}${mark}${v.note ? ` – ${v.note}` : ''}`;
}

export interface ExportInput {
  days: DayDoc[];
  labs: LabDoc[];
  generatedAt?: Date;
}

export function buildMarkdown({ days, labs, generatedAt = new Date() }: ExportInput): string {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const sortedLabs = [...labs].sort((a, b) => a.date.localeCompare(b.date));
  const labsByDate = new Map(sortedLabs.map((l) => [l.date, l]));

  // Sloupce pro širokou tabulku Apple Health = sjednocení všech metrik napříč dny.
  const metricKeys = Array.from(
    new Set(sorted.flatMap((d) => Object.keys(d.health ?? {})))
  ).sort((a, b) => a.localeCompare(b));
  const unitsByKey: Record<string, string> = {};
  for (const key of metricKeys) {
    const day = sorted.find((d) => d.healthUnits?.[key]);
    unitsByKey[key] = metricUnit(key, day?.healthUnits ?? null);
  }

  const allEntries = sorted.flatMap((d) => (d.entries ?? []).map((e) => ({ date: d.date, e })));
  const events = allEntries.filter((x) => isEvent(x.e)) as Array<{ date: string; e: EventEntry }>;
  const episodes = allEntries.filter((x) => isWeakness(x.e)) as Array<{ date: string; e: WeaknessEntry }>;
  const daysWithScales = sorted.filter((d) => Object.keys(d.scales ?? {}).length > 0);
  const first = sorted[0]?.date ?? '—';
  const last = sorted[sorted.length - 1]?.date ?? '—';

  const L: string[] = [];
  const p = (...lines: string[]) => L.push(...lines);

  // ---------- hlavička ----------
  p(
    '# Zdravotní deník — strukturovaný export pro analýzu',
    '',
    `Vygenerováno: ${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    `Rozsah dat: ${first} – ${last} (${plural(sorted.length, ['den', 'dny', 'dní'])} se záznamem)`,
    `Obsah: ${plural(daysWithScales.length, ['den', 'dny', 'dní'])} s vyplněnými subjektivními škálami · ${plural(events.length, ['událost', 'události', 'událostí'])} · ${plural(episodes.length, ['epizoda', 'epizody', 'epizod'])} slabosti · ${plural(sortedLabs.length, ['laboratorní odběr', 'laboratorní odběry', 'laboratorních odběrů'])} · ${plural(metricKeys.length, ['metrika', 'metriky', 'metrik'])} z Apple Health`,
    '',
    'Data pochází z jednoho člověka (self-tracking). Jde o denní deník, ne o klinickou dokumentaci.',
    ''
  );

  // ---------- 1. zadání ----------
  p(
    '## 1. Zadání pro analýzu',
    '',
    'Cílem je najít **dlouhodobé souvislosti mezi subjektivními příznaky a objektivními daty**.',
    '',
    '**Co analyzovat**',
    '',
    '- Závislé proměnné (výstupy): denní subjektivní škály (sekce 2.1) a epizody slabosti (výskyt, intenzita, trvání).',
    '- Nezávislé proměnné (expozice): metriky z Apple Health, události podle kategorií (trénink, kofein, alkohol, léky, doplňky, stres, nemoc, cestování, práce, jídlo) a laboratorní hodnoty.',
    `- **Časový posun (lag) 0 až ${MAX_LAG_DAYS} dní**: expozice v den D → příznak v den D+lag, pro každý lag zvlášť. Zajímavé jsou i kumulativní expozice (klouzavý průměr/součet za 3, 7 a 14 dní) a naopak zpožděné doznívání.`,
    '- Opakující se vzorce: dny v týdnu, sekvence (např. dva tréninkové dny po sobě), kombinace faktorů, prahové hodnoty (např. spánek < 6 h), sezónnost.',
    '- Kolem epizod slabosti: co jim předcházelo v horizontu hodin i dní (jídlo, trénink, spánek, HRV, klidový tep, alkohol, léky).',
    '- Laboratorní hodnoty: porovnej trend v čase a dej ho do souvislosti s obdobími horších/lepších příznaků. Zohledni metadata odběru (nalačno, čas, kontext).',
    '',
    '**Jak reportovat**',
    '',
    '1. Tabulka nejsilnějších nálezů: vzorec · lag · n (počet použitých dní/dvojic) · směr a velikost efektu (rozdíl průměrů nebo Spearmanovo ρ) · orientační p-hodnota nebo poznámka o nejistotě · síla důkazu (silná / slabá / náhoda).',
    '2. Hypotézy: co by mohlo pozorované vzorce vysvětlovat, seřazené podle věrohodnosti.',
    '3. Návrh, co dál sledovat nebo cíleně otestovat (co doplnit do deníku, jaký jednoduchý experiment).',
    '4. Otázky, které stojí za probrání s lékařem — bez vlastního závěru o diagnóze.',
    '',
    '**Pravidla**',
    '',
    `- **Nediagnostikuj a nedoporučuj léčbu ani dávkování.** Formuluj hypotézy a upozornění, ne závěry o nemoci.`,
    '- Vždy uveď `n`. Nálezy s méně než ~5 pozorováními označ jako neprůkazné.',
    '- Hlídej vícenásobné testování: desítky metrik × 15 posunů generuje falešné nálezy. Preferuj vzorce, které jsou konzistentní napříč sousedními lagy a dávají fyziologický smysl.',
    '- Rozlišuj korelaci a kauzalitu a zvaž obrácený směr (slabost → méně kroků, ne kroky → slabost) i společné příčiny (nemoc ovlivní obojí).',
    '- Chybějící údaj neznamená nulu. Prázdné buňky vynech z výpočtu, nedoplňuj je.',
    '- Pozor na nestejnou hustotu dat: některé metriky začaly být měřené později, některé dny nejsou vyplněné vůbec.',
    ''
  );

  // ---------- 2. legenda ----------
  p('## 2. Legenda a datový model', '');

  p(
    `### 2.1 Denní subjektivní škály (${SCALE_MIN}–${SCALE_MAX})`,
    '',
    'Vyplňují se jednou za den, zpětně za celý den. Sloupec „směr“ říká, co znamená vyšší číslo.',
    '',
    '| klíč | škála | směr | význam |',
    '| --- | --- | --- | --- |'
  );
  for (const s of DAILY_SCALES) {
    p(`| \`${s.key}\` | ${s.label} | ${s.direction === 'higherBetter' ? 'vyšší = lépe' : 'vyšší = hůř'} | ${s.hint} |`);
  }
  p('');

  p(
    '### 2.2 Kategorie událostí',
    '',
    'Události jsou zaznamenané s časem (HH:MM). Kategorie mají volitelná strukturovaná pole.',
    '',
    '| klíč | kategorie | strukturovaná pole |',
    '| --- | --- | --- |'
  );
  for (const c of EVENT_CATEGORIES) {
    const fields = c.fields.length
      ? c.fields.map((f) => `${f.label}${f.unit ? ` (${f.unit})` : ''}`).join(', ')
      : '—';
    p(`| \`${c.key}\` | ${c.label} | ${fields} |`);
  }
  p(
    '',
    'U události mohou být navíc trávicí symptomy `plyny` a `tlak` na škále 1–5 (1 = minimum, 5 = extrém).',
    'Záznamy z období, kdy šlo ještě o stravovací deník, mají kategorii `jidlo`.',
    ''
  );

  p(
    '### 2.3 Epizoda slabosti',
    '',
    'Samostatný typ události pro akutní stav. Pole: čas začátku, intenzita 1–10, trvání v minutách,',
    'zasažené části těla, spouštěč, doprovodné příznaky, počet hodin od posledního jídla a co pomohlo.',
    'Epizody jsou v CSV `weakness_episodes` (sekce 3.4), víc hodnot v jednom poli je oddělených středníkem.',
    ''
  );

  p(
    '### 2.4 Data z Apple Health',
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
  if (!metricKeys.length) p('| — | žádná data z Apple Health | — | 0 |');
  p('');

  p(
    '### 2.5 Laboratorní výsledky',
    '',
    'Každý odběr má datum, metadata (čas, nalačno, laboratoř, kontext, medikace) a jednotlivé analyty',
    's hodnotou, jednotkou a referenčním rozmezím. `flag` = `low`/`high`/`ok` podle reference.',
    'Odběry jsou řídké — používej je jako body v čase, ne jako denní řadu.',
    ''
  );

  // ---------- 3. CSV ----------
  p('## 3. Strojově čitelné tabulky (CSV)', '', 'Prázdná buňka = nevyplněno / neměřeno. Desetinný oddělovač je tečka.', '');

  p(`### 3.1 daily_scales — denní subjektivní škály`, '');
  const scaleHeader = ['date', 'dow', ...DAILY_SCALES.map((s) => s.key), 'events', 'weakness_episodes'];
  const scaleRows = sorted.map((d) => {
    const entries = d.entries ?? [];
    return csvRow([
      d.date,
      weekday(d.date),
      ...DAILY_SCALES.map((s) => d.scales?.[s.key] ?? ''),
      entries.filter(isEvent).length,
      entries.filter(isWeakness).length,
    ]);
  });
  p(...block([csvRow(scaleHeader), ...scaleRows]));

  p('### 3.2 apple_health — denní metriky', '');
  if (metricKeys.length) {
    const healthRowsCsv = sorted
      .filter((d) => d.health && Object.keys(d.health).length)
      .map((d) => csvRow([d.date, ...metricKeys.map((k) => d.health?.[k] ?? '')]));
    p(...block([csvRow(['date', ...metricKeys]), ...healthRowsCsv]));
  } else {
    p('_Žádná data z Apple Health._', '');
  }

  p(
    '### 3.3 events — časované události',
    '',
    '`quantity` + `unit` nesou hlavní číselnou hodnotu kategorie (kofein v mg, alkohol v kusech, teplota u nemoci ve °C).',
    ''
  );
  const eventRows = events.map(({ date, e }) => {
    const def = CATEGORY_BY_KEY[e.category];
    const f = e.fields ?? {};
    const quantityField = def?.fields.find((x) => x.type === 'number' && x.key !== 'durationMin' && x.key !== 'intensity');
    return csvRow([
      date,
      e.time,
      e.category,
      f.durationMin ?? '',
      f.intensity ?? '',
      quantityField ? f[quantityField.key] ?? '' : '',
      quantityField && f[quantityField.key] !== undefined ? quantityField.unit ?? '' : '',
      f.dose ?? '',
      e.note ?? '',
      e.gas ?? '',
      e.pressure ?? '',
    ]);
  });
  p(
    ...block([
      csvRow(['date', 'time', 'category', 'duration_min', 'intensity_1_10', 'quantity', 'unit', 'dose', 'note', 'gas_1_5', 'pressure_1_5']),
      ...eventRows,
    ])
  );

  p('### 3.4 weakness_episodes — epizody slabosti', '');
  const episodeRows = episodes.map(({ date, e }) =>
    csvRow([
      date,
      e.time,
      e.severity ?? '',
      e.durationMin ?? '',
      e.lastMealHoursAgo ?? '',
      (e.bodyParts ?? []).join('; '),
      (e.triggers ?? []).join('; '),
      (e.symptoms ?? []).join('; '),
      (e.relief ?? []).join('; '),
      e.note ?? '',
    ])
  );
  p(
    ...block([
      csvRow(['date', 'time', 'severity_1_10', 'duration_min', 'last_meal_hours_ago', 'body_parts', 'triggers', 'symptoms', 'relief', 'note']),
      ...episodeRows,
    ])
  );

  p('### 3.5 labs — laboratorní hodnoty (dlouhý formát)', '');
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

  // ---------- 4. denní zápisy ----------
  p('## 4. Denní zápisy', '', 'Chronologicky vzestupně. Slouží pro kontext a detaily, které se do tabulek nevešly.', '');
  for (const day of sorted) {
    const entries = [...(day.entries ?? [])].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const dayEvents = entries.filter(isEvent);
    const dayEpisodes = entries.filter(isWeakness);
    const scales = DAILY_SCALES.filter((s) => day.scales?.[s.key] !== undefined);
    const rows = healthRows(day.health, day.healthUnits);
    const lab = labsByDate.get(day.date);
    const workouts = day.workouts ?? [];

    p(`### ${day.date} (${weekday(day.date)})`, '');
    p(
      scales.length
        ? `**Škály:** ${scales.map((s) => `${s.label} ${day.scales[s.key]}/${SCALE_MAX}`).join(' · ')}`
        : '**Škály:** nevyplněno'
    );

    if (dayEvents.length) {
      p('', '**Události:**');
      for (const e of dayEvents) {
        const detail = eventDetail(e);
        p(`- ${e.time || '--:--'} · ${e.category}${detail ? ` — ${detail}` : ''}`);
      }
    }

    if (dayEpisodes.length) {
      p('', '**Epizody slabosti:**');
      for (const e of dayEpisodes) {
        const detail = [weaknessLine(e), e.note ? `pozn.: ${e.note}` : ''].filter(Boolean).join(' · ');
        p(`- ${e.time || '--:--'} — ${detail || 'bez detailů'}`);
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

    if (rows.length) {
      p('', `**Apple Health:** ${rows.map((r) => `${r.label}: ${r.value}`).join(' · ')}`);
    }

    if (lab) {
      p('', `**Laboratorní odběr:** ${(lab.values ?? []).length} hodnot — detail v sekci 5.`);
    }
    p('');
  }

  // ---------- 5. laboratoře ----------
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
        for (const v of lab.values) p(`- ${labValueLine(v)}`);
      } else {
        p('- (žádné strukturované hodnoty)');
      }
      if (lab.filename) p('', `Původní PDF: ${lab.filename} (uložené v aplikaci, není součástí exportu).`);
      p('');
    }
  }

  // ---------- 6. kvalita dat ----------
  const categoryCounts = EVENT_CATEGORIES.map((c) => ({
    label: c.label,
    n: events.filter((x) => x.e.category === c.key).length,
  })).filter((x) => x.n > 0);

  p(
    '## 6. Kvalita a limity dat',
    '',
    `- Dní se záznamem: ${sorted.length}; z toho s vyplněnými škálami: ${daysWithScales.length}.`,
    `- Události podle kategorií: ${categoryCounts.length ? categoryCounts.map((c) => `${c.label} ${c.n}×`).join(' · ') : 'žádné'}.`,
    `- Epizod slabosti: ${episodes.length}.`,
    '- Deník je vyplňovaný ručně, takže chybějící události nejsou důkazem, že se nestaly (hlavně jídlo a doplňky bývají zaznamenané nepravidelně).',
    '- Subjektivní škály jsou vyplňované zpětně a mohou být ovlivněné náladou v okamžiku vyplnění.',
    '- Data z Apple Watch chybí ve dnech, kdy uživatel hodinky nenosil; nízké kroky mohou znamenat i nenošení, nejen nízkou aktivitu.',
    '- Čas u události je čas, kdy se věc stala, ne kdy byla zapsaná.',
    '',
    '## 7. Připomenutí',
    '',
    `Hledej vzorce s posunem 0–${MAX_LAG_DAYS} dní, uveď u každého nálezu n a nejistotu, odliš korelaci od kauzality,`,
    'upozorni na to, co vypadá statisticky zajímavě, a navrhni hypotézy — ale nestanovuj diagnózu ani léčbu.',
    ''
  );

  return L.join('\n');
}
