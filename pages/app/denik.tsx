import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import { Msg } from '../../components/ui';
import { TrackerFieldInput, formatValue } from '../../components/TrackerFields';
import type { TrackerDefinition, TrackerField, TrackerSection } from '../../lib/tracker/schema';
import { FieldValue, TrackerDay, TrackerEvent, isVisible } from '../../lib/tracker/entry';

interface DayResponse {
  date: string;
  activeVersion: number;
  definition: TrackerDefinition;
  definitionVersion: number;
  day: TrackerDay;
  outdated: boolean;
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function nowHm() {
  return new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Denní sekce. Povinná pole a první tři nepovinná jsou vidět rovnou, zbytek se rozbalí —
 * dlouhý formulář je hlavní důvod, proč lidi zápis vzdají.
 */
function DailySection({
  section,
  values,
  onChange,
}: {
  section: TrackerSection;
  values: Record<string, FieldValue>;
  onChange: (fieldId: string, value: FieldValue | undefined) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = [...section.fields].sort((a, b) => a.order - b.order).filter((f) => isVisible(f, values));

  const primary = visible.filter((f, i) => f.required || i < 3 || values[f.id] !== undefined);
  const rest = visible.filter((f) => !primary.includes(f));
  const shown = expanded ? visible : primary;

  return (
    <section className="card">
      <h2>{section.title}</h2>
      {section.description && <p className="hint" style={{ marginTop: -4 }}>{section.description}</p>}
      <div className="stack" style={{ marginTop: 12 }}>
        {shown.map((field) => (
          <TrackerFieldInput
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(v) => onChange(field.id, v)}
          />
        ))}
      </div>
      {rest.length > 0 && (
        <button className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 10 }} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Skrýt další' : `Doplnit další (${rest.length})`}
        </button>
      )}
    </section>
  );
}

