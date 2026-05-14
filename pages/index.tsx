import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Entry {
  time: string;
  note: string;
  gas?: number;       // 1–5, volitelné (1 = minimum, 5 = extrém)
  pressure?: number;  // 1–5, volitelné – tlak v břiše
}

type Health = Record<string, number | string> | null;

// Volitelné symptomy hodnocené 1–5, navázané na konkrétní záznam v deníku.
const SYMPTOMS: Array<{ key: 'gas' | 'pressure'; label: string; tag: string }> = [
  { key: 'gas', label: 'Plyny', tag: 'Plyny' },
  { key: 'pressure', label: 'Tlak v břiše', tag: 'Tlak' },
];

// "[Plyny: 4, Tlak: 2] " – prefix pro strojové parsování v .md exportu; prázdný string když nic není vyplněno.
function symptomTag(entry: Entry): string {
  const parts = SYMPTOMS.filter((s) => entry[s.key]).map((s) => `${s.tag}: ${entry[s.key]}`);
  return parts.length ? `[${parts.join(', ')}] ` : '';
}

// Řada tlačítek 1–5 + "—" pro rychlé/volitelné odkliknutí úrovně symptomu.
function SymptomPicker({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  compact?: boolean;
}) {
  const pad = compact ? '4px 0' : '8px 0';
  return (
    <div style={{ marginBottom: compact ? 4 : 10 }}>
      <div style={{ fontSize: compact ? '0.7rem' : '0.8rem', color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(active ? undefined : n)}
              style={{
                flex: 1,
                padding: pad,
                borderRadius: 6,
                fontSize: compact ? '0.8rem' : '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: active ? '1px solid #b45309' : '1px solid #e5e7eb',
                background: active ? '#f59e0b' : 'white',
                color: active ? 'white' : '#374151',
              }}
            >
              {n}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(undefined)}
          title="Bez hodnocení"
          style={{ padding: '0 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', color: '#9ca3af', cursor: 'pointer', fontSize: compact ? '0.8rem' : '0.9rem' }}
        >
          —
        </button>
      </div>
    </div>
  );
}

// Hezké popisky a jednotky pro známé metriky z Apple Health. Neznámé klíče se zobrazí tak jak jsou.
const HEALTH_LABELS: Record<string, { label: string; unit?: string }> = {
  activeEnergy: { label: 'Aktivní kalorie', unit: 'kcal' },
  totalEnergy: { label: 'Celkové kalorie', unit: 'kcal' },
  restingEnergy: { label: 'Klidové kalorie', unit: 'kcal' },
  exerciseMinutes: { label: 'Cvičení', unit: 'min' },
  standMinutes: { label: 'Minuty ve stoje', unit: 'min' },
  standHours: { label: 'Hodiny stání (kroužek)', unit: 'h' },
  steps: { label: 'Kroky' },
  distanceKm: { label: 'Vzdálenost', unit: 'km' },
  sleepHours: { label: 'Spánek', unit: 'h' },
  restingHeartRate: { label: 'Klidový tep', unit: 'bpm' },
  heartRateAvg: { label: 'Průměrný tep', unit: 'bpm' },
  walkingHeartRate: { label: 'Tep při chůzi', unit: 'bpm' },
  hrv: { label: 'HRV', unit: 'ms' },
  respiratoryRate: { label: 'Dech', unit: '/min' },
  bloodOxygen: { label: 'Kyslík v krvi', unit: '%' },
  weightKg: { label: 'Váha', unit: 'kg' },
  bodyFatPct: { label: 'Tělesný tuk', unit: '%' },
  timeInDaylight: { label: 'Na denním světle', unit: 'min' },
  walkingSpeed: { label: 'Rychlost chůze', unit: 'km/h' },
  walkingStepLength: { label: 'Délka kroku', unit: 'cm' },
  walkingDoubleSupportPercentage: { label: 'Dvojí opora', unit: '%' },
  physicalEffort: { label: 'Fyzická námaha', unit: 'MET' },
  headphoneAudioExposure: { label: 'Hlasitost ve sluchátkách', unit: 'dB' },
  environmentalAudioExposure: { label: 'Hlučnost okolí', unit: 'dB' },
  flightsClimbed: { label: 'Vyšlapaná patra' },
};

function healthRows(health: Health) {
  if (!health) return [];
  return Object.entries(health).map(([key, value]) => {
    const meta = HEALTH_LABELS[key];
    return {
      label: meta?.label ?? key,
      value: meta?.unit ? `${value} ${meta.unit}` : String(value),
    };
  });
}

