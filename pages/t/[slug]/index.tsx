import { useEffect, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { TopBar } from '../../../components/AppShell';
import EntryEditor, { emptyEpisode, emptyEvent } from '../../../components/EntryEditor';
import { Msg, Scale } from '../../../components/ui';
import { entryFieldsText, entryLabel } from '../../../lib/format';
import { healthRows } from '../../../lib/health';
import { getTenantBySlug } from '../../../lib/tenant/registry';
import { TenantConfig, scaleMax, scaleMin } from '../../../lib/tenant/types';
import { DayData, Entry, dailyMetrics, entryDef, scales } from '../../../lib/schema';

interface Props {
  config: TenantConfig;
}

type Day = { date: string } & DayData;

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

function EntryCard({
  config,
  entry,
  onSave,
  onDelete,
}: {
  config: TenantConfig;
  entry: Entry;
  onSave: (e: Entry) => Promise<void>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="entry">
        <EntryEditor
          config={config}
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

  const detail = entryFieldsText(config, entry);

  return (
    <div className="entry">
      <div className="entry-head">
        <div style={{ minWidth: 0 }}>
          <span className="entry-time">{entry.time || '--:--'}</span>{' '}
          <span className="entry-cat">{entryLabel(config, entry)}</span>
          {entry.note && <div className="entry-note">{entry.note}</div>}
          {detail && <div className="entry-meta">{detail}</div>}
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

export default function TenantHome({ config }: Props) {
  const slug = config.slug;
  const [date, setDate] = useState('');
  const [day, setDay] = useState<Day | null>(null);
  const [addKind, setAddKind] = useState<{ kind: 'event' | 'episode'; key?: string }>({ kind: 'event' });
  const [draftKey, setDraftKey] = useState(0);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [history, setHistory] = useState<Day[] | null>(null);
  const [loading, setLoading] = useState(false);

  const cfgScales = scales(config);
  const cfgMetrics = dailyMetrics(config);
  const cfgEpisodes = config.episodes ?? [];

  useEffect(() => {
    const t = todayIso();
    setDate(t);
    loadDay(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const say = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
    if (!error) setTimeout(() => setMessage((m) => (m === text ? '' : m)), 2500);
  };

  const api = (path: string, params = '') => `/api/${path}?t=${slug}${params}`;

  const loadDay = async (d: string) => {
    if (!d) return;
    setLoading(true);
    try {
      const res = await fetch(api('notes', `&date=${d}`));
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

  const persist = async (
    patch: { entries?: Entry[]; scales?: Record<string, number>; metrics?: Record<string, number> },
    okMsg: string
  ) => {
    const previous = day;
    // Bez načteného dne bychom uložili prázdný seznam přes existující záznamy.
    if (!previous) {
      say('Den se ještě načítá, zkus to za okamžik.', true);
      return;
    }
    setDay({ ...previous, ...patch });
    try {
      const res = await fetch(api('notes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, ...patch }),
      });
      if (!res.ok) throw new Error('Uložení selhalo.');
      const saved = await res.json();
      setDay((prev) =>
        prev
          ? {
              ...prev,
              ...(saved.entries ? { entries: saved.entries } : {}),
              ...(saved.scales ? { scales: saved.scales } : {}),
              ...(saved.metrics ? { metrics: saved.metrics } : {}),
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
  const dayScales = day?.scales ?? {};
  const dayMetrics = day?.metrics ?? {};

  const addEntry = async (entry: Entry) => {
    await persist({ entries: [...entries, entry] }, 'Záznam uložen.');
    setDraftKey((k) => k + 1);
  };

  const updateEntry = async (entry: Entry) => {
    await persist({ entries: entries.map((e) => (e.id === entry.id ? entry : e)) }, 'Záznam upraven.');
  };

  const deleteEntry = async (entry: Entry) => {
    const label = entryDef(config, entry)?.label ?? 'záznam';
    if (!confirm(`Opravdu smazat ${label.toLowerCase()} v ${entry.time}?`)) return;
    await persist({ entries: entries.filter((e) => e.id !== entry.id) }, 'Smazáno.');
  };

  const setScale = async (key: string, value: number | undefined) => {
    const next = { ...dayScales };
    if (value === undefined) delete next[key];
    else next[key] = value;
    await persist({ scales: next }, 'Uloženo.');
  };

  const setMetric = async (key: string, value: number | undefined) => {
    const next = { ...dayMetrics };
    if (value === undefined || Number.isNaN(value)) delete next[key];
    else next[key] = Math.round(value * 1000) / 1000;
    await persist({ metrics: next }, 'Uloženo.');
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(api('report'));
      if (!res.ok) throw new Error('Nepodařilo se načíst historii.');
      const all: Day[] = await res.json();
      setHistory(all.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err: any) {
      say(err.message, true);
    }
  };

  const rows = healthRows(day?.health, day?.healthUnits);
  const filledScales = cfgScales.filter((s) => dayScales[s.key] !== undefined).length;
  const workouts = day?.workouts ?? [];

  return (
    <div className="page">
      <Head>
        <title>{config.title}</title>
        <meta name="theme-color" content="#f6f2ea" />
      </Head>

      <TopBar
        href={`/t/${slug}`}
        action={
          <button
            className="hdr-btn"
            onClick={async () => {
              await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug }),
              });
              window.location.href = `/t/${slug}/login`;
            }}
          >
            Odhlásit
          </button>
        }
      />

      <div className="wrap">
        <div className="hdr">
          <h1>{config.title}</h1>
          {config.subtitle && <p>{config.subtitle}</p>}
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

      {cfgMetrics.length > 0 && (
        <section className="card">
          <h2>Denní údaje</h2>
          {cfgMetrics.map((m) => {
            const value = dayMetrics[m.key];
            return (
              <div key={m.key} style={{ marginBottom: 12 }}>
                <div className="scale-head">
                  <span className="name">{m.label}</span>
                  <span className="val">{value !== undefined ? `${value} ${m.unit ?? ''}` : m.hint || 'nevyplněno'}</span>
                </div>
                <div className="row">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    step={m.step ?? 1}
                    min={m.min ?? 0}
                    max={m.max}
                    value={value ?? ''}
                    onChange={(e) => setMetric(m.key, e.target.value === '' ? undefined : Number(e.target.value))}
                  />
                  {(m.quickAdd ?? []).map((step) => (
                    <button
                      key={step}
                      className="btn btn-ghost"
                      style={{ flex: '0 0 auto' }}
                      onClick={() => setMetric(m.key, Math.round(((value ?? 0) + step) * 1000) / 1000)}
                    >
                      +{step}
                    </button>
                  ))}
                  {value !== undefined && (
                    <button className="btn btn-ghost" style={{ flex: '0 0 44px' }} onClick={() => setMetric(m.key, undefined)}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {cfgScales.length > 0 && (
        <section className="card">
          <h2>
            Jak ti dnes bylo{' '}
            <span className="count">
              ({filledScales}/{cfgScales.length})
            </span>
          </h2>
          {cfgScales.map((s) => (
            <Scale
              key={s.key}
              label={s.label}
              hint={s.direction === 'higherBetter' ? 'vyšší = lépe' : 'vyšší = hůř'}
              direction={s.direction}
              min={scaleMin(s)}
              max={scaleMax(s)}
              value={dayScales[s.key]}
              onChange={(v) => setScale(s.key, v)}
            />
          ))}
          <p className="hint">Vyplňuj ideálně večer za celý den. Ukládá se hned po kliknutí.</p>
        </section>
      )}

      <section className="card">
        <h2>Přidat záznam</h2>
        {cfgEpisodes.length > 0 && (
          <div className="btns" style={{ marginBottom: 12 }}>
            <button
              className={`btn ${addKind.kind === 'event' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setAddKind({ kind: 'event' });
                setDraftKey((k) => k + 1);
              }}
            >
              Událost
            </button>
            {cfgEpisodes.map((ep) => {
              const active = addKind.kind === 'episode' && addKind.key === ep.key;
              return (
                <button
                  key={ep.key}
                  className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => {
                    setAddKind({ kind: 'episode', key: ep.key });
                    setDraftKey((k) => k + 1);
                  }}
                >
                  {ep.emoji ? `${ep.emoji} ` : ''}
                  {ep.label}
                </button>
              );
            })}
          </div>
        )}
        <EntryEditor
          key={`${addKind.kind}-${addKind.key ?? ''}-${draftKey}-${date}`}
          config={config}
          initial={
            addKind.kind === 'event' ? emptyEvent(config, nowHm()) : emptyEpisode(config, nowHm(), addKind.key)
          }
          submitLabel={addKind.kind === 'event' ? '+ Přidat událost' : '+ Zaznamenat'}
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
          <p className="muted">Zatím nic. Přidej první záznam výš.</p>
        ) : (
          entries.map((entry) => (
            <EntryCard
              key={entry.id}
              config={config}
              entry={entry}
              onSave={updateEntry}
              onDelete={() => deleteEntry(entry)}
            />
          ))
        )}
      </section>

      {config.modules?.health !== false && (
        <section className="card">
          <h2>
            Apple Health <span className="count">({rows.length} metrik)</span>
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
      )}

      <section className="card">
        <h2>Data a export</h2>
        <div className="stack">
          {config.modules?.export !== false && (
            <>
              <a className="btn btn-accent btn-block" href={api('export')} download>
                Stáhnout vše pro AI analýzu (.md)
              </a>
              <a className="btn btn-ghost btn-block" href={api('export', '&preview=1')} target="_blank" rel="noreferrer">
                Náhled exportu
              </a>
            </>
          )}
          {config.modules?.labs !== false && (
            <Link className="btn btn-ghost btn-block" href={`/t/${slug}/labs`}>
              Laboratorní výsledky
            </Link>
          )}
          {config.modules?.history !== false && (
            <button className="btn btn-ghost btn-block" onClick={() => (history ? setHistory(null) : loadHistory())}>
              {history ? 'Skrýt historii' : 'Historie dnů'}
            </button>
          )}
        </div>

        {history && (
          <div style={{ marginTop: 12 }}>
            {history.length === 0 && <p className="muted">Zatím žádné dny.</p>}
            {history.slice(0, 60).map((d) => {
              const eps = (d.entries ?? []).filter((e) => e.kind === 'episode').length;
              const evs = (d.entries ?? []).length - eps;
              const parts = cfgScales
                .filter((s) => d.scales?.[s.key] !== undefined)
                .slice(0, 3)
                .map((s) => `${s.label} ${d.scales[s.key]}`);
              return (
                <div className="hist" key={d.date} onClick={() => goToDate(d.date)}>
                  <div>
                    <div className="d">
                      {d.date} {eps > 0 && <span className="pill warn">epizoda {eps}×</span>}
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
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug ?? '');
  const config = getTenantBySlug(slug);
  if (!config) return { notFound: true };
  return { props: { config } };
};
