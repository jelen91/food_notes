import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell, { Disclaimer } from '../../components/AppShell';
import { Msg } from '../../components/ui';
import type { TrackerDefinition } from '../../lib/tracker/schema';
import { pollTracker } from '../../lib/tracker/poll';

interface Status {
  status: 'not_started' | 'queued' | 'generating' | 'completed' | 'failed' | 'unavailable';
  error: string | null;
  retryCount: number;
  submitted: boolean;
  versions: Array<{ version: number; active: boolean; createdAt: string }>;
  tracker: { version: number; createdAt: string; definition: TrackerDefinition } | null;
}

async function readStatus(): Promise<Status> {
  const res = await fetch('/api/tracker');
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    return {
      status: 'unavailable',
      error: body.error || 'Přístup k deníku není aktivní.',
      retryCount: 0,
      submitted: false,
      versions: [],
      tracker: null,
    };
  }
  if (!res.ok) throw new Error('Stav deníku se nepodařilo načíst.');
  return res.json();
}

const TYP_POLE: Record<string, string> = {
  boolean: 'ano/ne',
  number: 'číslo',
  scale: 'škála',
  short_text: 'krátký text',
  long_text: 'delší text',
  single_select: 'výběr',
  multi_select: 'více voleb',
  date: 'datum',
  time: 'čas',
  duration: 'délka',
  meal: 'jídlo',
  sleep: 'spánek',
  exercise: 'pohyb',
  symptom: 'symptom',
  stool_bristol: 'stolice (Bristol)',
  medication_or_supplement: 'lék/doplněk',
  custom_observation: 'vlastní pozorování',
};

