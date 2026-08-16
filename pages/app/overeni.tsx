import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell from '../../components/AppShell';

export default function Overeni() {
  const router = useRouter();
  const [state, setState] = useState<'cekam' | 'hotovo' | 'chyba'>('cekam');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    const token = String(router.query.token ?? '');
    if (!token) {
      setState('chyba');
      setMessage('Odkaz je neúplný. Použij prosím celý odkaz z e-mailu.');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState('chyba');
          setMessage(data.error || 'Ověření se nepodařilo.');
          return;
        }
        setState('hotovo');
      } catch {
        setState('chyba');
        setMessage('Síťová chyba. Zkus odkaz otevřít znovu.');
      }
    })();
  }, [router.isReady, router.query.token]);

  return (
    <AppShell title="Ověření e-mailu">
      <div className="card">
        {state === 'cekam' && <p className="muted">Ověřuji…</p>}
        {state === 'hotovo' && (
          <>
            <p className="muted">E-mail je ověřený.</p>
            <p className="hint" style={{ marginTop: 10 }}>
              <Link href="/app">Pokračovat</Link>
            </p>
          </>
        )}
        {state === 'chyba' && (
          <>
            <p className="msg err">{message}</p>
            <p className="hint" style={{ marginTop: 10 }}>
              <Link href="/app">Zpět do aplikace</Link>
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
