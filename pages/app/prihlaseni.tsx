import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell from '../../components/AppShell';
import { Field, Msg } from '../../components/ui';

export default function Prihlaseni() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || 'Přihlášení se nepodařilo.');
        return;
      }
      router.push(data.next || '/app');
    } catch {
      setMessage('Síťová chyba. Zkus to prosím znovu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Přihlášení">
      <form className="card" onSubmit={submit}>
        <div className="stack">
          <Field label="E-mail">
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Heslo">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || !email || !password}>
            {busy ? 'Přihlašuji…' : 'Přihlásit'}
          </button>
        </div>
        <Msg text={message} error />
        <p className="hint" style={{ marginTop: 10 }}>
          <Link href="/app/zapomenute-heslo">Zapomenuté heslo</Link> · <Link href="/dotaznik">Sestavit deník</Link>
        </p>
      </form>
    </AppShell>
  );
}
