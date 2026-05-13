import { useState } from 'react';
import { useRouter } from 'next/router';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Přihlášení selhalo.');
        return;
      }
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Síťová chyba.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <form
        onSubmit={handleSubmit}
        style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)' }}
      >
        <h1 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 700, color: '#111827' }}>Food Notes</h1>
        <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#6b7280' }}>Zadej heslo pro přístup.</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Heslo"
          style={{ width: '100%', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '1rem', boxSizing: 'border-box', marginBottom: 12 }}
        />
        <button
          type="submit"
          disabled={busy || !password}
          style={{ width: '100%', padding: 12, border: 'none', background: busy || !password ? '#9ca3af' : '#2563eb', color: 'white', fontWeight: 600, borderRadius: 8, cursor: busy || !password ? 'not-allowed' : 'pointer', fontSize: '0.95rem' }}
        >
          {busy ? 'Přihlašuji…' : 'Přihlásit'}
        </button>
        {error && <div style={{ marginTop: 12, color: '#dc2626', fontSize: '0.85rem' }}>{error}</div>}
      </form>
    </div>
  );
}
