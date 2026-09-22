import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell, { Disclaimer } from '../../components/AppShell';
import AnalysisProgress from '../../components/analysis/AnalysisProgress';
import { displayDate } from '../../components/analysis/AnalysisProgress';

interface Status {
  account: { email: string; emailVerified: boolean; onboarding: string; slug: string | null };
  billing: {
    access: boolean;
    kind?: string | null;
    accessUntil?: string | null;
    expired?: boolean;
    exportAvailable?: boolean;
    exportUntil?: string | null;
  };
  next: string;
}

/** Popis stavu onboardingu pro uživatele. Zdrojem je vždy server, ne navigace v prohlížeči. */
const POPIS: Record<string, { nadpis: string; text: string; akce?: string }> = {
  unpaid: {
    nadpis: 'Zbývá zaplatit',
    text: 'Přístup k deníku se odemkne po zaplacení.',
    akce: 'Přejít k platbě',
  },
  checkout_started: {
    nadpis: 'Platba spuštěna',
    text: 'Pokud jsi platbu nedokončil, můžeš ji spustit znovu.',
    akce: 'Zobrazit platbu',
  },
  payment_pending: {
    nadpis: 'Platba se zpracovává',
    text: 'Jakmile ji brána potvrdí, přístup se aktivuje sám.',
    akce: 'Zobrazit stav',
  },
  paid: {
    nadpis: 'Připraveno k dotazníku',
    text: 'Pověz nám, co tě trápí a čemu chceš lépe porozumět. Podle odpovědí ti AI navrhne deník na míru.',
    akce: 'Vyplnit dotazník',
  },
  questionnaire_completed: {
    nadpis: 'Dotazník odeslán',
    text: 'Tvoje odpovědi jsou připravené. Teď z nich může AI sestavit osobní deník pro tvoje pozorování.',
    akce: 'Pokračovat',
  },
  tracker_queued: {
    nadpis: 'Deník se připravuje',
    text: 'Sestavení obvykle trvá krátce.',
    akce: 'Zobrazit průběh',
  },
  tracker_generating: {
    nadpis: 'Deník se připravuje',
    text: 'Sestavení obvykle trvá krátce.',
    akce: 'Zobrazit průběh',
  },
  tracker_failed: { nadpis: 'Sestavení se nepovedlo', text: 'Zkus to prosím znovu.', akce: 'Zkusit znovu' },
  tracker_ready: {
    nadpis: 'Tvůj deník je připravený',
    text: 'Začni dneškem. Každý zapsaný den pomáhá vytvořit ucelenější obrázek o tom, jak se cítíš.',
    akce: 'Otevřít deník',
  },
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

  const endedPurchase = status?.billing.kind === 'purchase' && !status.billing.access;
  const popis = endedPurchase
    ? {
        nadpis: status.billing.expired ? 'Zaplacená doba přístupu skončila' : 'Přístup k deníku není aktivní',
        text: status.billing.exportAvailable
          ? `Uložené záznamy si můžeš stáhnout do ${displayDate(status.billing.exportUntil, true)}. Další platba se automaticky nestrhne.`
          : 'Stav přístupu, žádosti o vrácení peněz a správu dat najdeš ve svém účtu.',
        akce: 'Otevřít účet a data',
      }
    : status
      ? (POPIS[status.account.onboarding] ?? POPIS.unpaid)
      : null;

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
              <button
                className="btn btn-primary btn-block"
                style={{ marginTop: 12 }}
                onClick={() => router.push(endedPurchase ? '/app/ucet' : status.next)}
              >
                {popis.akce}
              </button>
            )}
            {status.billing.access && status.billing.accessUntil && (
              <p className="hint" style={{ marginTop: 12 }}>
                Přístup do {displayDate(status.billing.accessUntil, true)} · bez automatického prodloužení.
              </p>
            )}
            {!status.account.emailVerified && (
              <p className="hint" style={{ marginTop: 10 }}>
                E-mail zatím není ověřený. Odkaz na ověření jsme poslali při registraci.
              </p>
            )}
          </>
        )}
      </section>

      {status?.billing.access && <AnalysisProgress />}

      <section className="card">
        <h2>Účet</h2>
        <div className="stack">
          <Link className="btn btn-ghost btn-block" href="/app/ucet">
            Účet, export a mazání dat
          </Link>
          <Link className="btn btn-ghost btn-block" href="/app/vraceni-penez">
            Vrácení peněz nebo odstoupení od smlouvy
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