export default function Denik() {
  const [date, setDate] = useState('');
  const [data, setData] = useState<DayResponse | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [note, setNote] = useState('');
  const [noteTime, setNoteTime] = useState('');
  const [openField, setOpenField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState<FieldValue | undefined>(undefined);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const load = async (d: string) => {
    const res = await fetch(`/api/tracker-day?date=${d}`);
    if (res.status === 409) {
      setIsError(true);
      setMessage('Deník ještě není sestavený.');
      setData(null);
      return;
    }
    if (!res.ok) {
      setIsError(true);
      setMessage('Den se nepodařilo načíst.');
      return;
    }
    setData(await res.json());
    setMessage('');
  };

  useEffect(() => {
    const t = todayIso();
    setDate(t);
    load(t);
  }, []);

  const say = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
    if (!error) setTimeout(() => setMessage((m) => (m === text ? '' : m)), 2000);
  };

  const persist = async (day: TrackerDay, okMessage: string) => {
    const previous = data;
    if (!previous) return;
    setData({ ...previous, day });
    try {
      const res = await fetch('/api/tracker-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, day }),
      });
      if (!res.ok) throw new Error('Uložení selhalo.');
      const saved = await res.json();
      setData((prev) => (prev ? { ...prev, day: saved.day } : prev));
      say(okMessage);
    } catch (err: any) {
      setData(previous);
      say(err.message, true);
    }
  };

  const setAnswer = (fieldId: string, value: FieldValue | undefined) => {
    if (!data) return;
    const answers = { ...data.day.answers };
    if (value === undefined) delete answers[fieldId];
    else answers[fieldId] = value;
    persist({ ...data.day, answers }, 'Uloženo');
  };

  const timelineFields: TrackerField[] = (data?.definition.sections ?? [])
    .filter((s) => s.kind === 'timeline')
    .flatMap((s) => s.fields);

  /** Volná poznámka: bez kategorie, bez rozhodování. */
  const addNote = () => {
    if (!data || !note.trim()) return;
    const event: TrackerEvent = {
      id: newId(),
      sectionId: '',
      fieldId: '',
      time: noteTime || nowHm(),
      value: '',
      note: note.trim(),
    };
    persist({ ...data.day, events: [...data.day.events, event] }, 'Zapsáno');
    setNote('');
    setNoteTime('');
    noteRef.current?.focus();
  };

  const addFieldEvent = (field: TrackerField) => {
    if (!data || fieldValue === undefined) return;
    const section = data.definition.sections.find((s) => s.fields.some((f) => f.id === field.id));
    const event: TrackerEvent = {
      id: newId(),
      sectionId: section?.id ?? '',
      fieldId: field.id,
      time: nowHm(),
      value: fieldValue,
    };
    persist({ ...data.day, events: [...data.day.events, event] }, 'Zapsáno');
    setOpenField(null);
    setFieldValue(undefined);
  };

  const removeEvent = (id: string) => {
    if (!data) return;
    persist({ ...data.day, events: data.day.events.filter((e) => e.id !== id) }, 'Smazáno');
  };

  const goTo = (d: string) => {
    setDate(d);
    load(d);
  };

  const definition = data?.definition;
  const dailySections = (definition?.sections ?? [])
    .filter((s) => s.kind === 'daily')
    .sort((a, b) => a.order - b.order);
  const events = [...(data?.day.events ?? [])].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const isToday = date === todayIso();

  return (
    <AppShell title={definition?.title || 'Deník'}>
      <section className="card">
        <div className="row">
          <button className="btn btn-ghost" style={{ flex: '0 0 44px' }} onClick={() => goTo(shiftDate(date, -1))}>
            ‹
          </button>
          <input className="input" type="date" value={date} onChange={(e) => goTo(e.target.value)} />
          <button
            className="btn btn-ghost"
            style={{ flex: '0 0 44px' }}
            disabled={isToday}
            onClick={() => goTo(shiftDate(date, 1))}
          >
            ›
          </button>
        </div>
        {data?.outdated && (
          <p className="hint" style={{ marginTop: 10 }}>
            Tento den je zapsaný podle starší verze deníku (v{data.definitionVersion}) a zobrazuje se v její podobě.
          </p>
        )}
        <Msg text={message} error={isError} />
      </section>

      {!data && (
        <section className="card">
          {message ? (
            <Link className="btn btn-primary btn-block" href="/app/tracker">
              Zobrazit stav deníku
            </Link>
          ) : (
            <p className="muted">Načítám…</p>
          )}
        </section>
      )}

      {data && (
        <section className="card">
          <h2>Rychlý zápis</h2>
          <p className="hint" style={{ marginTop: -4 }}>
            Cokoli, co tě napadne — jídlo, nálada, co se stalo. Kategorie řešit nemusíš.
          </p>
          <div className="stack" style={{ marginTop: 10 }}>
            <textarea
              ref={noteRef}
              className="textarea"
              rows={2}
              placeholder={isToday ? 'Co se právě děje?' : 'Co se ten den dělo?'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl/⌘+Enter zapíše, ať se nemusí sahat na tlačítko.
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addNote();
              }}
            />
            <div className="row">
              <input
                className="input"
                style={{ flex: '0 0 110px' }}
                type="time"
                value={noteTime || nowHm()}
                onChange={(e) => setNoteTime(e.target.value)}
              />
              <button className="btn btn-primary" onClick={addNote} disabled={!note.trim()}>
                Zapsat
              </button>
            </div>
          </div>

          {timelineFields.length > 0 && (
            <>
              <div className="chips" style={{ marginTop: 14 }}>
                {timelineFields.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`chip plain${openField === f.id ? ' active' : ''}`}
                    onClick={() => {
                      setOpenField(openField === f.id ? null : f.id);
                      setFieldValue(undefined);
                    }}
                  >
                    + {f.label}
                  </button>
                ))}
              </div>

              {openField && (() => {
                const field = timelineFields.find((f) => f.id === openField);
                if (!field) return null;
                return (
                  <div className="stack" style={{ marginTop: 10 }}>
                    <TrackerFieldInput field={field} value={fieldValue} onChange={setFieldValue} />
                    <button className="btn btn-primary btn-block" onClick={() => addFieldEvent(field)} disabled={fieldValue === undefined}>
                      Zapsat {field.label.toLowerCase()}
                    </button>
                  </div>
                );
              })()}
            </>
          )}

          {events.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {events.map((event) => {
                const field = timelineFields.find((f) => f.id === event.fieldId);
                return (
                  <div className="entry" key={event.id}>
                    <div className="entry-head">
                      <div style={{ minWidth: 0 }}>
                        <span className="entry-time">{event.time || '--:--'}</span>
                        {field && (
                          <>
                            {' '}
                            <span className="entry-cat">{field.label}</span>
                            <div className="entry-meta">{formatValue(field, event.value)}</div>
                          </>
                        )}
                        {event.note && <div className="entry-note">{event.note}</div>}
                      </div>
                      <button className="btn btn-sm btn-ghost" onClick={() => removeEvent(event.id)}>
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {data &&
        dailySections.map((section) => (
          <DailySection key={section.id} section={section} values={data.day.answers} onChange={setAnswer} />
        ))}

      {data && (
        <section className="card">
          <div className="btns">
            <Link className="btn btn-ghost" href="/app/ucet">
              Stáhnout záznamy
            </Link>
            <Link className="btn btn-ghost" href="/app">
              Účet
            </Link>
          </div>
          <p className="hint" style={{ marginTop: 10 }}>{definition?.disclaimer}</p>
        </section>
      )}
    </AppShell>
  );
}
