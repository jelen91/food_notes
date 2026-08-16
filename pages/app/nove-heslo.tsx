import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell from '../../components/AppShell';
import { Field, Msg } from '../../components/ui';

export default function NoveHeslo() {
  const router = useRouter();
  const token = String(router.query.token ?? '');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error || 'Heslo se nepodařilo změnit.');
        return;
      }
      setDone(true);
    } catch {
      setIsError(true);
      setMessage('Síťová chyba. Zkus to prosím znovu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Nové heslo">
      <div className="card">
        {done ? (
          <>
            <p className="muted">Heslo je změněné.</p>
            <p className="hint" style={{ marginTop: 10 }}>
              <Link href="/app/prihlaseni">Přihlásit se</Link>
            </p>
          </>
        ) : !token ? (
          <p className="muted">Odkaz je neúplný. Použij prosím celý odkaz z e-mailu.</p>
        ) : (
          <form onSubmit={submit}>
            <div className="stack">
              <Field label="Nové heslo (aspoň 10 znaků)">
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <button className="btn btn-primary btn-block" type="submit" disabled={busy || password.length < 10}>
                {busy ? 'Ukládám…' : 'Nastavit heslo'}
              </button>
            </div>
            <Msg text={message} error={isError} />
          </form>
        )}
      </div>
    </AppShell>
  );
}
