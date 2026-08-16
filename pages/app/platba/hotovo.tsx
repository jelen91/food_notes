import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { TopBar } from '../../../components/AppShell';

/**
 * Návrat ze Stripe sám o sobě nic neodemyká. Přístup vzniká až tím, že ověřený webhook
 * zapíše entitlement a založí účet – tahle obrazovka jen čeká, až se to stane, a pak
 * zákazníka do nového účtu přihlásí.
 */
export default function PlatbaHotovo() {
  const router = useRouter();
  const [stav, setStav] = useState<'cekam' | 'hotovo' | 'zdrzeni'>('cekam');
  const [email, setEmail] = useState<string | null>(null);
  const pokusy = useRef(0);

  useEffect(() => {
    if (!router.isReady) return;
    const sessionId = String(router.query.session_id ?? '');
    let zivy = true;

    const tik = async () => {
      if (!zivy) return;
      pokusy.current += 1;
      try {
        // Platba bez účtu: session z návratové adresy + cookie draftu vymění za přihlášení.
        if (sessionId) {
          const res = await fetch('/api/billing/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          if (res.ok) {
            const data = await res.json();
            setEmail(data.email ?? null);
            setStav('hotovo');
            setTimeout(() => router.push(data.next || '/app'), 1400);
            return;
          }
        }
        // Starší cesta (účet vznikl před platbou) i záložní kontrola po přihlášení.
        const res = await fetch('/api/billing/status');
        if (res.ok) {
          const data = await res.json();
          if (data.billing?.access) {
            setStav('hotovo');
            setTimeout(() => router.push(data.next || '/app'), 1200);
            return;
          }
        }
      } catch {
        // síťový výpadek – zkusíme to znovu při dalším tiku
      }
      // Po zhruba minutě přestaneme dotazovat a nabídneme ruční kontrolu.
      if (pokusy.current >= 20) {
        setStav('zdrzeni');
        return;
      }
      setTimeout(tik, 3000);
    };
    tik();
    return () => {
      zivy = false;
    };
  }, [router.isReady, router.query.session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <Head>
        <title>Platba</title>
        <meta name="theme-color" content="#f6f2ea" />
      </Head>
      <TopBar />
      <div className="wrap">
        <div className="hdr">
          <h1>Platba</h1>
        </div>
        <div className="card">
          {stav === 'cekam' && (
            <>
              <h2>Platbu potvrzujeme…</h2>
              <p className="muted">
                Čekáme na potvrzení od platební brány. Obvykle to trvá pár vteřin — stránku není potřeba obnovovat.
              </p>
            </>
          )}
          {stav === 'hotovo' && (
            <>
              <h2>Hotovo, deník je tvůj</h2>
              <p className="muted">
                {email
                  ? `Účet jsme založili na ${email}. Odkaz na nastavení hesla ti tam posíláme e-mailem.`
                  : 'Přesměrovávám tě dál…'}
              </p>
            </>
          )}
          {stav === 'zdrzeni' && (
            <>
              <h2>Potvrzení se zdrželo</h2>
              <p className="muted">
                Platba se možná ještě zpracovává. Peníze jsou v pořádku — jakmile ji brána potvrdí, přístup se
                aktivuje sám a na e-mail z platby dorazí odkaz do deníku.
              </p>
              <p className="hint" style={{ marginTop: 10 }}>
                <Link href="/app/platba">Zobrazit stav platby</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
