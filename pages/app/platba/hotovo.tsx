import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { TopBar } from '../../../components/AppShell';
import { paymentClaimSucceeded } from '../../../lib/payment-return';
import { BRAND, brandTitle } from '../../../lib/brand';

/**
 * Návrat ze Stripe sám o sobě nic neodemyká. Přístup vzniká až tím, že ověřený webhook
 * zapíše entitlement a založí účet – tahle obrazovka jen čeká, až se to stane, a pak
 * zákazníka do nového účtu přihlásí.
 */
export default function PlatbaHotovo() {
  const router = useRouter();
  const [stav, setStav] = useState<'cekam' | 'hotovo' | 'zdrzeni' | 'prihlaseni' | 'duplicita'>('cekam');
  const [duplicateRefundStatus, setDuplicateRefundStatus] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const pokusy = useRef(0);

  useEffect(() => {
    if (!router.isReady) return;
    const sessionId = String(router.query.session_id ?? '');
    let zivy = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    pokusy.current = 0;

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
          const data = await res.json().catch(() => ({}));
          if (!zivy) return;
          if (res.status === 200 && data.duplicatePurchase === true) {
            setDuplicateRefundStatus(data.refundStatus ?? 'processing');
            setStav('duplicita');
            return;
          }
          if (res.status === 200 && data.requiresLogin === true) {
            setStav('prihlaseni');
            return;
          }
          if (paymentClaimSucceeded(res.status, data)) {
            setEmail(data.email ?? null);
            setStav('hotovo');
            timer = setTimeout(() => {
              if (zivy) router.push(data.next || '/app');
            }, 1400);
            return;
          }
        }
        // Starší cesta (účet vznikl před platbou) i záložní kontrola po přihlášení.
        const res = await fetch('/api/billing/status');
        if (res.ok) {
          const data = await res.json();
          if (!zivy) return;
          if (data.billing?.access) {
            setStav('hotovo');
            timer = setTimeout(() => {
              if (zivy) router.push(data.next || '/app');
            }, 1200);
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
      if (zivy) timer = setTimeout(tik, 3000);
    };
    tik();
    return () => {
      zivy = false;
      if (timer) clearTimeout(timer);
    };
  }, [router.isReady, router.query.session_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <Head>
        <title>{brandTitle('Platba')}</title>
        <meta name="theme-color" content={BRAND.themeColor} />
      </Head>
      <TopBar />
      <div className="wrap">
        <div className="hdr">
          <h1>Platba</h1>
        </div>
        <div className="card">
          {stav === 'duplicita' && (
            <>
              <h2>Další nákup už nebyl potřeba</h2>
              <p>Na zadaném účtu už je nákup evidovaný. Původní přístup se touto platbou neprodlužuje.</p>
              <p>
                {duplicateRefundStatus === 'succeeded'
                  ? 'Stripe potvrdil vrácení této opakované platby. Připsání peněz závisí na bance.'
                  : ['pending', 'requires_action'].includes(duplicateRefundStatus)
                    ? 'Vrácení této opakované platby Stripe přijal a zpracovává.'
                    : 'Opakovanou platbu evidujeme k vrácení. Dokončení zatím není potvrzené; platbu neopakuj.'}
              </p>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                Obnovit stav
              </button>{' '}
              <Link href="/app/prihlaseni">Přihlásit se do původního účtu</Link>
            </>
          )}
          {stav === 'cekam' && (
            <>
              <h2>Platbu potvrzujeme…</h2>
              <p className="muted">
                Čekáme na potvrzení od platební brány. Obvykle to trvá pár vteřin — stránku není potřeba
                obnovovat.
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
          {stav === 'prihlaseni' && (
            <>
              <h2>Pokračuj přihlášením</h2>
              <p className="muted">Pro otevření deníku ověř, že účet patří tobě. Použij e-mail z platby.</p>
              <Link className="btn btn-primary btn-block" style={{ marginTop: 12 }} href="/app/prihlaseni">
                Přihlásit se
              </Link>
              <p className="hint">
                <Link href="/app/zapomenute-heslo">Nastavit nebo obnovit heslo e-mailem</Link>
              </p>
            </>
          )}
          {stav === 'zdrzeni' && (
            <>
              <h2>Potvrzení se zdrželo</h2>
              <p className="muted">
                Potvrzení platby zatím nemáme. Pokud byla platba úspěšná, po potvrzení platební bránou se
                přístup aktivuje a na e-mail z platby dorazí odkaz. Platbu teď neopakuj.
              </p>
              <p className="hint" style={{ marginTop: 10 }}>
                <button className="btn btn-primary" onClick={() => window.location.reload()}>
                  Zkontrolovat znovu
                </button>{' '}
                <Link href="/app/prihlaseni">Přihlásit se</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