export default function Tracker() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [pollFailed, setPollFailed] = useState(false);
  const started = useRef(false);

  const load = async (): Promise<Status | null> => {
    const data = await readStatus();
    setStatus(data);
    return data;
  };

  const generate = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(data.error || 'Sestavení se nepodařilo.');
      await load();
    } catch {
      setMessage('Síťová chyba. Zkus to prosím znovu.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await load();
        // New submissions start once. Reloading a running job only reads its status.
        if (data && data.submitted && data.status === 'not_started' && !started.current) {
          started.current = true;
          generate();
        }
      } catch {
        setPollFailed(true);
        setMessage('Stav deníku se nepodařilo načíst. Zkus kontrolu znovu.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (busy || (status?.status !== 'queued' && status?.status !== 'generating')) return;
    return pollTracker({
      read: readStatus,
      onUpdate: (data) => {
        setStatus(data);
        setPollFailed(false);
      },
      onError: () => {
        setPollFailed(true);
        setMessage('Spojení se přerušilo. Zkontroluj stav znovu; nové sestavení se tím nespustí.');
      },
    });
  }, [status?.status, busy, pollAttempt]);

  const retryStatus = async () => {
    setMessage('');
    try {
      await load();
      setPollFailed(false);
      setPollAttempt((attempt) => attempt + 1);
    } catch {
      setPollFailed(true);
      setMessage('Stav deníku se nepodařilo načíst. Zkus kontrolu znovu.');
    }
  };

  const definition = status?.tracker?.definition;
  const dailyFields =
    definition?.sections.filter((section) => section.kind === 'daily').flatMap((section) => section.fields) ??
    [];
  const mainFields = dailyFields.filter((field) => field.required);
  const contextFields = dailyFields.filter((field) => !field.required);
  const eventFields =
    definition?.sections
      .filter((section) => section.kind === 'timeline')
      .flatMap((section) => section.fields) ?? [];

  return (
    <AppShell title="Tvůj deník">
      <section className="card">
        {!status && <p className="muted">Načítám…</p>}
        {status?.status === 'unavailable' && (
          <>
            <h2>Přístup k deníku není aktivní</h2>
            <p className="muted">{status.error}</p>
            <Link className="btn btn-primary btn-block" href="/app/ucet">
              Zobrazit účet a dostupný export
            </Link>
          </>
        )}

        {status && (status.status === 'queued' || status.status === 'generating' || busy) && (
          <>
            <h2>AI připravuje tvůj plán pozorování</h2>
            <p className="muted">
              Z tvých odpovědí vybíráme, co bude užitečné pravidelně sledovat a porovnávat. Návrh přizpůsobíme
              tvému času a zkontrolujeme jeho rozsah i úplnost.
            </p>
            <p className="hint">
              Sestavení může trvat několik minut. Stránku není potřeba obnovovat; stav se aktualizuje
              automaticky.
            </p>
          </>
        )}

        {status && status.status === 'failed' && !busy && (
          <>
            <h2>Sestavení se nepovedlo</h2>
            <p className="muted">{status.error || 'Zkus to prosím znovu.'}</p>
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 12 }}
              onClick={generate}
              disabled={busy}
            >
              Zkusit znovu
            </button>
            {status.retryCount >= 3 && (
              <p className="hint">
                Pokud to nepůjde ani teď, zkus upravit odpovědi v <Link href="/dotaznik">dotazníku</Link>.
              </p>
            )}
          </>
        )}

        {status && status.status === 'not_started' && !status.submitted && !busy && (
          <>
            <h2>Nejdřív dotazník</h2>
            <p className="muted">
              Popiš, co tě trápí a kolik času chceš zápisu věnovat. AI vybere hlavní ukazatel i související
              okolnosti a sestaví z nich deník na míru.
            </p>
            <Link className="btn btn-primary btn-block" style={{ marginTop: 12 }} href="/dotaznik">
              Vyplnit dotazník
            </Link>
          </>
        )}

        {status?.status === 'not_started' && status.submitted && !busy && (
          <button className="btn btn-primary btn-block" onClick={generate}>
            Sestavit deník z odpovědí
          </button>
        )}

        {status && status.status === 'completed' && definition && (
          <>
            <h2>{definition.title}</h2>
            <p className="muted">{definition.description}</p>
            {definition.estimatedDailyMinutes && (
              <p className="hint">
                Přibližně {definition.estimatedDailyMinutes} min denně · {dailyFields.length} denních údajů
              </p>
            )}
            <Link className="btn btn-primary btn-block" style={{ marginTop: 14 }} href="/app/denik">
              Otevřít deník a zapsat první den
            </Link>
          </>
        )}

        <Msg text={message} error />
        {pollFailed && (
          <button className="btn btn-ghost btn-block" onClick={retryStatus}>
            Zkontrolovat stav znovu
          </button>
        )}
      </section>

      {definition && (
        <>
          <section className="card">
            <h2>Proč má tvůj deník právě tyto údaje</h2>
            {mainFields.length > 0 && (
              <p>
                <strong>Základ pro srovnání dní:</strong> {mainFields.map((field) => field.label).join(', ')}.
                Zapisuj je i ve dnech, kdy se cítíš dobře.
              </p>
            )}
            {contextFields.length > 0 && (
              <p>
                <strong>Souvislosti doplní:</strong> {contextFields.map((field) => field.label).join(', ')}.
                Pravidelný kontext umožní porovnat, co provází lepší a horší dny.
              </p>
            )}
            {eventFields.length > 0 && (
              <p>
                <strong>V průběhu dne:</strong> {eventFields.map((field) => field.label).join(', ')}. Čas
                výskytu pomůže zachovat pořadí událostí.
              </p>
            )}
            <p className="hint">
              Více relevantních záznamů může odhalit více opakování. Nejdůležitější jsou srovnatelné údaje a
              pravidelnost; vynechaný údaj se nepočítá jako nula nebo den bez potíží.
            </p>
          </section>

          <section className="card">
            <h2>Tvůj cíl: z vlastních dat získat směr</h2>
            <p>
              Po alespoň 21 dnech od zaplacení a 21 vyplněných dnech se zpřístupní jeden AI rozbor v ceně.
              Nemusí jít o dny za sebou.
            </p>
            <p className="muted">
              Rozbor shrne průběh, upozorní na opakující se souvislosti a navrhne, co má smysl dál pozorovat
              nebo probrat s odborníkem. Ukáže také, co zatím z dat říct nejde.
            </p>
            <p className="hint">
              Tři týdny jsou začátek pozorování, ne záruka nalezení příčiny. Zapisuj co nejdříve, denní
              hodnocení přibližně ve stejnou dobu a neznámé údaje nedoplňuj odhadem.
            </p>
          </section>

          {[...definition.sections]
            .sort((a, b) => a.order - b.order)
            .map((section) => (
              <section className="card" key={section.id}>
                <h2>
                  {section.title}{' '}
                  <span className="count">
                    ({section.kind === 'daily' ? 'jednou denně' : 'v průběhu dne'})
                  </span>
                </h2>
                {section.description && (
                  <p className="hint" style={{ marginTop: -4 }}>
                    {section.description}
                  </p>
                )}
                <div style={{ marginTop: 10 }}>
                  {[...section.fields]
                    .sort((a, b) => a.order - b.order)
                    .map((f) => (
                      <div className="lab-val" key={f.id} style={{ display: 'block' }}>
                        <div>
                          <strong>{f.label}</strong>
                          {f.required && (
                            <span className="pill warn" style={{ marginLeft: 6 }}>
                              povinné
                            </span>
                          )}
                          <span className="count" style={{ marginLeft: 6 }}>
                            {TYP_POLE[f.type] ?? f.type}
                            {f.unit ? ` · ${f.unit}` : ''}
                            {f.type === 'scale' ? ` · ${f.min}–${f.max}` : ''}
                          </span>
                        </div>
                        {f.description && (
                          <div className="hint" style={{ marginTop: 2 }}>
                            {f.description}
                          </div>
                        )}
                        {f.options && (
                          <div className="hint" style={{ marginTop: 2 }}>
                            Volby: {f.options.map((o) => o.label).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </section>
            ))}

          <section className="card">
            <p className="hint">{definition.disclaimer}</p>
            <hr className="divider" />
            <Disclaimer />
            <div className="btns" style={{ marginTop: 12 }}>
              <Link className="btn btn-primary" href="/app/denik">
                Otevřít deník
              </Link>
              <Link className="btn btn-ghost" href="/app">
                Účet
              </Link>
              <button className="btn btn-ghost" onClick={generate} disabled={busy}>
                Sestavit znovu
              </button>
            </div>
            <p className="hint" style={{ marginTop: 12 }}>
              Nový návrh využije odpovědi z dotazníku. Dosavadní zápisy zůstanou uložené; pro srovnání dní je
              ale užitečné držet stejné údaje a škály.
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
