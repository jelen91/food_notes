import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell, { Disclaimer } from '../../components/AppShell';
import { Msg } from '../../components/ui';
import type { TrackerDefinition } from '../../lib/tracker/schema';

interface Status {
  status: 'not_started' | 'queued' | 'generating' | 'completed' | 'failed';
  error: string | null;
  retryCount: number;
  submitted: boolean;
  versions: Array<{ version: number; active: boolean; createdAt: string }>;
  tracker: { version: number; createdAt: string; definition: TrackerDefinition } | null;
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
  const started = useRef(false);

  const load = async (): Promise<Status | null> => {
    const res = await fetch('/api/tracker');
    if (!res.ok) return null;
    const data: Status = await res.json();
    setStatus(data);
    return data;
  };

  const generate = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/tracker', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
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
      const data = await load();
      // Po odeslání dotazníku spustíme sestavení samo, ale jen jednou za návštěvu.
      if (data && data.submitted && data.status === 'not_started' && !started.current) {
        started.current = true;
        generate();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const definition = status?.tracker?.definition;

  return (
    <AppShell title="Tvůj deník">
      <section className="card">
        {!status && <p className="muted">Načítám…</p>}

        {status && (status.status === 'queued' || status.status === 'generating' || busy) && (
          <>
            <h2>Připravujeme tvůj deník</h2>
            <p className="muted">
              Zaplaceno máš, teď z tvých odpovědí skládáme deník na míru. Obvykle to trvá necelou
              minutu — stránku není potřeba obnovovat.
            </p>
          </>
        )}

        {status && status.status === 'failed' && !busy && (
          <>
            <h2>Sestavení se nepovedlo</h2>
            <p className="muted">{status.error || 'Zkus to prosím znovu.'}</p>
            <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={generate} disabled={busy}>
              Zkusit znovu
            </button>
            {status.retryCount >= 3 && (
              <p className="hint">Pokud to nepůjde ani teď, zkus upravit odpovědi v <Link href="/dotaznik">dotazníku</Link>.</p>
            )}
          </>
        )}

        {status && status.status === 'not_started' && !status.submitted && !busy && (
          <>
            <h2>Nejdřív dotazník</h2>
            <p className="muted">Deník sestavíme podle tvých odpovědí.</p>
            <Link className="btn btn-primary btn-block" style={{ marginTop: 12 }} href="/dotaznik">
              Vyplnit dotazník
            </Link>
          </>
        )}

        {status && status.status === 'completed' && definition && (
          <>
            <h2>{definition.title}</h2>
            <p className="muted">{definition.description}</p>
            {definition.estimatedDailyMinutes && (
              <p className="hint">Odhadovaná doba zápisu: {definition.estimatedDailyMinutes} min denně · verze {status.tracker?.version}</p>
            )}
            <Link className="btn btn-primary btn-block" style={{ marginTop: 14 }} href="/app/denik">
              Otevřít deník a zapsat první den
            </Link>
          </>
        )}

        <Msg text={message} error />
      </section>

      {definition && (
        <>
          {[...definition.sections]
            .sort((a, b) => a.order - b.order)
            .map((section) => (
              <section className="card" key={section.id}>
                <h2>
                  {section.title}{' '}
                  <span className="count">({section.kind === 'daily' ? 'jednou denně' : 'v průběhu dne'})</span>
                </h2>
                {section.description && <p className="hint" style={{ marginTop: -4 }}>{section.description}</p>}
                <div style={{ marginTop: 10 }}>
                  {[...section.fields]
                    .sort((a, b) => a.order - b.order)
                    .map((f) => (
                      <div className="lab-val" key={f.id} style={{ display: 'block' }}>
                        <div>
                          <strong>{f.label}</strong>
                          {f.required && <span className="pill warn" style={{ marginLeft: 6 }}>povinné</span>}
                          <span className="count" style={{ marginLeft: 6 }}>
                            {TYP_POLE[f.type] ?? f.type}
                            {f.unit ? ` · ${f.unit}` : ''}
                            {f.type === 'scale' ? ` · ${f.min}–${f.max}` : ''}
                          </span>
                        </div>
                        {f.description && <div className="hint" style={{ marginTop: 2 }}>{f.description}</div>}
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
          </section>
        </>
      )}
    </AppShell>
  );
}
