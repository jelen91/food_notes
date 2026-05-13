import { useEffect, useState } from 'react';
import Link from 'next/link';

interface BloodTest {
  date: string;
  filename: string | null;
  size: number | null;
  uploadedAt: string | null;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BloodPage() {
  const [tests, setTests] = useState<BloodTest[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const loadTests = async () => {
    try {
      const res = await fetch('/api/blood-tests');
      if (!res.ok) throw new Error('Nepodařilo se načíst seznam.');
      setTests(await res.json());
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  useEffect(() => {
    loadTests();
  }, []);

  const readFileAsBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Nepodařilo se přečíst soubor.'));
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1] || '';
        resolve(base64);
      };
      reader.readAsDataURL(f);
    });

  const handleUpload = async () => {
    if (!date || !file) {
      setMessage('Vyber datum i PDF soubor.');
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setMessage('Nahraj prosím PDF soubor.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setMessage('Soubor je moc velký (max ~4 MB). Zkus zkomprimovat PDF.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const contentBase64 = await readFileAsBase64(file);
      const res = await fetch('/api/blood-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, filename: file.name, contentType: file.type || 'application/pdf', contentBase64 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload selhal.');
      }
      setMessage('Nahráno.');
      setFile(null);
      const input = document.getElementById('blood-file-input') as HTMLInputElement | null;
      if (input) input.value = '';
      await loadTests();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (delDate: string) => {
    if (!confirm(`Smazat krevní test z ${delDate}?`)) return;
    try {
      const res = await fetch(`/api/blood-tests?date=${encodeURIComponent(delDate)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Smazání selhalo.');
      setMessage('Smazáno.');
      await loadTests();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: '#f7f8fc' }}>
      <div style={{ background: 'linear-gradient(135deg, #be123c, #9f1239)', color: 'white', padding: '24px 16px', textAlign: 'center', position: 'relative' }}>
        <Link
          href="/"
          style={{ position: 'absolute', top: 12, left: 12, padding: '6px 10px', background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 6, textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600 }}
        >
          ← Zpět
        </Link>
        <h1 style={{ margin: '0 0 8px', fontSize: '1.75rem', fontWeight: 700 }}>🩸 Krevní testy</h1>
        <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>Archiv PDF výsledků</p>
      </div>

      <section style={{ margin: 16, background: 'white', borderRadius: 16, boxShadow: '0 4px 12px rgba(15,23,42,0.1)', padding: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '1.05rem', fontWeight: 600, color: '#111827' }}>Nahrát nový</h2>

        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Datum odběru</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ width: '100%', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '1rem', boxSizing: 'border-box', marginBottom: 12 }}
        />

        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>PDF soubor</label>
        <input
          id="blood-file-input"
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: 12 }}
        />

        <button
          onClick={handleUpload}
          disabled={busy || !file || !date}
          style={{ width: '100%', padding: 12, border: 'none', background: busy || !file || !date ? '#9ca3af' : '#be123c', color: 'white', fontWeight: 600, borderRadius: 8, cursor: busy || !file || !date ? 'not-allowed' : 'pointer', fontSize: '0.95rem' }}
        >
          {busy ? 'Nahrávám…' : 'Nahrát'}
        </button>

        {message && (
          <div style={{ marginTop: 10, fontSize: '0.85rem', color: message === 'Nahráno.' || message === 'Smazáno.' ? '#059669' : '#dc2626' }}>{message}</div>
        )}
        <div style={{ marginTop: 10, fontSize: '0.75rem', color: '#9ca3af' }}>Pokud pro stejné datum už existuje, přepíše se. Limit ~4 MB.</div>
      </section>

      <section style={{ margin: 16, background: 'white', borderRadius: 16, boxShadow: '0 4px 12px rgba(15,23,42,0.1)', padding: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '1.05rem', fontWeight: 600, color: '#111827' }}>Archiv ({tests.length})</h2>

        {tests.length === 0 ? (
          <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.9rem' }}>Zatím nic nahraného.</p>
        ) : (
          tests.map((t) => (
            <div key={t.date} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#be123c', fontSize: '0.95rem' }}>{t.date}</div>
                <div style={{ color: '#374151', fontSize: '0.8rem', wordBreak: 'break-all' }}>
                  {t.filename}
                  {t.size ? ` · ${formatSize(t.size)}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <a
                  href={`/api/blood-tests?date=${encodeURIComponent(t.date)}&download=1`}
                  style={{ padding: '6px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  Stáhnout
                </a>
                <button
                  onClick={() => handleDelete(t.date)}
                  style={{ padding: '6px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  Smazat
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <div style={{ height: 24 }}></div>
    </div>
  );
}
