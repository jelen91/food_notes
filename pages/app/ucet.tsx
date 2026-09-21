import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell, { Disclaimer } from '../../components/AppShell';
import { Field, Msg } from '../../components/ui';
import { displayDate } from '../../components/analysis/AnalysisProgress';
import { PURCHASE_POLICY_VERSION } from '../../lib/purchase-policy';

interface Status {
  account: { email: string; emailVerified: boolean; onboarding: string };
  billing: {
    access: boolean;
    kind: string | null;
    paidAt: string | null;
    purchasePolicyVersion?: string | null;
    accessUntil?: string | null;
    refundUntil?: string | null;
    exportUntil?: string | null;
    expired?: boolean;
    exportAvailable?: boolean;
  };
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default function Ucet() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayIso());
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/billing/status', { cache: 'no-store' });
        if (res.status === 401) {
          router.push('/app/prihlaseni');
          return;
        }
        if (!res.ok) throw new Error('status');
        setStatus(await res.json());
      } catch {
        setStatusError('Stav přístupu se nepodařilo načíst. Obnov prosím stránku.');
      }
    })();
  }, [router]);

  const fixedTerm = status?.billing.purchasePolicyVersion === PURCHASE_POLICY_VERSION;
  const exportAvailable = status?.billing.exportAvailable ?? status?.billing.access ?? false;

  const exportUrl = (preview = false) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (preview) params.set('preview', '1');
    const query = params.toString();
    return `/api/tracker-export${query ? `?${query}` : ''}`;
  };

  const deleteAccount = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.error || 'Smazání se nepodařilo.');
        return;
      }
      router.push('/');
    } catch {
      setIsError(true);
      setMessage('Síťová chyba. Zkus to prosím znovu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Účet a data">
      <section className="card">
        <h2>Účet</h2>
        {!status ? (
          <p className="muted" role={statusError ? 'alert' : 'status'}>
            {statusError || 'Načítám…'}
          </p>
        ) : (
          <div className="grid2">
            <div className="stat">
              <div className="k">E-mail</div>
              <div className="v" style={{ fontSize: '0.9rem', wordBreak: 'break-all' }}>
                {status.account.email}
              </div>
            </div>
            <div className="stat">
              <div className="k">Přístup</div>
              <div className="v">{status.billing.access ? 'aktivní' : 'neaktivní'}</div>
            </div>
          </div>
        )}
        {status && fixedTerm && (
          <div style={{ marginTop: 16 }}>
            <h3>
              {status.billing.expired
                ? 'Zaplacená doba přístupu skončila'
                : status.billing.access
                  ? 'Tvůj přístup na 12 měsíců'
                  : 'Přehled zakoupeného přístupu'}
            </h3>
            <p className="muted">
              Jednorázová platba, bez automatického prodlužování a dalších pravidelných plateb.
            </p>
            <dl className="stack" style={{ marginTop: 12 }}>
              <div>
                <dt>
                  {!status.billing.access && !status.billing.expired
                    ? 'Původní platnost přístupu do'
                    : 'Platnost přístupu do'}
                </dt>
                <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>
                  {displayDate(status.billing.accessUntil, true)}
                </dd>
              </div>
              <div>
                <dt>Lhůta třídenní garance vrácení peněz do</dt>
                <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>
                  {displayDate(status.billing.refundUntil, true)}
                </dd>
              </div>
              <div>
                <dt>Stažení uložených dat do</dt>
                <dd style={{ margin: '4px 0 0', fontWeight: 600 }}>
                  {displayDate(status.billing.exportUntil, true)}
                </dd>
              </div>
            </dl>
            <p className="hint">
              Časy jsou uvedené pro Prahu. Po skončení přístupu už nelze zapisovat ani spustit nové AI
              vyhodnocení. Na stažení dat máš dalších 30 dní; při vrácení peněz se lhůta počítá od odebrání
              přístupu.
            </p>
          </div>
        )}
        {status?.billing.kind === 'purchase' && !status.billing.access && (
          <p className="muted" role="status" style={{ marginTop: 12 }}>
            {status.billing.expired
              ? 'Placený přístup již není aktivní.'
              : 'Přístup k zapisování není aktivní; podrobnosti o vrácení platby najdeš níže.'}{' '}
            {exportAvailable
              ? `Uložené záznamy si můžeš stáhnout do ${displayDate(status.billing.exportUntil, true)}.`
              : 'Lhůta pro stažení dat už není aktivní.'}
          </p>
        )}
        <div className="stack" style={{ marginTop: 12 }}>
          {(status?.billing.access || exportAvailable) && (
            <Link className="btn btn-primary btn-block" href="/app/vyhodnoceni">
              Můj AI přehled a jeho stažení
            </Link>
          )}
          <Link className="btn btn-ghost btn-block" href="/app/vraceni-penez">
            Garance vrácení peněz a stav žádosti
          </Link>
          <Link className="btn btn-ghost btn-block" href="/app/vraceni-penez#odstoupeni">
            Odstoupit od smlouvy
          </Link>
          <Link className="btn btn-ghost btn-block" href="/podminky">
            Podmínky nákupu a přístupu
          </Link>
          {status && !status.billing.kind && (
            <Link className="btn btn-ghost btn-block" href="/app/platba">
              Platba a přístup
            </Link>
          )}
          {status?.billing.access && (
            <Link className="btn btn-ghost btn-block" href="/app/denik">
              Zpět do deníku
            </Link>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Stažení záznamů</h2>
        <p className="muted">
          Dokument obsahuje tvoje záznamy ve zvoleném období. Stáhne se k tobě — nikam ho neposíláme. Co s ním
          uděláš dál, je jen na tobě.
        </p>
        {exportAvailable ? (
          <>
            <div className="row" style={{ marginTop: 12 }}>
              <Field label="Od">
                <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Do">
                <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            <div className="stack" style={{ marginTop: 12 }}>
              <a className="btn btn-accent btn-block" href={exportUrl()} download>
                Stáhnout (.md)
              </a>
              <a className="btn btn-ghost btn-block" href={exportUrl(true)} target="_blank" rel="noreferrer">
                Náhled
              </a>
            </div>
            <p className="hint">Prázdné pole „Od“ znamená všechny záznamy od začátku.</p>
          </>
        ) : (
          <p className="hint">
            {status ? 'Export pro tento účet právě není dostupný.' : 'Nejdřív ověřujeme dostupnost exportu.'}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Smazání účtu</h2>
        <p className="muted">Smaže se:</p>
        <ul className="muted" style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>všechny denní záznamy a laboratorní výsledky,</li>
          <li>odpovědi z dotazníku a všechny verze deníku,</li>
          <li>uložené AI vyhodnocení a souhlas s jeho zpracováním,</li>
          <li>šifrovací klíč tvých dat — tím se stanou nečitelnými i případné kopie v zálohách.</li>
        </ul>
        <p className="muted" style={{ marginTop: 10 }}>
          Zůstanou doklady o zaplacení, protože je účetnictví musí uchovávat. Nejsou v nich žádné údaje o
          zdraví ani obsah deníku. Přihlášení po smazání už nebude fungovat.
        </p>
        <p className="hint">Než účet smažeš, můžeš si výše stáhnout své záznamy.</p>

        {!confirm ? (
          <button
            className="btn btn-danger btn-block"
            style={{ marginTop: 12 }}
            onClick={() => setConfirm(true)}
          >
            Chci smazat účet
          </button>
        ) : (
          <div className="stack" style={{ marginTop: 12 }}>
            <Field label="Pro potvrzení zadej heslo">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="btns">
              <button className="btn btn-danger" disabled={busy || !password} onClick={deleteAccount}>
                {busy ? 'Mažu…' : 'Nevratně smazat'}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(false)}>
                Zrušit
              </button>
            </div>
          </div>
        )}
        <Msg text={message} error={isError} />
      </section>

      <section className="card">
        <Disclaimer />
      </section>
    </AppShell>
  );
}
