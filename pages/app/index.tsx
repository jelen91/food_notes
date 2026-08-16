import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell, { Disclaimer } from '../../components/AppShell';

interface Status {
  account: { email: string; emailVerified: boolean; onboarding: string; slug: string | null };
  billing: { access: boolean };
  next: string;
}

/** Popis stavu onboardingu pro uživatele. Zdrojem je vždy server, ne navigace v prohlížeči. */
const POPIS: Record<string, { nadpis: string; text: string; akce?: string }> = {
  unpaid: { nadpis: 'Zbývá zaplatit', text: 'Přístup k deníku se odemkne po zaplacení.', akce: 'Přejít k platbě' },
  checkout_started: { nadpis: 'Platba spuštěna', text: 'Pokud jsi platbu nedokončil, můžeš ji spustit znovu.', akce: 'Zobrazit platbu' },
  payment_pending: { nadpis: 'Platba se zpracovává', text: 'Jakmile ji brána potvrdí, přístup se aktivuje sám.', akce: 'Zobrazit stav' },
  paid: { nadpis: 'Připraveno k dotazníku', text: 'Vyplněním krátkého dotazníku vznikne deník na míru.', akce: 'Vyplnit dotazník' },
  questionnaire_completed: { nadpis: 'Dotazník odeslán', text: 'Můžeš spustit sestavení deníku.', akce: 'Pokračovat' },
  tracker_queued: { nadpis: 'Deník se připravuje', text: 'Sestavení obvykle trvá krátce.', akce: 'Zobrazit průběh' },
  tracker_generating: { nadpis: 'Deník se připravuje', text: 'Sestavení obvykle trvá krátce.', akce: 'Zobrazit průběh' },
  tracker_failed: { nadpis: 'Sestavení se nepovedlo', text: 'Zkus to prosím znovu.', akce: 'Zkusit znovu' },
  tracker_ready: { nadpis: 'Deník je připravený', text: 'Můžeš začít zapisovat.', akce: 'Otevřít deník' },
};

export default function AppHome() {
  const [status, setStatus] = useState<Status | null>(null);
  const [chyba, setChyba] = useState('');
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/billing/status');
        if (!res.ok) {
          router.push('/app/prihlaseni');
          return;
        }
        setStatus(await res.json());
      } catch {
        setChyba('Stav se nepodařilo načíst.');
      }
    })();
  }, [router]);

  const popis = status ? POPIS[status.account.onboarding] ?? POPIS.unpaid : null;

  return (
    <AppShell title="Můj účet">
      <section className="card">
        {!status ? (
          <p className="muted">{chyba || 'Načítám…'}</p>
        ) : (
          <>
            <h2>{popis?.nadpis}</h2>
            <p className="muted">{popis?.text}</p>
            {popis?.akce && (
              <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => router.push(status.next)}>
                {popis.akce}
              </button>
            )}
            {!status.account.emailVerified && (
              <p className="hint" style={{ marginTop: 10 }}>
                E-mail zatím není ověřený. Odkaz na ověření jsme poslali při registraci.
              </p>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Účet</h2>
        <div className="stack">
          <Link className="btn btn-ghost btn-block" href="/app/ucet">
            Účet, export a mazání dat
          </Link>
          <button
            className="btn btn-ghost btn-block"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              window.location.href = '/app/prihlaseni';
            }}
          >
            Odhlásit
          </button>
        </div>
        <hr className="divider" />
        <Disclaimer />
      </section>
    </AppShell>
  );
}