export default function Home() {
  const [date, setDate] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [health, setHealth] = useState<Health>(null);
  const [newTime, setNewTime] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newGas, setNewGas] = useState<number | undefined>(undefined);
  const [newPressure, setNewPressure] = useState<number | undefined>(undefined);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editTime, setEditTime] = useState('');
  const [editNote, setEditNote] = useState('');
  const [message, setMessage] = useState('');
  const [report, setReport] = useState([]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
    loadDay(today);
  }, []);

  const showMessage = (text: string, isError = false) => {
    setMessage(text);
    // Could add timeout to clear message
  };

  const fetchNote = async (date: string) => {
    const response = await fetch(`/api/notes?date=${date}`);
    if (!response.ok) {
      throw new Error('Nepodařilo se načíst poznámku.');
    }
    return response.json();
  };

  const saveNote = async (date: string, entries: Entry[]) => {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, entries }),
    });
    if (!response.ok) {
      throw new Error('Nepodařilo se uložit poznámku.');
    }
    return response.json();
  };

  const loadReport = async () => {
    const response = await fetch('/api/report');
    if (!response.ok) {
      throw new Error('Nepodařilo se načíst report.');
    }
    const notes = await response.json();
    setReport(notes);
  };

  const loadDay = async (selectedDate: string) => {
    if (!selectedDate) return;
    try {
      const result = await fetchNote(selectedDate);
      setEntries(result.entries || []);
      setHealth(result.health || null);
      const now = new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
      setNewTime(now);
      setNewNote('');
      setNewGas(undefined);
      setNewPressure(undefined);
    } catch (err: any) {
      showMessage(err.message, true);
    }
  };

  const handleAddEntry = async () => {
    const time = newTime.trim();
    const note = newNote.trim();
    if (!time || !note) {
      showMessage('Vyplň čas a poznámku.', true);
      return;
    }
    const entry: Entry = { time, note };
    if (newGas) entry.gas = newGas;
    if (newPressure) entry.pressure = newPressure;
    const newEntries = [...entries, entry];
    setEntries(newEntries);
    setNewTime(new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }));
    setNewNote('');
    setNewGas(undefined);
    setNewPressure(undefined);

    try {
      await saveNote(date, newEntries);
      showMessage('Bod přidán a uložen.');
    } catch (err: any) {
      showMessage(err.message, true);
    }
  };

  const handleDeleteEntry = async (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    setEntries(newEntries);
    try {
      await saveNote(date, newEntries);
      showMessage('Bod smazán a uloženo.');
    } catch (err: any) {
      showMessage(err.message, true);
    }
  };

  const startEdit = (index: number) => {
    setEditingIdx(index);
    setEditTime(entries[index].time);
    setEditNote(entries[index].note);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditTime('');
    setEditNote('');
  };

  const saveEdit = async () => {
    if (editingIdx === null) return;
    const time = editTime.trim();
    const note = editNote.trim();
    if (!time || !note) {
      showMessage('Vyplň čas i poznámku.', true);
      return;
    }
    const newEntries = entries.map((e, i) => (i === editingIdx ? { ...e, time, note } : e));
    setEntries(newEntries);
    setEditingIdx(null);
    setEditTime('');
    setEditNote('');
    try {
      await saveNote(date, newEntries);
      showMessage('Záznam upraven.');
    } catch (err: any) {
      showMessage(err.message, true);
    }
  };

  // Nastaví/zruší úroveň symptomu (gas/pressure) na konkrétním už uloženém záznamu a hned uloží.
  const setEntrySymptom = async (index: number, key: 'gas' | 'pressure', value: number | undefined) => {
    const newEntries = entries.map((e, i) => {
      if (i !== index) return e;
      const updated: Entry = { ...e };
      if (value === undefined) delete updated[key];
      else updated[key] = value;
      return updated;
    });
    setEntries(newEntries);
    try {
      await saveNote(date, newEntries);
      showMessage('Uloženo.');
    } catch (err: any) {
      showMessage(err.message, true);
    }
  };

  const handleLoadReport = async () => {
    try {
      await loadReport();
    } catch (err: any) {
      showMessage(err.message, true);
    }
  };

  // Stáhne všechna data jako přehledný Markdown soubor – vhodné vložit AI k vyhodnocení.
  const handleExport = async () => {
    try {
      const [reportRes, bloodRes] = await Promise.all([
        fetch('/api/report'),
        fetch('/api/blood-tests'),
      ]);
      if (!reportRes.ok) throw new Error('Nepodařilo se načíst data k exportu.');
      const days: Array<{ date: string; entries: Entry[]; health: Health }> = await reportRes.json();
      const bloodTests: Array<{ date: string; filename: string | null; size: number | null }> = bloodRes.ok ? await bloodRes.json() : [];

      const lines: string[] = [];
      lines.push('# Food Notes – export');
      lines.push(`Vygenerováno: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
      lines.push('');
      lines.push('Každý den obsahuje záznamy o jídle (čas – co) a denní souhrn zdravotních dat z Apple Watch.');
      lines.push('Volitelné symptomy u záznamu jsou v hranatých závorkách na začátku: [Plyny: 1–5, Tlak: 1–5] (1 = minimum, 5 = extrém).');
      lines.push('');

      if (bloodTests.length > 0) {
        lines.push('## Krevní testy (archiv)');
        lines.push('Seznam dat odběrů – samotná PDF nejsou v exportu, jen reference. Stáhni v appce na /blood.');
        for (const t of bloodTests) lines.push(`- ${t.date} – ${t.filename ?? '(bez názvu)'}`);
        lines.push('');
      }

      const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
      for (const day of sorted) {
        lines.push(`## ${day.date}`);
        if (day.entries && day.entries.length > 0) {
          lines.push('### Jídlo');
          for (const e of day.entries) lines.push(`- ${e.time} – ${symptomTag(e)}${e.note}`);
        } else {
          lines.push('### Jídlo');
          lines.push('- (žádné záznamy)');
        }
        const rows = healthRows(day.health);
        if (rows.length > 0) {
          lines.push('### Zdraví');
          lines.push(rows.map((r) => `${r.label}: ${r.value}`).join(' · '));
        }
        lines.push('');
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `food-notes-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showMessage('Export stažen.');
    } catch (err: any) {
      showMessage(err.message, true);
    }
  };

  const handleEdit = async (editDate: string) => {
    setDate(editDate);
    await loadDay(editDate);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: '#f7f8fc', padding: '0' }}>
      <main style={{ maxWidth: '100%', margin: '0', padding: '0' }}>
        <div style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: 'white', padding: '24px 16px', textAlign: 'center', position: 'relative' }}>
          <button
            onClick={handleLogout}
            style={{ position: 'absolute', top: 12, right: 12, padding: '6px 10px', background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
          >
            Odhlásit
          </button>
          <h1 style={{ margin: '0 0 8px', fontSize: '1.75rem', fontWeight: '700' }}>Food Notes</h1>
          <p style={{ margin: '0', fontSize: '0.9rem', opacity: 0.9 }}>Zaznamenej svoji stravu...</p>
        </div>

        <section style={{ margin: '16px', background: 'white', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)', padding: '16px', boxSizing: 'border-box' }}>
          <label style={{ display: 'block', margin: '0 0 12px', fontWeight: '600', fontSize: '0.9rem', color: '#374151' }}>
            📅 Vyber datum
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              loadDay(e.target.value);
            }}
            style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '1rem', boxSizing: 'border-box' }}
          />
        </section>

        <section style={{ margin: '16px', background: 'white', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)', padding: '16px', boxSizing: 'border-box' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: '600', color: '#111827' }}>Přidej bod</h2>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              style={{ flex: 1, padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.9rem' }}
            />
          </div>

          <textarea
            rows={3}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Co jsi měl k jídlu?"
            style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: '12px', fontFamily: 'inherit' }}
          />

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Symptomy (volitelné, 1 = min · 5 = extrém)</div>
            <SymptomPicker label="Plyny" value={newGas} onChange={setNewGas} />
            <SymptomPicker label="Tlak v břiše" value={newPressure} onChange={setNewPressure} />
          </div>

          <button
            onClick={handleAddEntry}
            style={{ width: '100%', padding: '12px', border: 'none', background: '#10b981', color: 'white', fontWeight: '600', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            + Přidat bod
          </button>

          <div style={{ marginTop: '12px', fontSize: '0.85rem', color: message.includes('přidán') || message.includes('uložena') ? '#059669' : message ? '#dc2626' : '#9ca3af' }}>
            {message}
          </div>
        </section>

        <section style={{ margin: '16px', background: 'white', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)', padding: '16px', boxSizing: 'border-box' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: '600', color: '#111827' }}>Body na {date || '...'}</h2>

          {entries.length === 0 ? (
            <p style={{ margin: '0', color: '#9ca3af', fontSize: '0.9rem' }}>Zatím žádné. Přidej první bod! 👆</p>
          ) : (
            <div>
              {entries.map((entry, idx) => {
                const isEditing = editingIdx === idx;
                return (
                  <div key={idx} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                    {isEditing ? (
                      <div>
                        <input
                          type="time"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: '8px' }}
                        />
                        <textarea
                          rows={3}
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box', fontFamily: 'inherit', marginBottom: '8px' }}
                        />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={saveEdit}
                            style={{ flex: 1, padding: '8px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                          >
                            Uložit
                          </button>
                          <button
                            onClick={cancelEdit}
                            style={{ flex: 1, padding: '8px', background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                          >
                            Zrušit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '600', color: '#2563eb', fontSize: '0.9rem', marginBottom: '4px' }}>
                              {entry.time}
                              {symptomTag(entry) && (
                                <span style={{ marginLeft: 8, fontWeight: 600, color: '#b45309', background: '#fef3c7', borderRadius: 4, padding: '1px 6px', fontSize: '0.75rem' }}>
                                  {symptomTag(entry).trim()}
                                </span>
                              )}
                            </div>
                            <div style={{ color: '#374151', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{entry.note}</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <button
                              onClick={() => startEdit(idx)}
                              style={{ padding: '4px 8px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}
                            >
                              Upravit
                            </button>
                            <button
                              onClick={() => handleDeleteEntry(idx)}
                              style={{ padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}
                            >
                              Smazat
                            </button>
                          </div>
                        </div>
                        <div style={{ marginTop: '10px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {SYMPTOMS.map((s) => (
                            <div key={s.key} style={{ flex: '1 1 140px', minWidth: '140px' }}>
                              <SymptomPicker
                                compact
                                label={s.label}
                                value={entry[s.key]}
                                onChange={(v) => setEntrySymptom(idx, s.key, v)}
                              />
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section style={{ margin: '16px', background: 'white', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)', padding: '16px', boxSizing: 'border-box' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: '600', color: '#111827' }}>⌚ Z Apple Watch</h2>
          {healthRows(health).length === 0 ? (
            <p style={{ margin: '0', color: '#9ca3af', fontSize: '0.9rem' }}>Žádná data z hodinek pro tento den.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {healthRows(health).map((row) => (
                <div key={row.label} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px' }}>{row.label}</div>
                  <div style={{ fontWeight: '700', color: '#111827', fontSize: '1.05rem' }}>{row.value}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ margin: '16px', background: 'white', borderRadius: '16px', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)', padding: '16px', boxSizing: 'border-box' }}>
          <button
            onClick={handleLoadReport}
            style={{ width: '100%', padding: '12px', border: 'none', background: '#7c3aed', color: 'white', fontWeight: '600', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            📊 Zobrazit report všech dnů
          </button>

          <button
            onClick={handleExport}
            style={{ width: '100%', marginTop: '8px', padding: '12px', border: '1px solid #7c3aed', background: 'white', color: '#7c3aed', fontWeight: '600', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            📥 Stáhnout vše pro AI (.md)
          </button>

          <Link
            href="/blood"
            style={{ display: 'block', width: '100%', marginTop: '8px', padding: '12px', border: 'none', background: '#be123c', color: 'white', fontWeight: 600, borderRadius: 8, textDecoration: 'none', fontSize: '0.9rem', textAlign: 'center', boxSizing: 'border-box' }}
          >
            🩸 Krevní testy (archiv PDF)
          </Link>

          {report.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              {report.map((item: any) => (
                <article key={item.date} style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: '0', fontWeight: '600', color: '#111827', fontSize: '0.95rem' }}>{item.date}</h3>
                    <button
                      onClick={() => handleEdit(item.date)}
                      style={{ background: '#f59e0b', color: 'white', padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}
                    >
                      Upravit
                    </button>
                  </div>
                  {(item.entries || []).length > 0 ? (
                    <div>
                      {item.entries.map((entry: Entry, idx: number) => (
                        <div key={idx} style={{ background: '#f9fafb', padding: '8px', borderRadius: '4px', marginBottom: '4px', fontSize: '0.85rem' }}>
                          <span style={{ fontWeight: '600', color: '#2563eb' }}>{entry.time}</span> -{' '}
                          {symptomTag(entry) && <span style={{ color: '#b45309', fontWeight: 600 }}>{symptomTag(entry)}</span>}
                          {entry.note}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ margin: '0', fontSize: '0.85rem', color: '#9ca3af' }}>Žádné body</p>
                  )}
                  {healthRows(item.health).length > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#6b7280' }}>
                      ⌚ {healthRows(item.health).map((r) => `${r.label}: ${r.value}`).join(' · ')}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <div style={{ height: '24px' }}></div>
      </main>
    </div>
  );
}