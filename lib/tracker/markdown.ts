// Export záznamů do Markdownu.
//
// Dokument obsahuje jen vlastní záznamy přihlášeného uživatele. Aplikace ho nikam neposílá –
// uživatel si ho stáhne a sám se rozhodne, co s ním. Text od uživatele se escapuje, aby
// nemohl rozbít strukturu dokumentu ani předstírat nadpis či tabulku.

import { TrackerDefinition, TrackerField } from './schema';
import { FieldValue, TrackerDay, dailySections, timelineSections } from './entry';
import { BRISTOL_OPTIONS } from './entry';

export const EXPORT_DISCLAIMER =
  'Tento dokument obsahuje vlastní záznamy uživatele. Nejde o lékařskou zprávu, diagnózu ani doporučení léčby.';

const DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

function weekday(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '?' : DOW[d.getUTCDay()];
}

/**
 * Text od uživatele bezpečně vloží do Markdownu: nesmí založit nadpis, seznam, citaci,
 * tabulku ani kódový blok a nesmí propašovat řídicí znaky.
 */
export function escapeMarkdown(raw: unknown): string {
  const text = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\r\n?/g, '\n');

  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/([\\`*_[\]|<>])/g, '\\$1')
        .replace(/^(\s*)([#>-])/, '$1\\$2')
        .replace(/^(\s*)(\d+)\./, '$1$2\\.')
    )
    .join('\n')
    .trim();
}

function formatValue(field: TrackerField, value: FieldValue | undefined): string {
  if (value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'ano' : 'ne';
  if (Array.isArray(value)) {
    return escapeMarkdown(value.map((v) => field.options?.find((o) => o.value === v)?.label ?? v).join(', '));
  }
  if (field.type === 'stool_bristol' && typeof value === 'number') {
    return escapeMarkdown(BRISTOL_OPTIONS.find((o) => o.value === value)?.label ?? String(value));
  }
  if (typeof value === 'number') return field.unit ? `${value} ${escapeMarkdown(field.unit)}` : String(value);
  const option = field.options?.find((o) => o.value === value);
  return escapeMarkdown(option ? option.label : value);
}

export interface ExportDay {
  date: string;
  day: TrackerDay;
}

export interface TrackerExportInput {
  /** Definice podle verzí – den se vypisuje podle té, se kterou vznikl. */
  definitions: Map<number, TrackerDefinition>;
  activeVersion: number;
  days: ExportDay[];
  range?: { from?: string; to?: string };
  generatedAt?: Date;
}

export function buildTrackerMarkdown(input: TrackerExportInput): string {
  const { definitions, activeVersion, days, range, generatedAt = new Date() } = input;
  const active = definitions.get(activeVersion);
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const withContent = sorted.filter(
    (d) => Object.keys(d.day.answers ?? {}).length > 0 || (d.day.events ?? []).length > 0 || d.day.note
  );

  const L: string[] = [];
  const p = (...lines: string[]) => L.push(...lines);

  p(
    `# ${escapeMarkdown(active?.title ?? 'Záznamy')}`,
    '',
    `Export vytvořen: ${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    `Vybrané období: ${range?.from || sorted[0]?.date || '—'} – ${range?.to || sorted[sorted.length - 1]?.date || '—'}`,
    `Dnů se záznamem: ${withContent.length}`,
    `Verze deníku: ${activeVersion}${
      new Set(withContent.map((d) => d.day.version)).size > 1 ? ' (starší dny podle své vlastní verze)' : ''
    }`,
    ''
  );

  if (active?.description) p(escapeMarkdown(active.description), '');

  p(
    '> ' + EXPORT_DISCLAIMER,
    '',
    active?.disclaimer ? `> ${escapeMarkdown(active.disclaimer)}` : '',
    '',
    '## Záznamy',
    ''
  );

  if (!withContent.length) {
    p('_Ve vybraném období nejsou žádné záznamy._', '');
  }

  for (const { date, day } of withContent) {
    const definition = definitions.get(day.version) ?? active;
    if (!definition) continue;

    p(`### ${date} (${weekday(date)})`, '');
    if (day.version !== activeVersion) p(`_Zapsáno podle verze deníku ${day.version}._`, '');

    for (const section of dailySections(definition)) {
      const rows = [...section.fields]
        .sort((a, b) => a.order - b.order)
        .filter((f) => day.answers?.[f.id] !== undefined)
        .map((f) => `- ${escapeMarkdown(f.label)}: ${formatValue(f, day.answers[f.id])}`);
      if (!rows.length) continue;
      p(`**${escapeMarkdown(section.title)}**`, ...rows, '');
    }

    for (const section of timelineSections(definition)) {
      const events = (day.events ?? [])
        .filter((e) => section.fields.some((f) => f.id === e.fieldId))
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      if (!events.length) continue;
      p(`**${escapeMarkdown(section.title)}**`);
      for (const event of events) {
        const field = section.fields.find((f) => f.id === event.fieldId);
        if (!field) continue;
        const value = formatValue(field, event.value);
        const note = event.note ? ` — ${escapeMarkdown(event.note)}` : '';
        p(`- ${event.time || '--:--'} · ${escapeMarkdown(field.label)}: ${value}${note}`);
      }
      p('');
    }

    // Volné poznámky nepatří k žádné sekci, ale často nesou to nejzajímavější.
    const freeNotes = (day.events ?? [])
      .filter((e) => !e.fieldId && e.note)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    if (freeNotes.length) {
      p('**Poznámky během dne**');
      for (const note of freeNotes) p(`- ${note.time || '--:--'} · ${escapeMarkdown(note.note)}`);
      p('');
    }

    if (day.note) p('**Poznámka**', escapeMarkdown(day.note), '');
  }

  p(
    '## O tomto dokumentu',
    '',
    'Obsahem jsou pozorování, která si uživatel sám zapsal. Nejde o měření zdravotnickým',
    'zařízením ani o záznam pořízený zdravotnickým pracovníkem. Chybějící údaj je označený „—“',
    'a znamená, že nebyl vyplněn — ne že měl nulovou hodnotu.',
    '',
    EXPORT_DISCLAIMER,
    ''
  );

  return L.filter((line) => line !== undefined).join('\n');
}
