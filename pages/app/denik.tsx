import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell from '../../components/AppShell';
import AnalysisProgress from '../../components/analysis/AnalysisProgress';
import { Msg } from '../../components/ui';
import { TrackerFieldInput, formatValue } from '../../components/TrackerFields';
import type { TrackerDefinition, TrackerField, TrackerSection } from '../../lib/tracker/schema';
import { FieldValue, TrackerDay, TrackerEvent, isVisible } from '../../lib/tracker/entry';
import { createDaySaveQueue } from '../../lib/tracker/day-save-queue';

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
      {section.description && (
        <p className="hint" style={{ marginTop: -4 }}>
          {section.description}
        </p>
      )}
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
        <button
          className="btn btn-ghost btn-block btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Skrýt další' : `Doplnit další (${rest.length})`}
        </button>
      )}
    </section>
  );
}

export default function Denik() {
  const router = useRouter();
  const [analysisRefresh, setAnalysisRefresh] = useState(0);
  const [date, setDate] = useState('');
  const [data, setData] = useState<DayResponse | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [note, setNote] = useState('');
  const [noteTime, setNoteTime] = useState('');
  const [openField, setOpenField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState<FieldValue | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const dataRef = useRef<DayResponse | null>(null);
  const mountedRef = useRef(true);
  const loadIdRef = useRef(0);
  const navigationIdRef = useRef(0);
  const composerRef = useRef({ note, noteTime, openField, fieldValue });
  composerRef.current = { note, noteTime, openField, fieldValue };
  const composersRef = useRef(new Map<string, typeof composerRef.current>());

  const say = useCallback((text: string, error = false) => {
    if (!mountedRef.current) return;
    setMessage(text);
    setIsError(error);
    if (!error)
      setTimeout(() => {
        if (mountedRef.current) setMessage((m) => (m === text ? '' : m));
      }, 2000);
  }, []);

  const savesRef = useRef<ReturnType<typeof createDaySaveQueue> | null>(null);
  if (!savesRef.current)
    savesRef.current = createDaySaveQueue({
      async save(change) {
        const body = JSON.stringify({ date: change.date, day: change.day });
        const res = await fetch('/api/tracker-day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          // Keepalive má omezenou velikost; delší den musí jít uložit běžným požadavkem.
          keepalive: new Blob([body]).size < 60 * 1024,
        });
        if (!res.ok) {
          if (res.status === 403) {
            const body = await res.json().catch(() => ({}));
            const message = body.error || 'Přístup k deníku není aktivní.';
            if (mountedRef.current) setAccessBlocked(message);
            throw new Error(
              `${message} Rozepsané změny zůstávají v této stránce, nejsou uložené na serveru.`
            );
          }
          throw new Error('Změny se nepodařilo uložit. Zůstávají zde připravené k opakování.');
        }
        if (mountedRef.current) setAccessBlocked('');
        const saved = await res.json();
        return saved.day;
      },
      saved(change, day) {
        const current = dataRef.current;
        if (!mountedRef.current) return;
        setAnalysisRefresh((value) => value + 1);
        if (current?.date !== change.date) return;
        dataRef.current = { ...current, day };
        setData(dataRef.current);
        setSaveError(false);
        say(change.message);
      },
      failed(change, error) {
        if (!mountedRef.current || dataRef.current?.date !== change.date) return;
        setSaveError(true);
        say(
          error instanceof Error
            ? error.message
            : 'Změny se nepodařilo uložit. Zůstávají zde připravené k opakování.',
          true
        );
      },
      status(value) {
        if (mountedRef.current) setSaving(value);
      },
    });

  const load = useCallback(
    async (d: string) => {
      const requestId = ++loadIdRef.current;
      dataRef.current = null;
      setData(null);
      setMessage('');
      setIsError(false);
      try {
        const res = await fetch(`/api/tracker-day?date=${d}`);
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          const message = body.error || 'Přístup k deníku není aktivní.';
          if (mountedRef.current && requestId === loadIdRef.current) setAccessBlocked(message);
          throw new Error(message);
        }
        if (!res.ok)
          throw new Error(res.status === 409 ? 'Deník ještě není sestavený.' : 'Den se nepodařilo načíst.');
        const loaded: DayResponse = await res.json();
        if (loaded.date !== d) throw new Error('Den se nepodařilo načíst.');
        if (!mountedRef.current || requestId !== loadIdRef.current) return;
        dataRef.current = loaded;
        setData(loaded);
        setAccessBlocked('');
      } catch (error) {
        if (!mountedRef.current || requestId !== loadIdRef.current) return;
        say((error as Error).message, true);
      }
    },
    [say]
  );

  useEffect(() => {
    mountedRef.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!savesRef.current?.hasUnsaved()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mountedRef.current = false;
      loadIdRef.current += 1;
      navigationIdRef.current += 1;
      window.removeEventListener('beforeunload', beforeUnload);
      // Frontu nerušíme: při navigaci v aplikaci dokončí již přijaté změny.
    };
  }, [load]);

  useEffect(() => {
    if (!router.isReady) return;
    const requested = router.query.den;
    const parsed =
      typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requested)
        ? new Date(`${requested}T00:00:00Z`)
        : null;
    const initial =
      parsed &&
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === requested &&
      requested <= todayIso()
        ? (requested as string)
        : todayIso();
    // A report links to a recorded date; normal diary navigation keeps its save queue.
    if (!dataRef.current) {
      setDate(initial);
      load(initial);
    }
  }, [router.isReady, router.query.den, load]);

  const persist = (day: TrackerDay, okMessage: string) => {
    const previous = dataRef.current;
    if (!previous) return;
    dataRef.current = { ...previous, day };
    setData(dataRef.current);
    setSaveError(false);
    // Datum patří načteným datům, nikdy momentální hodnotě přepínače dne.
    savesRef.current!.enqueue({ date: previous.date, day, message: okMessage });
  };

  const setAnswer = (fieldId: string, value: FieldValue | undefined) => {
    const current = dataRef.current;
    if (!current) return;
    const answers = { ...current.day.answers };
    if (value === undefined) delete answers[fieldId];
    else answers[fieldId] = value;
    persist({ ...current.day, answers }, 'Uloženo');
  };

  const timelineFields: TrackerField[] = (data?.definition.sections ?? [])
    .filter((s) => s.kind === 'timeline')
    .flatMap((s) => s.fields);

  /** Volná poznámka: bez kategorie, bez rozhodování. */
  const addNote = () => {
    const current = dataRef.current;
    if (!current || !note.trim()) return;
    const event: TrackerEvent = {
      id: newId(),
      sectionId: '',
      fieldId: '',
      time: noteTime,
      value: '',
      note: note.trim(),
    };
    persist({ ...current.day, events: [...current.day.events, event] }, 'Zapsáno');
    setNote('');
    setNoteTime('');
    noteRef.current?.focus();
  };

  const addFieldEvent = (field: TrackerField) => {
    const current = dataRef.current;
    if (!current || fieldValue === undefined) return;
    const section = current.definition.sections.find((s) => s.fields.some((f) => f.id === field.id));
    const event: TrackerEvent = {
      id: newId(),
      sectionId: section?.id ?? '',
      fieldId: field.id,
      time: noteTime,
      value: fieldValue,
    };
    persist({ ...current.day, events: [...current.day.events, event] }, 'Zapsáno');
    setOpenField(null);
    setFieldValue(undefined);
  };

  const removeEvent = (id: string) => {
    const current = dataRef.current;
    if (!current) return;
    persist({ ...current.day, events: current.day.events.filter((e) => e.id !== id) }, 'Smazáno');
  };

  const goTo = async (d: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > todayIso()) return;
    const parsed = new Date(`${d}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) return;
    const navigationId = ++navigationIdRef.current;
    const saved = await savesRef.current!.flush();
    if (!mountedRef.current || navigationId !== navigationIdRef.current) return;
    if (!saved) {
      setSaveError(true);
      say('Nejdřív prosím zopakuj uložení změn tohoto dne.', true);
      return;
    }
    // Rozepsaná poznámka zůstane u svého dne, i když ještě nebyla přidána do osy.
    if (dataRef.current) composersRef.current.set(dataRef.current.date, composerRef.current);
    const composer = composersRef.current.get(d);
    setNote(composer?.note ?? '');
    setNoteTime(composer?.noteTime ?? '');
    setOpenField(composer?.openField ?? null);
    setFieldValue(composer?.fieldValue);
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
      {accessBlocked && (
        <section className="card" role="status">
          <h2>Přístup k zapisování není aktivní</h2>
          <p className="muted">{accessBlocked}</p>
          <Link className="btn btn-primary btn-block" href="/app/ucet">
            Zobrazit účet a dostupný export
          </Link>
        </section>
      )}
      <section className="card">
        <div className="row">
          <button
            aria-label="Předchozí den"
            className="btn btn-ghost"
            style={{ flex: '0 0 44px' }}
            disabled={!date || Boolean(accessBlocked)}
            onClick={() => goTo(shiftDate(date, -1))}
          >
            ‹
          </button>
          <input
            className="input"
            type="date"
            aria-label="Datum záznamu"
            max={todayIso()}
            value={date}
            disabled={Boolean(accessBlocked)}
            onChange={(e) => goTo(e.target.value)}
          />
          <button
            className="btn btn-ghost"
            aria-label="Následující den"
            style={{ flex: '0 0 44px' }}
            disabled={!date || isToday || Boolean(accessBlocked)}
            onClick={() => goTo(shiftDate(date, 1))}
          >
            ›
          </button>
        </div>
        {data?.outdated && (
          <p className="hint" style={{ marginTop: 10 }}>
            Tento den je zapsaný podle starší verze deníku (v{data.definitionVersion}) a zobrazuje se v její
            podobě.
          </p>
        )}
        <Msg text={message} error={isError} />
        {saving && (
          <p className="hint" role="status">
            Ukládám změny…
          </p>
        )}
        {saveError && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={saving}
            onClick={() => savesRef.current!.retry()}
          >
            Zkusit uložit znovu
          </button>
        )}
      </section>

      {!data && !accessBlocked && (
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

      <fieldset disabled={Boolean(accessBlocked)} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {data && (
          <section className="card">
            <h2>Rychlý zápis</h2>
            <p className="hint" style={{ marginTop: -4 }}>
              Co se dělo, kdy a v jaké souvislosti. Zapiš i dny bez potíží, ať máš s čím srovnávat.
            </p>
            <div className="stack" style={{ marginTop: 10 }}>
              <textarea
                ref={noteRef}
                className="textarea"
                rows={2}
                aria-label="Rychlá poznámka"
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
                  aria-label="Čas události"
                  value={noteTime}
                  onChange={(e) => setNoteTime(e.target.value)}
                />
                {isToday && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setNoteTime(nowHm())}>
                    Teď
                  </button>
                )}
                <button className="btn btn-primary" onClick={addNote} disabled={!note.trim()}>
                  Zapsat
                </button>
              </div>
              <p className="hint">
                Čas patří události, ne chvíli zapisování. Pokud ho nevíš, nech ho prázdný.
              </p>
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

                {openField &&
                  (() => {
                    const field = timelineFields.find((f) => f.id === openField);
                    if (!field) return null;
                    return (
                      <div className="stack" style={{ marginTop: 10 }}>
                        <TrackerFieldInput field={field} value={fieldValue} onChange={setFieldValue} />
                        <button
                          className="btn btn-primary btn-block"
                          onClick={() => addFieldEvent(field)}
                          disabled={fieldValue === undefined}
                        >
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
                        <button
                          aria-label={`Smazat záznam ${event.time || ''}`}
                          className="btn btn-sm btn-ghost"
                          onClick={() => removeEvent(event.id)}
                        >
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
      </fieldset>

      {data && !accessBlocked && <AnalysisProgress refreshKey={analysisRefresh} />}

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
          <p className="hint" style={{ marginTop: 10 }}>
            {definition?.disclaimer}
          </p>
        </section>
      )}
    </AppShell>
  );
}
