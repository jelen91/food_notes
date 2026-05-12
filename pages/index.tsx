import { useState, useEffect } from 'react';

interface Entry {
  time: string;
  note: string;
}

type Health = Record<string, number | string> | null;

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
    const newEntries = [...entries, { time, note }];
    setEntries(newEntries);
    setNewTime(new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }));
    setNewNote('');

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

  const handleLoadReport = async () => {
    try {
      await loadReport();
    } catch (err: any) {
      showMessage(err.message, true);
    }
  };

  const handleEdit = async (editDate: string) => {
    setDate(editDate);
    await loadDay(editDate);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: '#f7f8fc', padding: '0' }}>
      <main style={{ maxWidth: '100%', margin: '0', padding: '0' }}>
        <div style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: 'white', padding: '24px 16px', textAlign: 'center' }}>
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
              {entries.map((entry, idx) => (
                <div key={idx} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', color: '#2563eb', fontSize: '0.9rem', marginBottom: '4px' }}>{entry.time}</div>
                    <div style={{ color: '#374151', fontSize: '0.9rem' }}>{entry.note}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteEntry(idx)}
                    style={{ padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', whiteSpace: 'nowrap' }}
                  >
                    Smazat
                  </button>
                </div>
              ))}
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
                          <span style={{ fontWeight: '600', color: '#2563eb' }}>{entry.time}</span> - {entry.note}
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