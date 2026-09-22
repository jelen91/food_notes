import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell, { Disclaimer } from '../../components/AppShell';
import { Field, Msg } from '../../components/ui';
import { BRAND } from '../../lib/brand';

export default function Registrace() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error || 'Registraci se nepodařilo dokončit.');
        return;
      }
      router.push(data.next || '/app/platba');
    } catch {
      setIsError(true);
      setMessage('Síťová chyba. Zkus to prosím znovu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title="Založení účtu"
      subtitle={`Vítej v ${BRAND.name}. Tvůj osobní deník pro hledání souvislostí.`}
    >
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
          <Field label="Heslo (aspoň 10 znaků)">
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
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || !email || password.length < 10}>
            {busy ? 'Zakládám…' : 'Založit účet'}
          </button>
        </div>
        <Msg text={message} error={isError} />
        <hr className="divider" />
        <Disclaimer />
        <p className="hint" style={{ marginTop: 8 }}>
          Už máš účet? <Link href="/app/prihlaseni">Přihlas se</Link>
        </p>
      </form>
    </AppShell>
  );
}
