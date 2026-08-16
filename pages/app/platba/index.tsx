// „Deník je připravený, zbývá platba.“
//
// Stránku otevírá zákazník hned po dotazníku, obvykle ještě bez účtu – ten vzniká až po
// zaplacení. Z deníku tu záměrně není vidět nic: obsah vzniká a odemyká se až po platbě.

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { DISCLAIMER, TopBar } from '../../../components/AppShell';
import { Msg } from '../../../components/ui';

interface Status {
  account: { email: string; onboarding: string };
  billing: { access: boolean; paidAt: string | null };
  next: string;
}

interface Props {
  /** Je dotazník odeslaný? Bez něj není co zpřístupnit. */
  submitted: boolean;
}

export default function Platba({ submitted }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Bez přihlášení tenhle endpoint nic nevrací – to je v pořádku.
    fetch('/api/billing/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setStatus(s))
      .catch(() => undefined);
  }, []);

  const startCheckout = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setMessage(data.error || 'Platbu se nepodařilo spustit.');
        if (data.next) setTimeout(() => router.push(data.next), 1200);
        return;
      }
      window.location.href = data.url;
    } catch {
      setMessage('Síťová chyba. Zkus to prosím znovu.');
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode, title: string, subtitle?: string) => (
    <div className="page">
      <Head>
        <title>{title}</title>
        <meta name="theme-color" content="#f6f2ea" />
      </Head>
      <TopBar />
      <div className="wrap">
        <div className="hdr">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );

  if (status?.billing.access) {
    return shell(
      <section className="card">
        <p>Přístup je aktivní.</p>
        <button className="btn btn-primary btn-block" onClick={() => router.push(status.next)}>
          Pokračovat do deníku
        </button>
      </section>,
      'Přístup je aktivní'
    );
  }

  if (!submitted && !status) {
    return shell(
      <section className="card">
        <p>Dotazník ještě není dokončený. Bez něj deník sestavit neumíme.</p>
        <Link className="btn btn-primary btn-block" href="/dotaznik">
          Dokončit dotazník
        </Link>
      </section>,
      'Ještě chybí dotazník'
    );
  }

  return shell(
    <>
      <section className="card">
        <p>
          Deník máme podle tvých odpovědí připravený — jen s poli, která k tvé otázce dávají smysl,
          a s volnou poznámkou na cokoli dalšího.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          Zaplacením si ho zpřístupníš a můžeš začít zapisovat ještě dnes.
        </p>
        <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={startCheckout} disabled={busy}>
          {busy ? 'Přesměrovávám…' : 'Zaplatit a zpřístupnit deník'}
        </button>
        <p className="hint">
          Jednorázová platba. Probíhá na zabezpečené stránce Stripe — údaje o kartě se k nám nedostanou.
          E-mail zadáš až tam a účet ti podle něj založíme.
        </p>
        <Msg text={message} error />
      </section>

      <section className="card">
        <p className="hint">{DISCLAIMER}</p>
        <p className="hint">
          Máš už účet? <Link href="/app/prihlaseni">Přihlas se</Link>.
        </p>
      </section>
    </>,
    'Tvůj deník je připravený',
    'Zbývá poslední krok'
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  try {
    const { DRAFT_COOKIE, draftIdFromCookie, getDraft } = await import('../../../lib/drafts');
    const draft = await getDraft(draftIdFromCookie(ctx.req.cookies[DRAFT_COOKIE]));
    // Přihlášený zákazník bez draftu se pozná až z /api/billing/status v prohlížeči.
    return { props: { submitted: Boolean(draft && !draft.accountId && draft.submittedAt) } };
  } catch (error) {
    console.error('stav dotazníku se nepodařilo načíst:', (error as Error).message);
    return { props: { submitted: false } };
  }
};
