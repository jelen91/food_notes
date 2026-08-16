import { useState } from 'react';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import { Field, Msg } from '../../components/ui';

export default function ZapomenuteHeslo() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } finally {
      // Potvrzení je vždy stejné – aplikace neprozrazuje, které e-maily mají účet.
      setSent(true);
      setBusy(false);
    }
  };

  return (
    <AppShell title="Obnovení hesla">
      <div className="card">
        {sent ? (
          <>
            <p className="muted">
              Pokud k zadané adrese existuje účet, poslali jsme na ni odkaz pro nastavení nového hesla. Platí hodinu.
            </p>
            <p className="hint" style={{ marginTop: 10 }}>
              <Link href="/app/prihlaseni">Zpět na přihlášení</Link>
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
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
              <button className="btn btn-primary btn-block" type="submit" disabled={busy || !email}>
                {busy ? 'Odesílám…' : 'Poslat odkaz'}
              </button>
            </div>
            <Msg text="" />
          </form>
        )}
      </div>
    </AppShell>
  );
}
