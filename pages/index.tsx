import { useState, useEffect } from 'react';

interface Entry {
  time: string;
  note: string;
}

export default function Home() {
  const [date, setDate] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
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
      const now = new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
      setNewTime(now);
      setNewNote('');
    } catch (err: any) {
      showMessage(err.message, true);
    }
  };

  const handleAddEntry = () => {
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
    showMessage('Bod přidán.');
  };

  const handleDeleteEntry = (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    setEntries(newEntries);
  };

  const handleSave = async () => {
    if (!date) {
      showMessage('Vyber datum.', true);
      return;
    }

    try {
      await saveNote(date, entries);
      showMessage('Poznámka uložena.');
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

          <button
            onClick={handleSave}
            style={{ width: '100%', marginTop: '12px', padding: '12px', border: 'none', background: '#2563eb', color: 'white', fontWeight: '600', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            💾 Uložit den
          </button>
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