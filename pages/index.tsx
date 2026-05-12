import { useState, useEffect } from 'react';

export default function Home() {
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
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

  const saveNote = async (date: string, text: string) => {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, text }),
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
      setNote(result.text || '');
    } catch (err: any) {
      showMessage(err.message, true);
    }
  };

  const handleSave = async () => {
    const text = note.trim();
    if (!date) {
      showMessage('Vyber datum.', true);
      return;
    }

    try {
      await saveNote(date, text);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', boxSizing: 'border-box', padding: '0' }}>
      <main style={{ maxWidth: '100%', margin: '0', padding: '0' }}>
        <h1>Food Notes</h1>
        <section style={{ background: 'white', borderRadius: '24px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)', padding: '20px' }}>
        <label style={{ display: 'block', margin: '16px 0 8px', fontWeight: '600' }}>
          Datum
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ width: '100%', padding: '14px', border: '1px solid #d2d6dc', borderRadius: '12px', fontSize: '1rem', boxSizing: 'border-box', marginTop: '8px' }}
          />
        </label>

        <label style={{ display: 'block', margin: '16px 0 8px', fontWeight: '600' }}>
          Poznámky k jídlu
          <textarea
            rows={8}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Napiš, co jsi měl ke snídani, obědu nebo večeři..."
            style={{ width: '100%', padding: '14px', border: '1px solid #d2d6dc', borderRadius: '12px', fontSize: '1rem', boxSizing: 'border-box', resize: 'vertical', minHeight: '180px', marginTop: '8px' }}
          />
        </label>

        <button
          onClick={handleSave}
          style={{ marginTop: '18px', padding: '14px 18px', border: 'none', background: '#2563eb', color: 'white', fontWeight: '700', borderRadius: '999px', cursor: 'pointer' }}
        >
          Uložit
        </button>
        <div style={{ marginTop: '12px', fontSize: '0.95rem', color: message.includes('uložena') ? '#166534' : '#b91c1c' }}>
          {message}
        </div>
      </section>

      <section style={{ background: 'white', borderRadius: '24px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)', padding: '20px', marginTop: '24px' }}>
        <button
          onClick={handleLoadReport}
          style={{ marginTop: '18px', padding: '14px 18px', border: 'none', background: '#2563eb', color: 'white', fontWeight: '700', borderRadius: '999px', cursor: 'pointer' }}
        >
          Zobrazit report všech dnů
        </button>
        <div>
          {report.length === 0 ? (
            <p>Žádné uložené dny.</p>
          ) : (
            report.map((note: any) => (
              <article key={note.date} style={{ borderTop: '1px solid #e5e7eb', padding: '16px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0 }}>{note.date}</h3>
                  <button
                    onClick={() => handleEdit(note.date)}
                    style={{ background: '#f59e0b', padding: '8px 12px', border: 'none', borderRadius: '999px', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Upravit
                  </button>
                </div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{note.text}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
    </div>
  );
}