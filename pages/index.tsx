import { useEffect, useState } from 'react';
import Link from 'next/link';
import EntryEditor, { emptyEvent, emptyWeakness } from '../components/EntryEditor';
import { Msg, Scale } from '../components/ui';
import { eventFieldsText, weaknessLine } from '../lib/format';
import { healthRows } from '../lib/health';
import {
  CATEGORY_BY_KEY,
  DAILY_SCALES,
  DayDoc,
  Entry,
  EventEntry,
  SCALE_MAX,
  WeaknessEntry,
} from '../lib/schema';

const WEAKNESS_COLOR = '#be123c';

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

/** Jeden záznam v časové ose dne – zobrazení nebo inline editace. */
function EntryCard({
  entry,
  onSave,
  onDelete,
}: {
  entry: Entry;
  onSave: (e: Entry) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const weakness = entry.type === 'weakness';
  const category = weakness ? undefined : CATEGORY_BY_KEY[(entry as EventEntry).category];
  const color = weakness ? WEAKNESS_COLOR : category?.color ?? '#6b7280';

  if (editing) {
    return (
      <div className="entry" style={{ borderLeftColor: color, background: '#fff' }}>
        <EntryEditor
          initial={entry}
          submitLabel="Uložit změny"
          onCancel={() => setEditing(false)}
          onSave={async (e) => {
            await onSave(e);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  const detail = weakness ? weaknessLine(entry as WeaknessEntry) : eventFieldsText(entry as EventEntry);

  return (
    <div className="entry" style={{ borderLeftColor: color }}>
      <div className="entry-head">
        <div style={{ minWidth: 0 }}>
          <span className="entry-time">{entry.time || '--:--'}</span>{' '}
          <span className="entry-cat" style={{ color }}>
            {weakness ? '🚨 Epizoda slabosti' : `${category?.emoji ?? ''} ${category?.label ?? ''}`}
          </span>
          {weakness && (entry as WeaknessEntry).severity !== undefined && (
            <span className="tag" style={{ background: '#fee2e2', color: WEAKNESS_COLOR }}>
              {(entry as WeaknessEntry).severity}/{SCALE_MAX}
            </span>
          )}
          {weakness ? (
            <>
              {detail && <div className="entry-meta">{detail}</div>}
              {entry.note && <div className="entry-note">{entry.note}</div>}
            </>
          ) : (
            <>
              {entry.note && <div className="entry-note">{entry.note}</div>}
              {detail && <div className="entry-meta">{detail}</div>}
            </>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
            Upravit
          </button>
          <button className="btn btn-sm btn-danger" onClick={onDelete}>
            Smazat
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [date, setDate] = useState('');
  const [day, setDay] = useState<DayDoc | null>(null);
  const [addType, setAddType] = useState<'event' | 'weakness'>('event');
  const [draftKey, setDraftKey] = useState(0);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [history, setHistory] = useState<DayDoc[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = todayIso();
    setDate(t);
    loadDay(t);
  }, []);

  const say = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
    if (!error) setTimeout(() => setMessage((m) => (m === text ? '' : m)), 2500);
  };

  const loadDay = async (d: string) => {
    if (!d) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notes?date=${d}`);
      if (!res.ok) throw new Error('Nepodařilo se načíst den.');
      setDay(await res.json());
    } catch (err: any) {
      say(err.message, true);
    } finally {
      setLoading(false);
    }
  };

  const goToDate = (d: string) => {
    setDate(d);
    setDay(null);
    loadDay(d);
  };

  const persist = async (patch: { entries?: Entry[]; scales?: Record<string, number> }, okMsg: string) => {
    const previous = day;
    // Bez načteného dne bychom uložili prázdný seznam přes existující záznamy.
    if (!previous) {
      say('Den se ještě načítá, zkus to za okamžik.', true);
      return;
    }
    setDay((prev) => (prev ? { ...prev, ...patch } : prev));
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ...patch }),
      });
      if (!res.ok) throw new Error('Uložení selhalo.');
      const saved = await res.json();
      // Server normalizuje hodnoty (ořeže rozsahy, seřadí podle času) – vezmeme jeho verzi.
      setDay((prev) =>
        prev
          ? {
              ...prev,
              ...(saved.entries ? { entries: saved.entries } : {}),
              ...(saved.scales ? { scales: saved.scales } : {}),
            }
          : prev
      );
      say(okMsg);
    } catch (err: any) {
      setDay(previous);
      say(err.message, true);
    }
  };

  const entries = day?.entries ?? [];
  const scales = day?.scales ?? {};

  const addEntry = async (entry: Entry) => {
    await persist({ entries: [...entries, entry] }, 'Záznam uložen.');
    setDraftKey((k) => k + 1);
  };

  const updateEntry = async (entry: Entry) => {
    await persist({ entries: entries.map((e) => (e.id === entry.id ? entry : e)) }, 'Záznam upraven.');
  };

  const deleteEntry = async (entry: Entry) => {
    const label = entry.type === 'weakness' ? 'epizodu slabosti' : `záznam „${entry.note?.slice(0, 40) || entry.time}“`;
    if (!confirm(`Opravdu smazat ${label}?`)) return;
    await persist({ entries: entries.filter((e) => e.id !== entry.id) }, 'Smazáno.');
  };

  const setScale = async (key: string, value: number | undefined) => {
    const next = { ...scales };
    if (value === undefined) delete next[key];
    else next[key] = value;
    await persist({ scales: next }, 'Škály uloženy.');
  };

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/report');
      if (!res.ok) throw new Error('Nepodařilo se načíst historii.');
      const all: DayDoc[] = await res.json();
      setHistory(all.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err: any) {
      say(err.message, true);
    }
  };

  const rows = healthRows(day?.health, day?.healthUnits);
  const filledScales = DAILY_SCALES.filter((s) => scales[s.key] !== undefined).length;
  const workouts = day?.workouts ?? [];

  return (
    <div className="page">
      <div className="hdr">
        <button
          className="hdr-btn right"
          onClick={async () => {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/login';
          }}
        >
          Odhlásit
        </button>
        <h1>Zdravotní deník</h1>
        <p>Příznaky, události a data z Apple Health na jednom místě</p>
      </div>

      <section className="card">
        <div className="row">
          <button className="btn btn-ghost" style={{ flex: '0 0 44px' }} onClick={() => goToDate(shiftDate(date, -1))}>
            ‹
          </button>
          <input className="input" type="date" value={date} onChange={(e) => goToDate(e.target.value)} />
          <button
            className="btn btn-ghost"
            style={{ flex: '0 0 44px' }}
            disabled={date >= todayIso()}
            onClick={() => goToDate(shiftDate(date, 1))}
          >
            ›
          </button>
        </div>
        {date !== todayIso() && (
          <button className="btn btn-ghost btn-block btn-sm" style={{ marginTop: 8 }} onClick={() => goToDate(todayIso())}>
            Zpět na dnešek
          </button>
        )}
      </section>

      <section className="card">
        <h2>
          Jak ti dnes bylo <span className="count">({filledScales}/{DAILY_SCALES.length})</span>
        </h2>
        {DAILY_SCALES.map((s) => (
          <Scale
            key={s.key}
            label={s.label}
            hint={s.direction === 'higherBetter' ? 'vyšší = lépe' : 'vyšší = hůř'}
            direction={s.direction}
            value={scales[s.key]}
            onChange={(v) => setScale(s.key, v)}
          />
        ))}
        <p className="hint">Vyplňuj ideálně večer za celý den. Ukládá se hned po kliknutí.</p>
      </section>

      <section className="card">
        <h2>Přidat záznam</h2>
        <div className="btns" style={{ marginBottom: 12 }}>
          <button
            className={`btn ${addType === 'event' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setAddType('event');
              setDraftKey((k) => k + 1);
            }}
          >
            Událost
          </button>
          <button
            className="btn"
            style={
              addType === 'weakness'
                ? { background: WEAKNESS_COLOR, color: '#fff' }
                : { background: '#fff', border: '1px solid var(--line)', color: WEAKNESS_COLOR }
            }
            onClick={() => {
              setAddType('weakness');
              setDraftKey((k) => k + 1);
            }}
          >
            🚨 Epizoda slabosti
          </button>
        </div>
        <EntryEditor
          key={`${addType}-${draftKey}-${date}`}
          initial={addType === 'event' ? emptyEvent(nowHm()) : emptyWeakness(nowHm())}
          submitLabel={addType === 'event' ? '+ Přidat událost' : '+ Zaznamenat epizodu'}
          onSave={addEntry}
        />
        <Msg text={message} error={isError} />
      </section>

      <section className="card">
        <h2>
          Záznamy dne <span className="count">({entries.length})</span>
        </h2>
        {loading && !day ? (
          <p className="muted">Načítám…</p>
        ) : entries.length === 0 ? (
          <p className="muted">Zatím nic. Přidej první záznam výš. 👆</p>
        ) : (
          entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onSave={updateEntry} onDelete={() => deleteEntry(entry)} />
          ))
        )}
      </section>

      <section className="card">
        <h2>
          ⌚ Apple Health <span className="count">({rows.length} metrik)</span>
        </h2>
        {rows.length === 0 ? (
          <p className="muted">Pro tento den zatím nedorazila žádná data.</p>
        ) : (
          <div className="grid2">
            {rows.map((r) => (
              <div className="stat" key={r.key}>
                <div className="k">{r.label}</div>
                <div className="v">{r.value}</div>
              </div>
            ))}
          </div>
        )}
        {workouts.length > 0 && (
          <>
            <hr className="divider" />
            <div className="label">Tréninky z hodinek</div>
            {workouts.map((w, i) => (
              <div className="entry-meta" key={i}>
                <strong>{w.name}</strong>
                {w.start ? ` · ${w.start}${w.end ? `–${w.end}` : ''}` : ''}
                {w.durationMin !== undefined ? ` · ${w.durationMin} min` : ''}
                {w.energyKcal !== undefined ? ` · ${w.energyKcal} kcal` : ''}
                {w.heartRateAvg !== undefined ? ` · tep ⌀ ${w.heartRateAvg}` : ''}
              </div>
            ))}
          </>
        )}
      </section>

      <section className="card">
        <h2>Data a export</h2>
        <div className="stack">
          <a className="btn btn-accent btn-block" href="/api/export" download>
            📥 Stáhnout vše pro AI analýzu (.md)
          </a>
          <a className="btn btn-ghost btn-block" href="/api/export?preview=1" target="_blank" rel="noreferrer">
            👁 Náhled exportu
          </a>
          <Link className="btn btn-block" href="/labs" style={{ background: '#be123c', color: '#fff' }}>
            🩸 Laboratorní výsledky
          </Link>
          <button className="btn btn-ghost btn-block" onClick={() => (history ? setHistory(null) : loadHistory())}>
            {history ? 'Skrýt historii' : '📅 Historie dnů'}
          </button>
        </div>
        <p className="hint">
          Export obsahuje zadání pro AI, legendu, CSV tabulky i denní zápisy – stačí ho vložit do konverzace a nechat
          hledat souvislosti s posunem 0–14 dní.
        </p>

        {history && (
          <div style={{ marginTop: 12 }}>
            {history.length === 0 && <p className="muted">Zatím žádné dny.</p>}
            {history.slice(0, 60).map((d) => {
              const eps = (d.entries ?? []).filter((e) => e.type === 'weakness').length;
              const evs = (d.entries ?? []).length - eps;
              const parts = DAILY_SCALES.filter((s) => d.scales?.[s.key] !== undefined)
                .slice(0, 3)
                .map((s) => `${s.label} ${d.scales[s.key]}`);
              return (
                <div className="hist" key={d.date} onClick={() => goToDate(d.date)}>
                  <div>
                    <div className="d">
                      {d.date} {eps > 0 && <span className="pill warn">slabost {eps}×</span>}
                    </div>
                    <div className="s">
                      {parts.length ? parts.join(' · ') : 'škály nevyplněné'} · {evs} událostí
                    </div>
                  </div>
                  <span className="btn btn-sm btn-ghost">Otevřít</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
