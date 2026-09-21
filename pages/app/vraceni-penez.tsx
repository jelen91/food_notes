import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import { displayDate } from '../../components/analysis/AnalysisProgress';
import type {
  RefundOperation,
  RefundResponse,
  RefundStatus,
  WithdrawalReceipt,
} from '../../lib/refunds/types';

const STATUSES: RefundStatus[] = [
  'available',
  'unavailable',
  'processing',
  'pending',
  'succeeded',
  'failed',
  'review_required',
  'withdrawal_requested',
];
const isResponse = (value: any): value is RefundResponse =>
  Boolean(
    value &&
    STATUSES.includes(value.status) &&
    typeof value.accountEmail === 'string' &&
    typeof value.guarantee?.eligible === 'boolean' &&
    typeof value.canRequestWithdrawal === 'boolean' &&
    typeof value.withdrawalStatement === 'string'
  );

function saveReceipt(receipt: WithdrawalReceipt) {
  const text = [
    'Potvrzení přijetí odstoupení od smlouvy',
    `Potvrzení: ${receipt.reference}`,
    `Účet: ${receipt.accountEmail}`,
    `Přijato: ${receipt.acceptedAt}`,
    `Přijato (čas v Praze): ${displayDate(receipt.acceptedAt, true)}`,
    `Nákup uhrazen: ${receipt.paidAt ?? 'neuvedeno'}`,
    '',
    'Přijaté prohlášení:',
    receipt.statement,
    '',
    'Odstoupení od smlouvy bylo přijato. Vypořádání platby se posuzuje podle zákona.',
    'Toto potvrzení neznamená, že peníze již dorazily na tvůj účet.',
    `Stav potvrzovacího e-mailu: ${receipt.emailStatus === 'sent' ? 'odeslán' : receipt.emailStatus === 'pending' ? 'dosud nepotvrzen' : 'neodeslán'}`,
  ].join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `odstoupeni-${receipt.reference.replace(/[^a-z0-9-]/gi, '')}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const statusCopy: Record<RefundStatus, { title: string; text: string }> = {
  available: {
    title: 'Tři dny na rozhodnutí',
    text: 'Nesedl ti deník? V rámci garance ti vrátíme celou zaplacenou částku. Bez udání důvodu.',
  },
  unavailable: {
    title: 'Třídenní garance',
    text: 'Automatické vrácení v rámci garance teď pro tento nákup není dostupné. Tvoje případná zákonná práva tím nejsou dotčena.',
  },
  processing: {
    title: 'Požadavek je uložený',
    text: 'Ověřujeme zpracování vrácení peněz. Stránku můžeš znovu otevřít i později; nový požadavek zadávat nemusíš.',
  },
  pending: {
    title: 'Vrácení platby se zpracovává',
    text: 'Stripe přijal vrácení platby. Přístup k zapisování je pozastavený. Peníze ještě nemusí být připsané na tvém účtu.',
  },
  succeeded: {
    title: 'Vrácení celé platby je potvrzené',
    text: 'Stripe potvrdil vrácení celé zaplacené částky a přístup k zapisování skončil. Připsání peněz na tvůj účet závisí na bance.',
  },
  failed: {
    title: 'Vrácení peněz zatím není potvrzené',
    text: 'Tvůj původní požadavek zůstává uložený včetně času podání. O nárok včasným podáním nepřijdeš kvůli technické chybě.',
  },
  review_required: {
    title: 'Požadavek potřebuje dořešit',
    text: 'Tvůj požadavek je uložený a vyžaduje dořešení provozovatelem. Čas původního podání zůstává zachovaný; vrácení peněz zatím není potvrzené.',
  },
  withdrawal_requested: {
    title: 'Třídenní garance a tvůj nákup',
    text: 'Odstoupení od smlouvy jsme přijali. Potvrzení a podrobnosti najdeš níže.',
  },
};

export default function VraceniPenez() {
  const [data, setData] = useState<RefundResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authError, setAuthError] = useState(false);
  const [confirm, setConfirm] = useState<RefundOperation | null>(null);
  const [submitting, setSubmitting] = useState<RefundOperation | null>(null);
  const [pollPaused, setPollPaused] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const mounted = useRef(true);
  const postBusy = useRef(false);
  const readController = useRef<AbortController | null>(null);
  const postController = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const confirmHeading = useRef<HTMLHeadingElement | null>(null);
  const receiptHeading = useRef<HTMLHeadingElement | null>(null);

  const loadStatus = useCallback(async (): Promise<boolean> => {
    if (postBusy.current) return false;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    const sequence = ++requestSequence.current;
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    setLoading(true);
    try {
      const response = await fetch('/api/billing/refund', { cache: 'no-store', signal: controller.signal });
      const value = await response.json().catch(() => null);
      if (!mounted.current || sequence !== requestSequence.current) return false;
      if (response.status === 401) {
        setAuthError(true);
        throw new Error('Pro přehled svého nákupu se prosím znovu přihlas.');
      }
      if (!response.ok || !isResponse(value))
        throw new Error('Stav se teď nepodařilo ověřit. Zkus ho znovu načíst.');
      setData(value);
      setError('');
      setAuthError(false);
      setUncertain(false);
      return true;
    } catch (reason) {
      if (mounted.current && sequence === requestSequence.current) {
        setError(
          reason instanceof Error && reason.name !== 'AbortError'
            ? reason.message
            : 'Načítání trvá příliš dlouho. Obnov prosím stav.'
        );
      }
      return false;
    } finally {
      window.clearTimeout(timer);
      if (mounted.current && sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void loadStatus();
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
      readController.current?.abort();
      postController.current?.abort();
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!['processing', 'pending'].includes(data?.status) || submitting || pollPaused) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let checks = 0;
    const check = async () => {
      const success = await loadStatus();
      if (stopped) return;
      failures = success ? 0 : failures + 1;
      checks += 1;
      if (failures >= 3 || checks >= 12) {
        setPollPaused(true);
        return;
      }
      timer = setTimeout(check, 5000);
    };
    timer = setTimeout(check, 5000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [data?.status, submitting, pollPaused, loadStatus]);

  useEffect(() => {
    if (confirm) confirmHeading.current?.focus();
  }, [confirm]);

  const refresh = async () => {
    setPollPaused(false);
    await loadStatus();
  };
  const submit = async (operation: RefundOperation) => {
    if (postBusy.current || confirm !== operation || !data) return;
    if (operation === 'guarantee_refund' && !(data.guarantee.eligible || data.retryable)) return;
    if (operation === 'withdrawal_request' && !data.canRequestWithdrawal) return;
    postBusy.current = true;
    requestSequence.current += 1;
    readController.current?.abort();
    const controller = new AbortController();
    postController.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 70_000);
    setSubmitting(operation);
    setError('');
    setLoading(false);
    setUncertain(false);
    try {
      const response = await fetch('/api/billing/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ operation, ...(operation === 'withdrawal_request' ? { confirm: true } : {}) }),
      });
      const value = await response.json().catch(() => null);
      if (!mounted.current) return;
      if (!response.ok || !isResponse(value)) {
        if (response.status === 401) setAuthError(true);
        throw new Error(
          'Výsledek podání se zatím nepodařilo potvrdit. Nejdřív obnov stav; požadavek se mohl uložit.'
        );
      }
      setData(value);
      setConfirm(null);
      setPollPaused(false);
      if (operation === 'withdrawal_request' && value.withdrawalReceipt) {
        window.setTimeout(() => receiptHeading.current?.focus(), 0);
      }
    } catch (reason) {
      if (mounted.current) {
        setUncertain(true);
        setConfirm(null);
        setError(
          reason instanceof Error && reason.name !== 'AbortError'
            ? reason.message
            : 'Potvrzení trvá příliš dlouho. Obnov stav; požadavek se mohl uložit.'
        );
      }
    } finally {
      window.clearTimeout(timer);
      postBusy.current = false;
      if (mounted.current) setSubmitting(null);
    }
  };

  const canRefund = Boolean(
    data &&
      !authError &&
    (data.guarantee.eligible || data.retryable) &&
    !['pending', 'succeeded', 'processing', 'review_required'].includes(data.status)
  );
  const receipt = data?.withdrawalReceipt;
  const busy = Boolean(submitting);
  const copy = data ? statusCopy[data.status] : null;

  return (
    <AppShell
      title="Vrácení peněz a odstoupení"
      subtitle="Přehled tvého nákupu a jeho vyřízení."
      back={{ href: '/app/ucet', label: 'Účet a data' }}
    >
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <nav aria-label="Na této stránce" className="refund-nav">
        <a href="#garance">Třídenní garance</a>
        <a href="#odstoupeni">Odstoupení od smlouvy</a>
      </nav>
      {error && (
        <section className="card refund-notice" role="alert">
          <p>{error}</p>
          {uncertain && (
            <p className="hint">Obnovení stavu nic nového neodesílá a samo nespustí vrácení platby.</p>
          )}
          <div className="btns" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-ghost" onClick={refresh} disabled={busy || loading}>
              {loading ? 'Ověřuji…' : 'Obnovit stav'}
            </button>
            {authError && (
              <Link className="btn btn-primary" href="/app/prihlaseni">
                Přihlásit se
              </Link>
            )}
          </div>
        </section>
      )}

      <section className="card" id="garance" aria-labelledby="garance-title">
        <p className="refund-eyebrow">BEZ UDÁNÍ DŮVODU</p>
        <h2 id="garance-title">{copy?.title ?? 'Třídenní garance vrácení peněz'}</h2>
        {!data ? (
          <p className="muted" role="status">
            {loading ? 'Načítám tvůj nákup a dostupnost garance…' : 'Nejdřív potřebujeme ověřit tvůj nákup.'}
          </p>
        ) : (
          <>
            <p className="muted">{copy.text}</p>
            {data.guarantee.endsAt && (
              <p className="refund-date">
                Lhůta garance do <strong>{displayDate(data.guarantee.endsAt, true)}</strong>
                <br />
                <span className="hint">72 hodin od potvrzeného zaplacení · čas v Praze</span>
              </p>
            )}
            {data.requestedAt && (
              <p className="hint">
                Původní požadavek přijat: {displayDate(data.requestedAt, true)} · čas v Praze.
              </p>
            )}
            {data.status === 'failed' && !data.retryable && (
              <p className="hint">
                Vrácení platby potřebuje dořešit provozovatel. Původní podání zůstává evidované.
              </p>
            )}
            {['processing', 'pending'].includes(data.status) && (
              <p className="hint" role="status">
                {pollPaused
                  ? 'Průběžnou kontrolu jsme pozastavili. Stav můžeš obnovit ručně nebo se vrátit později.'
                  : 'Průběžně kontrolujeme stav. Obnovení stránky nezaloží další vrácení platby.'}
              </p>
            )}
            {['pending', 'succeeded'].includes(data.status) && (
              <p className="hint">
                Na stažení svých uložených dat máš 30 dní od odebrání přístupu. Přesné datum najdeš v{' '}
                <Link href="/app/ucet">účtu a datech</Link>.
              </p>
            )}
            {confirm === 'guarantee_refund' ? (
              <div className="refund-confirm">
                <h3 tabIndex={-1} ref={confirmHeading}>
                  Opravdu chceš vrátit celou platbu?
                </h3>
                <p>
                  Po přijetí vrácení platby poskytovatelem se přístup k zapisování ukončí. Tvoje záznamy bude
                  ještě 30 dní možné stáhnout.
                </p>
                <p className="hint">
                  Můžeš si je <Link href="/app/ucet">stáhnout už teď</Link>. Zpět odešleme skutečně zaplacenou
                  částku stejnou platební cestou.
                </p>
                <div className="stack" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn btn-danger btn-block"
                    disabled={busy || !canRefund}
                    onClick={() => submit('guarantee_refund')}
                  >
                    {submitting === 'guarantee_refund'
                      ? 'Odesílám požadavek…'
                      : 'Potvrdit vrácení celé platby'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-block"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                  >
                    Zrušit
                  </button>
                </div>
              </div>
            ) : (
              canRefund &&
              !uncertain && (
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 16 }}
                  disabled={busy}
                  onClick={() => setConfirm('guarantee_refund')}
                >
                  {data.retryable ? 'Znovu zkusit uložený požadavek' : 'Vrátit peníze v rámci garance'}
                </button>
              )
            )}
            {!confirm && !canRefund && (
              <button
                type="button"
                className="btn btn-ghost btn-block"
                style={{ marginTop: 14 }}
                disabled={busy || loading}
                onClick={refresh}
              >
                {loading ? 'Ověřuji…' : 'Obnovit stav platby'}
              </button>
            )}
          </>
        )}
        <p className="hint" style={{ marginTop: 16 }}>
          Třídenní garance je dobrovolná výhoda navíc. Neomezuje tvoje zákonná práva, včetně práva na
          odstoupení od smlouvy, je-li dáno.
        </p>
      </section>

      <section className="card" id="odstoupeni" aria-labelledby="odstoupeni-title">
        <p className="refund-eyebrow">SAMOSTATNÉ ZÁKONNÉ PRÁVO</p>
        <h2 id="odstoupeni-title">Odstoupení od smlouvy</h2>
        <p className="muted">
          Tady můžeš odeslat prohlášení, že odstupuješ od smlouvy. Třídenní garance tuto možnost neomezuje.
          Podmínky a vypořádání platby se posuzují podle zákona.
        </p>
        {receipt ? (
          <div className="refund-receipt" role="status">
            <h3 tabIndex={-1} ref={receiptHeading}>
              Odstoupení od smlouvy přijato
            </h3>
            <p>
              Prohlášení jsme uložili. Toto potvrzení znamená přijetí odstoupení; neznamená, že peníze už byly
              vrácené.
            </p>
            <dl className="refund-details">
              <div>
                <dt>Potvrzení</dt>
                <dd>{receipt.reference}</dd>
              </div>
              <div>
                <dt>Účet</dt>
                <dd>{receipt.accountEmail}</dd>
              </div>
              <div>
                <dt>Přijato</dt>
                <dd>{displayDate(receipt.acceptedAt, true)} · čas v Praze</dd>
              </div>
              <div>
                <dt>Nákup uhrazen</dt>
                <dd>{receipt.paidAt ? displayDate(receipt.paidAt, true) : 'Datum není k dispozici'}</dd>
              </div>
            </dl>
            <details>
              <summary>Přijaté prohlášení</summary>
              <p className="refund-statement">{receipt.statement}</p>
            </details>
            <p className="hint">
              {receipt.emailStatus === 'sent'
                ? `Potvrzení jsme odeslali na ${receipt.accountEmail}. Pro jistotu si ho můžeš také stáhnout.`
                : receipt.emailStatus === 'pending'
                  ? 'Odeslání potvrzovacího e-mailu zatím není potvrzené. Potvrzení si stáhni níže.'
                  : 'Potvrzovací e-mail se nepodařilo odeslat. Odstoupení je přesto přijaté; potvrzení si stáhni níže.'}
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => saveReceipt(receipt)}>
              Stáhnout potvrzení odstoupení (.txt)
            </button>
          </div>
        ) : confirm === 'withdrawal_request' && data ? (
          <div className="refund-confirm">
            <h3 tabIndex={-1} ref={confirmHeading}>
              Potvrzení odstoupení od smlouvy
            </h3>
            <dl className="refund-details">
              <div>
                <dt>Účet</dt>
                <dd>{data.accountEmail}</dd>
              </div>
              <div>
                <dt>Nákup uhrazen</dt>
                <dd>
                  {data.paidAt ? displayDate(data.paidAt, true) : 'Datum není k dispozici'}
                  {data.paidAt && ' · čas v Praze'}
                </dd>
              </div>
            </dl>
            <p className="refund-statement">{data.withdrawalStatement}</p>
            <p className="hint">
              Kliknutím níže odešleš toto odstoupení. Přijetí se uloží s datem a časem a dostaneš potvrzení ke
              stažení. Odeslání je právní prohlášení o odstoupení od smlouvy.
            </p>
            <div className="stack" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-danger btn-block"
                disabled={busy || !data.canRequestWithdrawal}
                onClick={() => submit('withdrawal_request')}
              >
                {submitting === 'withdrawal_request' ? 'Odesílám odstoupení…' : 'Potvrdit odstoupení'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Zrušit
              </button>
            </div>
          </div>
        ) : data?.canRequestWithdrawal && !uncertain ? (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            style={{ marginTop: 16 }}
            disabled={busy}
            onClick={() => setConfirm('withdrawal_request')}
          >
            Odstoupit od smlouvy
          </button>
        ) : (
          <p className="hint">
            {!data
              ? 'Po ověření účtu se zobrazí možnost odstoupení pro tvůj nákup.'
              : uncertain
                ? 'Nejdřív obnov stav, abys zjistil, zda už bylo odstoupení přijato.'
                : 'K tomuto účtu teď nemáme nákup, pro který lze odeslat toto prohlášení.'}
          </p>
        )}
        <p className="hint" style={{ marginTop: 16 }}>
          Podrobnosti najdeš v <Link href="/podminky#odstoupeni">podmínkách odstoupení od smlouvy</Link>.
        </p>
      </section>

      <div className="stack" style={{ marginBottom: 24 }}>
        <Link className="btn btn-ghost btn-block" href="/app/ucet">
          Zpět do účtu a k exportu dat
        </Link>
      </div>
      <style jsx>{`
        .refund-nav {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 20px;
          margin: 0 0 22px;
          font-size: 0.86rem;
        }
        .refund-eyebrow {
          margin: 0 0 10px;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: var(--muted);
        }
        .refund-date {
          margin-top: 18px;
          padding: 14px 0;
          border-top: 1px solid var(--rule-soft);
          border-bottom: 1px solid var(--rule-soft);
          font-size: 0.9rem;
        }
        .refund-confirm,
        .refund-receipt {
          margin-top: 18px;
          padding: 18px;
          border: 1px solid var(--rule);
          border-radius: 12px;
          background: var(--paper);
        }
        .refund-confirm h3,
        .refund-receipt h3 {
          margin: 0 0 12px;
        }
        .refund-confirm p,
        .refund-receipt p {
          line-height: 1.65;
        }
        .refund-notice {
          border-color: #a78050;
        }
        .refund-details {
          display: grid;
          gap: 12px;
          margin: 18px 0;
        }
        .refund-details dt {
          color: var(--muted);
          font-size: 0.76rem;
        }
        .refund-details dd {
          margin: 3px 0 0;
          font-size: 0.9rem;
          font-weight: 600;
          overflow-wrap: anywhere;
        }
        .refund-statement {
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          margin-top: 14px;
          padding-left: 14px;
          border-left: 3px solid var(--rule);
        }
        summary {
          cursor: pointer;
          font-weight: 600;
          font-size: 0.86rem;
        }
        section[id] {
          scroll-margin-top: 24px;
        }
        @media (max-width: 480px) {
          .refund-confirm,
          .refund-receipt {
            padding: 14px;
          }
        }
      `}</style>
    </AppShell>
  );
}
