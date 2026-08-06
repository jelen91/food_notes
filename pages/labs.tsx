import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Field, Msg } from '../components/ui';
import { parseLabLines } from '../lib/labParse';
import { LabDoc, LabMeta, LabValue, labFlag } from '../lib/schema';

const emptyRow = (): LabValue => ({ name: '', value: '' });

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function LabsPage() {
  const [labs, setLabs] = useState<LabDoc[]>([]);
  const [date, setDate] = useState(todayIso());
  const [meta, setMeta] = useState<LabMeta>({});
  const [values, setValues] = useState<LabValue[]>([emptyRow()]);
  const [bulk, setBulk] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [existingPdf, setExistingPdf] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  const say = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  const loadLabs = async () => {
    try {
      const res = await fetch('/api/labs');
      if (!res.ok) throw new Error('Nepodařilo se načíst seznam.');
      setLabs(await res.json());
    } catch (err: any) {
      say(err.message, true);
    }
  };

  useEffect(() => {
    loadLabs();
  }, []);

  const resetForm = (d = todayIso()) => {
    setDate(d);
    setMeta({});
    setValues([emptyRow()]);
    setBulk('');
    setFile(null);
    setExistingPdf(null);
    const input = document.getElementById('lab-file') as HTMLInputElement | null;
    if (input) input.value = '';
  };

  /** Načte existující odběr do formuláře k doplnění/opravě. */
  const editLab = (lab: LabDoc) => {
    setDate(lab.date);
    setMeta(lab.meta ?? {});
    setValues(lab.values?.length ? lab.values : [emptyRow()]);
    setExistingPdf(lab.filename ?? null);
    setFile(null);
    setBulk('');
    say(`Načten odběr z ${lab.date} – uprav a ulož.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setValue = (i: number, patch: Partial<LabValue>) => {
    setValues((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const applyBulk = () => {
    const parsed = parseLabLines(bulk);
    if (!parsed.length) {
      say('Z textu se nepodařilo nic přečíst. Zkus formát „Ferritin 45 ug/l (30-400)“.', true);
      return;
    }
    const existing = values.filter((v) => v.name.trim());
    setValues([...existing, ...parsed, emptyRow()]);
    setBulk('');
    say(`Načteno ${parsed.length} hodnot – zkontroluj je prosím.`);
  };

  const readBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Nepodařilo se přečíst soubor.'));
      reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
      reader.readAsDataURL(f);
    });

  const save = async () => {
    const clean = values.filter((v) => v.name.trim() && String(v.value).trim() !== '');
    if (!date) {
      say('Vyplň datum odběru.', true);
      return;
    }
    if (!clean.length && !file) {
      say('Vyplň aspoň jednu hodnotu nebo nahraj PDF.', true);
      return;
    }
    if (file && file.size > 4 * 1024 * 1024) {
      say('PDF je moc velké (max ~4 MB).', true);
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { date, meta, values: clean };
      if (file) {
        body.filename = file.name;
        body.contentType = file.type || 'application/pdf';
        body.contentBase64 = await readBase64(file);
      }
      const res = await fetch('/api/labs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Uložení selhalo.');
      }
      say('Uloženo.');
      resetForm(date);
      await loadLabs();
    } catch (err: any) {
      say(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d: string) => {
    if (!confirm(`Smazat celý odběr z ${d} (hodnoty i PDF)?`)) return;
    try {
      const res = await fetch(`/api/labs?date=${encodeURIComponent(d)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Smazání selhalo.');
      say('Smazáno.');
      await loadLabs();
    } catch (err: any) {
      say(err.message, true);
    }
  };

  return (
    <div className="page">
      <div className="hdr" style={{ background: 'linear-gradient(135deg, #be123c, #9f1239)' }}>
        <Link className="hdr-btn left" href="/">
          ← Zpět
        </Link>
        <h1>🩸 Laboratoře</h1>
        <p>Výsledky, metadata odběru a původní PDF</p>
      </div>

      <section className="card">
        <h2>Nový / upravit odběr</h2>
        <div className="stack">
          <div className="row">
            <Field label="Datum odběru">
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Čas odběru">
              <input
                className="input"
                type="time"
                value={meta.time ?? ''}
                onChange={(e) => setMeta({ ...meta, time: e.target.value })}
              />
            </Field>
          </div>

          <div className="chips">
            <button
              type="button"
              className={`chip plain${meta.fasting === true ? ' active' : ''}`}
              onClick={() => setMeta({ ...meta, fasting: meta.fasting === true ? undefined : true })}
            >
              Nalačno
            </button>
            <button
              type="button"
              className={`chip plain${meta.fasting === false ? ' active' : ''}`}
              onClick={() => setMeta({ ...meta, fasting: meta.fasting === false ? undefined : false })}
            >
              Po jídle
            </button>
          </div>

          <div className="row">
            <Field label="Laboratoř">
              <input
                className="input"
                placeholder="např. Synlab"
                value={meta.lab ?? ''}
                onChange={(e) => setMeta({ ...meta, lab: e.target.value })}
              />
            </Field>
            <Field label="Důvod odběru">
              <input
                className="input"
                placeholder="preventivní, kontrola…"
                value={meta.reason ?? ''}
                onChange={(e) => setMeta({ ...meta, reason: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Kontext odběru">
            <input
              className="input"
              placeholder="např. druhý den po tréninku, týden po nemoci"
              value={meta.context ?? ''}
              onChange={(e) => setMeta({ ...meta, context: e.target.value })}
            />
          </Field>

          <Field label="Léky a doplňky v době odběru">
            <input
              className="input"
              placeholder="co jsi v té době bral"
              value={meta.medication ?? ''}
              onChange={(e) => setMeta({ ...meta, medication: e.target.value })}
            />
          </Field>

          <Field label="Poznámka">
            <textarea
              className="textarea"
              rows={2}
              value={meta.note ?? ''}
              onChange={(e) => setMeta({ ...meta, note: e.target.value })}
            />
          </Field>
        </div>

        <hr className="divider" />

        <div className="label">Naměřené hodnoty</div>
        {values.map((v, i) => {
          const flag = labFlag(v);
          return (
            <div key={i} style={{ marginBottom: 8 }}>
              <div className="row">
                <input
                  className="input"
                  style={{ flex: 2 }}
                  placeholder="Analyt (Ferritin…)"
                  value={v.name}
                  onChange={(e) => setValue(i, { name: e.target.value })}
                />
                <input
                  className="input"
                  style={{ flex: 1 }}
                  inputMode="decimal"
                  placeholder="Hodnota"
                  value={String(v.value ?? '')}
                  onChange={(e) => setValue(i, { value: e.target.value })}
                />
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <input
                  className="input"
                  placeholder="Jednotka"
                  value={v.unit ?? ''}
                  onChange={(e) => setValue(i, { unit: e.target.value })}
                />
                {/* Reference držíme jako text, ať jde napsat i „0.27“; číslo z toho udělá server. */}
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="Ref. od"
                  value={v.refLow ?? ''}
                  onChange={(e) => setValue(i, { refLow: (e.target.value || undefined) as any })}
                />
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="Ref. do"
                  value={v.refHigh ?? ''}
                  onChange={(e) => setValue(i, { refHigh: (e.target.value || undefined) as any })}
                />
                <button
                  className="btn btn-ghost"
                  style={{ flex: '0 0 44px' }}
                  onClick={() => setValues((rows) => (rows.length === 1 ? [emptyRow()] : rows.filter((_, idx) => idx !== i)))}
                  title="Odebrat řádek"
                >
                  ×
                </button>
              </div>
              {flag && flag !== 'ok' && (
                <div className="hint" style={{ color: flag === 'low' ? '#1d4ed8' : '#dc2626' }}>
                  {flag === 'low' ? 'pod referenčním rozmezím' : 'nad referenčním rozmezím'}
                </div>
              )}
            </div>
          );
        })}
        <button className="btn btn-ghost btn-sm" onClick={() => setValues([...values, emptyRow()])}>
          + Další hodnota
        </button>

        <hr className="divider" />

        <Field label="Hromadné vložení (nakopíruj řádky z výsledků)">
          <textarea
            className="textarea"
            rows={4}
            placeholder={'Ferritin 45 ug/l (30-400)\nHemoglobin: 148 g/l 135-175\nTSH 2,1 mIU/l'}
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
          />
        </Field>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={applyBulk} disabled={!bulk.trim()}>
          Načíst z textu
        </button>

        <hr className="divider" />

        <Field label="PDF s výsledky (volitelné)">
          <input
            id="lab-file"
            className="input"
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        {existingPdf && !file && <p className="hint">Uložené PDF: {existingPdf} (zůstane zachované)</p>}

        <div className="btns" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Ukládám…' : 'Uložit odběr'}
          </button>
          <button className="btn btn-ghost" onClick={() => resetForm()} disabled={busy}>
            Vyprázdnit
          </button>
        </div>
        <Msg text={message} error={isError} />
        <p className="hint">Odběr se ukládá podle data – stejné datum přepíše předchozí zápis.</p>
      </section>

      <section className="card">
        <h2>
          Archiv <span className="count">({labs.length})</span>
        </h2>
        {labs.length === 0 ? (
          <p className="muted">Zatím nic uloženého.</p>
        ) : (
          labs.map((lab) => (
            <div key={lab.date} style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#be123c' }}>{lab.date}</div>
                  <div className="s" style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
                    {[
                      lab.meta?.time,
                      lab.meta?.fasting === undefined ? '' : lab.meta.fasting ? 'nalačno' : 'po jídle',
                      lab.meta?.lab,
                      lab.meta?.context,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'bez metadat'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => editLab(lab)}>
                    Upravit
                  </button>
                  {lab.filename && (
                    <a className="btn btn-sm btn-ghost" href={`/api/labs?date=${encodeURIComponent(lab.date)}&download=1`}>
                      PDF {formatSize(lab.size)}
                    </a>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => remove(lab.date)}>
                    Smazat
                  </button>
                </div>
              </div>

              {lab.values?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {lab.values.map((v, i) => {
                    const flag = labFlag(v);
                    return (
                      <div className="lab-val" key={i}>
                        <span className="n">{v.name}</span>
                        <span className={flag === 'low' ? 'low' : flag === 'high' ? 'high' : ''}>
                          {v.value} {v.unit ?? ''}
                          {v.refLow !== undefined || v.refHigh !== undefined
                            ? ` (${v.refLow ?? ''}–${v.refHigh ?? ''})`
                            : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
