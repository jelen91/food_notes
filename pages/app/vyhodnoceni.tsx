import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import AppShell from '../../components/AppShell';
import { useJournalAnalysis } from '../../components/analysis/useJournalAnalysis';
import { displayDate, ProgressMeters } from '../../components/analysis/AnalysisProgress';
import AnalysisReportView from '../../components/analysis/AnalysisReportView';
import Icon from '../../components/marketing/Icon';

export default function Vyhodnoceni() {
  const { data, loading, error, submitting, pollStopped, refresh, start } = useJournalAnalysis();
  const [consent, setConsent] = useState(false);
  useEffect(() => setConsent(false), [data?.consentVersion]);
  const canStart = Boolean(
    data?.eligibility.eligible && (data.status === 'ready' || (data.status === 'failed' && data.retryable))
  );
  const accessUnavailable = data?.status === 'locked' && Boolean(data.error);
  return (
    <div className="analysis-page">
      <AppShell
        title="Můj AI přehled"
        subtitle="Z tvých vlastních pozorování k dalšímu směru"
        back={{ href: '/app/ucet', label: 'Účet a data' }}
      >
        <Head>
          <title>Můj AI přehled | Deník pozorování</title>
          <meta name="robots" content="noindex, nofollow" />
        </Head>
        {error && (
          <section className="card analysis-notice no-print" role="alert">
            <p>{error}</p>
            <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={submitting || loading}>
              Zkontrolovat stav
            </button>
            <Link href="/app/prihlaseni">Přihlášení</Link>
          </section>
        )}
        {!data && !error && (
          <section className="card">
            <p className="muted" role="status">
              Načítám tvé záznamy a stav vyhodnocení…
            </p>
          </section>
        )}
        {accessUnavailable ? (
          <section className="card analysis-notice" role="status">
            <h2>Vyhodnocení teď není dostupné</h2>
            <p>{data.error}</p>
            <Link className="btn btn-primary btn-block" href="/app/ucet">
              Zobrazit přístup a dostupný export
            </Link>
          </section>
        ) : data?.status === 'completed' && data.report ? (
          <AnalysisReportView data={data} />
        ) : (
          data && (
            <>
              <section className="card analysis-hero-card">
                <span className="analysis-symbol">
                  <Icon name="leaf" size={30} />
                </span>
                <p className="analysis-eyebrow">JEDNO OSOBNÍ VYHODNOCENÍ V CENĚ</p>
                <h2>
                  Nejen další zápis.
                  <br />
                  Nový pohled na tvé dny.
                </h2>
                <p className="muted">
                  AI projde tvá pozorování v čase, pojmenuje opakující se souvislosti a navrhne, co má smysl
                  dál sledovat nebo probrat při konzultaci. U každého směru ukáže i nejistoty.
                </p>
                <div className="analysis-outcomes">
                  <span>
                    <Icon name="book" size={17} /> Souvislosti s konkrétními záznamy
                  </span>
                  <span>
                    <Icon name="note" size={17} /> Možná vysvětlení k ověření
                  </span>
                  <span>
                    <Icon name="arrow" size={17} /> Další pozorování a otázky pro lékaře
                  </span>
                </div>
              </section>
              {data.status === 'generating' ? (
                <section className="card analysis-running" aria-live="polite">
                  <span className="analysis-spinner" aria-hidden="true" />
                  <h2>AI prochází tvé záznamy</h2>
                  <p>
                    Vyhodnocení může trvat několik minut. Kontrolujeme jeho stav; stránku můžeš znovu otevřít
                    i později.
                  </p>
                  <p className="hint">
                    Nárok se využije až úspěšným uložením hotového přehledu. Obnovením stránky se další rozbor
                    nespustí.
                  </p>
                  {pollStopped && (
                    <button className="btn btn-primary" onClick={refresh}>
                      Obnovit kontrolu stavu
                    </button>
                  )}
                </section>
              ) : (
                <section className="card analysis-readiness">
                  <h2>
                    {data.eligibility.eligible
                      ? 'Podmínky pro vyhodnocení jsou splněné'
                      : 'Tvůj postup k vyhodnocení'}
                  </h2>
                  {data.eligibility.hasPurchase ? (
                    <>
                      <ProgressMeters eligibility={data.eligibility} />
                      {!data.eligibility.eligible && (
                        <p className="hint">
                          Vyhodnocení se odemkne po 21 dnech od platby a 21 dnech se záznamem. Počítají se dny
                          od zaplacení, nemusí jít po sobě. Prázdný den se nepočítá.
                        </p>
                      )}
                      {data.eligibility.elapsedDays < 21 && (
                        <p className="analysis-unlock-date">
                          Nejdřívější odemčení:{' '}
                          <strong>{displayDate(data.eligibility.availableAt, true)}</strong> · čas v Praze
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="muted">
                      Vyhodnocení je součástí jednorázově zakoupeného deníku. Pro tento účet zatím nemáme
                      potvrzený nákup.
                    </p>
                  )}
                  <p className="hint">
                    21 dní je podmínka pro zpřístupnění služby, ne záruka, že data odhalí příčinu potíží.
                    Můžeš zapisovat déle a vyhodnocení využít během platnosti svého přístupu.
                  </p>
                  {data.status === 'not_configured' && (
                    <div className="analysis-notice" role="status">
                      <p>AI vyhodnocení je dočasně nedostupné. Tvůj nárok zůstává zachovaný.</p>
                      <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
                        Zkontrolovat dostupnost
                      </button>
                    </div>
                  )}
                  {data.status === 'failed' && (
                    <div className="analysis-notice" role="status">
                      <p>
                        {data.error || 'Vyhodnocení se nepodařilo dokončit. Tvůj nárok zůstává zachovaný.'}
                      </p>
                      {data.retryAt && (
                        <p className="hint">Další pokus: {displayDate(data.retryAt, true)}.</p>
                      )}
                      {!data.retryable && (
                        <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
                          Zkontrolovat stav
                        </button>
                      )}
                    </div>
                  )}
                  {canStart && (
                    <div className="analysis-start">
                      <h3>Vyhodnocení spustíš, až se rozhodneš</h3>
                      <p>
                        Jedno úspěšné vyhodnocení je v ceně. Hotový přehled zůstane uložený, ale pozdější
                        zápisy ho automaticky nedoplní.
                      </p>
                      <p className="hint">
                        AI zpracuje nejvýše 90 nejnovějších zaznamenaných dní, které se vejdou do rozboru, bez
                        zkracování poznámek uvnitř vybraných dní. Případné vynechané dny uvidíš u výsledku.
                        Zkontroluj své poznámky a neuváděj v nich jména ani jiné nepotřebné identifikační
                        údaje.
                      </p>
                      <label className="analysis-consent">
                        <input
                          type="checkbox"
                          checked={consent}
                          onChange={(e) => setConsent(e.target.checked)}
                        />
                        <span>{data.consentText}</span>
                      </label>
                      <p className="hint">
                        <Link href="/jak-chranime-data" target="_blank" rel="noreferrer">
                          Jak pracujeme s daty
                        </Link>
                      </p>
                      <button
                        className="btn btn-primary btn-block"
                        disabled={!consent || submitting}
                        onClick={() => start(data.consentVersion)}
                      >
                        {data.status === 'failed'
                          ? 'Zkusit mé vyhodnocení znovu'
                          : 'Využít moje jediné AI vyhodnocení'}
                      </button>
                      <p className="hint">
                        Záznamy z deníku se pro toto vyhodnocení odešlou do AI teprve tímto krokem.
                        Nepřidáváme údaje o účtu ani platbě.
                      </p>
                    </div>
                  )}
                  {!canStart && data.status !== 'not_configured' && (
                    <Link
                      className="btn btn-primary btn-block"
                      href={data.eligibility.hasPurchase ? '/app/denik' : '/app/platba'}
                    >
                      {data.eligibility.hasPurchase ? 'Pokračovat v zapisování' : 'Zobrazit přístup a platbu'}
                    </Link>
                  )}
                </section>
              )}
              <section className="card">
                <h2>Jak dát vyhodnocení lepší podklad</h2>
                <ul className="analysis-readable-list">
                  <li>
                    <strong>Zapiš i dobré dny.</strong> Bez nich chybí srovnání s těmi náročnými.
                  </li>
                  <li>
                    <strong>Přidej čas a okolnosti.</strong> Co se dělo před potížemi, během nich a jak dlouho
                    trvaly.
                  </li>
                  <li>
                    <strong>Drž se stejné škály.</strong> Nevzpomínáš-li si, nech údaj prázdný. Nula a
                    chybějící záznam nejsou totéž.
                  </li>
                  <li>
                    <strong>Doplň relevantní detaily.</strong> Údaje, které AI pro tvůj deník vybrala, jsou
                    užitečnější než dlouhý seznam nesouvisejících měření.
                  </li>
                </ul>
                <p className="hint">
                  AI může přehlédnout souvislost nebo ji vyložit nesprávně. Vyhodnocení neurčuje diagnózu ani
                  léčbu a nemusí nalézt jasný vzorec.
                </p>
              </section>
            </>
          )
        )}
      </AppShell>
    </div>
  );
}
