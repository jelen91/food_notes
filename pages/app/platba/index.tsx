import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { GetServerSideProps } from 'next';
import { DISCLAIMER, TopBar } from '../../../components/AppShell';
import { Msg } from '../../../components/ui';
import type { PublicOffer } from '../../../lib/offer';
import { PURCHASE_POLICY_VERSION } from '../../../lib/purchase-policy';
import { IMMEDIATE_SERVICE_REQUEST } from '../../../lib/purchase-consent';
import { BRAND, brandTitle } from '../../../lib/brand';

interface Status {
  account: { email: string; onboarding: string };
  billing: { access: boolean; paidAt: string | null; kind?: string | null };
  next: string;
}

interface Props {
  submitted: boolean;
  signedIn: boolean;
  summary: Array<{ label: string; value: string }>;
  offer: PublicOffer;
}

export default function Platba({ submitted, signedIn, summary, offer }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [immediateService, setImmediateService] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!signedIn) return;
    fetch('/api/billing/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setStatus(s))
      .catch(() => undefined);
  }, [signedIn]);

  const startCheckout = async () => {
    if (!offer.available || !offer.priceLabel || !acceptedTerms || !immediateService) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchasePolicyVersion: PURCHASE_POLICY_VERSION,
          acceptedTerms,
          requestImmediateService: immediateService,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setMessage(data.error || 'Platbu se nepodařilo spustit.');
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
        <title>{brandTitle(title)}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content={BRAND.themeColor} />
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

  if (status?.billing.kind)
    return shell(
      <section className="card">
        <p>Na tomto účtu už je evidovaný přístup. Jeho stav, export a vrácení peněz najdeš ve svém účtu.</p>
        <Link className="btn btn-primary" href="/app/ucet">
          Přejít do účtu
        </Link>
      </section>,
      'Tvůj přístup'
    );

  if (!submitted && !signedIn) {
    return shell(
      <section className="card">
        <p>Nejdřív potřebujeme dokončit dotazník, podle kterého tvůj deník sestavíme.</p>
        <Link className="btn btn-primary btn-block" href="/dotaznik">
          Pokračovat k dotazníku
        </Link>
        <p className="hint">
          Pokud už máš zaplaceno, <Link href="/app/prihlaseni">přihlas se</Link>.
        </p>
      </section>,
      'Začneme tvou otázkou'
    );
  }

  return shell(
    <>
      <section className="card">
        <h2>{submitted ? 'Tvoje zadání pro deník' : 'Osobní deník pozorování'}</h2>
        {summary.length > 0 ? (
          summary.map((item) => (
            <div key={item.label} style={{ borderTop: '1px solid var(--rule-soft)', padding: '12px 0' }}>
              <div className="hint" style={{ marginTop: 0 }}>
                {item.label}
              </div>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.value}</p>
            </div>
          ))
        ) : (
          <p className="muted">
            Po zaplacení vyplníš krátký dotazník. Podle odpovědí sestavíme pole pro tvůj deník.
          </p>
        )}
        {submitted && (
          <Link className="btn btn-ghost btn-sm" href="/dotaznik">
            Upravit odpovědi
          </Link>
        )}
        <p className="hint" style={{ marginTop: 12 }}>
          Tohle je shrnutí zadání. Osobní deník sestavíme až po potvrzení platby.
        </p>
      </section>

      <section className="card">
        <h2>Co získáš</h2>
        <ul className="muted" style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li>Deník navržený AI podle tvých potíží, běžného dne a času na zapisování.</li>
          <li>Srozumitelné vysvětlení, co sledovat a proč to může být užitečné.</li>
          <li>Rychlé poznámky s časem a záznamy událostí během dne.</li>
          <li>
            12 měsíců zapisování, prohlížení starších dnů a exportu. Potom ještě 30 dní na stažení záznamů.
          </li>
          <li>
            Jedno osobní AI vyhodnocení: souvislosti v zápisech, možná vysvětlení a další kroky k pozorování
            či konzultaci.
          </li>
          <li>Šifrované uložení dat a možnost smazání účtu.</li>
        </ul>
        <p className="hint">
          Vyhodnocení si spustíš sám po 21 dnech od zaplacení a alespoň 21 různých dnech se záznamem od
          platby. Můžeš zapisovat i déle. Jedno úspěšně uložené vyhodnocení je v ceně; pozdější zápisy ho
          nemění. AI hledá podněty k ověření, neurčuje diagnózu ani léčbu.
        </p>
      </section>

      <section className="card">
        <h2>{offer.available && offer.priceLabel ? offer.priceLabel : 'Objednávka je dočasně nedostupná'}</h2>
        {offer.available && offer.priceLabel ? (
          <>
            <p className="muted">Jednorázově za 12 měsíců od zaplacení. Bez automatického obnovení.</p>
            <div
              style={{
                background: 'var(--accent-light, #eef4ed)',
                borderRadius: 12,
                padding: 18,
                marginTop: 16,
              }}
            >
              <h3>3 dny na vyzkoušení. Nebo celá cena zpět.</h3>
              <p>
                Nech si sestavit deník a vyzkoušej první zápisy. Pokud ti nesedne, do 72 hodin od platby
                požádej v účtu o vrácení celé ceny. Bez udání důvodu, i když už jsi deník použil.
              </p>
              <p className="hint" style={{ color: '#4d594b' }}>
                AI vyhodnocení se odemyká nejdříve po 21 dnech; během garance zkoušíš sestavení a používání
                deníku. Třídenní garance neomezuje zákonná práva.
              </p>
              <Link href="/podminky#vraceni-penez">Podrobnosti garance a odstoupení</Link>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 20 }}>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                style={{ width: 18, minWidth: 18, marginTop: 4 }}
              />
              <span>
                Souhlasím s{' '}
                <Link href="/podminky" target="_blank" rel="noreferrer">
                  podmínkami přístupu a vrácení peněz
                </Link>
                . Objednávám přístup na 12 měsíců za {offer.priceLabel} bez automatického obnovení.
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16 }}>
              <input
                type="checkbox"
                checked={immediateService}
                onChange={(e) => setImmediateService(e.target.checked)}
                style={{ width: 18, minWidth: 18, marginTop: 4 }}
              />
              <span>{IMMEDIATE_SERVICE_REQUEST}</span>
            </label>
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              onClick={startCheckout}
              disabled={busy || !acceptedTerms || !immediateService || (signedIn && !status)}
            >
              {busy ? 'Přesměrovávám…' : `Pokračovat k platbě · ${offer.priceLabel}`}
            </button>
            <p className="hint">
              Platba probíhá na zabezpečené stránce Stripe. Údaje o kartě se k nám nedostanou.
              {!signedIn && ' E-mail zadáš tam; po platbě ti pošleme odkaz pro nastavení hesla.'}
            </p>
          </>
        ) : (
          <>
            <p className="muted">
              Cenu se teď nepodařilo ověřit. Odpovědi zůstávají uložené, můžeš se k nim vrátit v tomto
              prohlížeči.
            </p>
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 12 }}
              onClick={() => window.location.reload()}
            >
              Zkusit načíst cenu znovu
            </button>
          </>
        )}
        <Msg text={message} error />
      </section>
      <section className="card">
        <p className="hint">{DISCLAIMER}</p>
        <p className="hint">
          Máš už účet? <Link href="/app/prihlaseni">Přihlas se</Link>.
        </p>
      </section>
    </>,
    'Shrnutí a cena',
    'Než se rozhodneš, tady je přesně to, co objednáváš.'
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  ctx.res.setHeader('Cache-Control', 'private, no-store');
  const { getPublicOffer } = await import('../../../lib/offer');
  const offerPromise = getPublicOffer();
  let submitted = false;
  let signedIn = false;
  let summary: Props['summary'] = [];
  try {
    const { DRAFT_COOKIE, draftIdFromCookie, getDraft } = await import('../../../lib/drafts');
    const { ACCOUNT_COOKIE, verifyAccountSession } = await import('../../../lib/session');
    const { findAccountById } = await import('../../../lib/accounts');
    const { getQuestionnaire } = await import('../../../lib/tracker/store');
    const { getTenantSecrets } = await import('../../../lib/store');
    const session = await verifyAccountSession(
      process.env.AUTH_SECRET || '',
      ctx.req.cookies[ACCOUNT_COOKIE]
    );
    const account = session ? await findAccountById(session.a) : null;
    signedIn = Boolean(account && account.status !== 'deleted');
    const draft = await getDraft(draftIdFromCookie(ctx.req.cookies[DRAFT_COOKIE]));
    const tenantId = signedIn ? account?.tenantId : draft && !draft.accountId ? draft.tenantId : null;
    if (tenantId) {
      const secrets = await getTenantSecrets(tenantId);
      if (secrets) {
        const record = await getQuestionnaire(tenantId, secrets.dek);
        submitted = Boolean(record.submittedAt);
        const labels: Record<string, string> = {
          hlavni_otazka: 'Co chceš pozorovat',
          cas_denne: 'Čas na denní zápis',
          detail: 'Podrobnost deníku',
        };
        summary = Object.entries(labels).flatMap(([key, label]) => {
          const value = record.answers?.[key];
          return value ? [{ label, value: Array.isArray(value) ? value.join(', ') : value }] : [];
        });
      }
    }
  } catch {
    // A failed lookup never fabricates a completed questionnaire or reveals internal errors.
  }
  return { props: { submitted, signedIn, summary, offer: await offerPromise } };
};
