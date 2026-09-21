import Link from 'next/link';
import type { AnalysisResponse } from '../../lib/analysis/types';
import { analysisAsText } from '../../lib/analysis-export';
import { displayDate } from './AnalysisProgress';
import Icon from '../marketing/Icon';

export default function AnalysisReportView({ data }: { data: AnalysisResponse }) {
  if (!data.report) return null;
  const { report, coverage } = data;
  const download = () => {
    const url = URL.createObjectURL(new Blob([analysisAsText(data)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'muj-ai-prehled.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <article className="analysis-report">
      <section className="card analysis-report-intro">
        <p className="analysis-eyebrow">TVŮJ OSOBNÍ AI PŘEHLED</p>
        <h2>Co přinesly tvoje záznamy</h2>
        <p className="analysis-report-summary">{report.summary}</p>
        <p className="analysis-report-boundary">
          Výstup AI může obsahovat chyby. Souvislost není důkaz příčiny. Tento přehled je podklad pro další
          pozorování a rozhovor s odborníkem, nikoli diagnóza nebo léčebný plán.
        </p>
        <div className="analysis-report-meta">
          <span>Vytvořeno {displayDate(data.completedAt)}</span>
          {coverage && (
            <span>
              {coverage.analyzedDays} dní · {displayDate(coverage.from)} – {displayDate(coverage.to)}
            </span>
          )}
        </div>
        <div className="analysis-toolbar no-print">
          <button className="btn btn-primary" onClick={download}>
            <Icon name="download" size={17} /> Stáhnout přehled
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            Vytisknout / uložit PDF
          </button>
        </div>
        <p className="hint no-print">
          Toto vyhodnocení zůstává uložené. Pozdější zápisy ani změna deníku jeho obsah nemění.
        </p>
      </section>
      <section className="card analysis-report-section">
        <div className="analysis-section-label">01 · JAKÝ PODKLAD MÁME</div>
        <h2>Co data dovolují říct</h2>
        <ul className="analysis-readable-list">
          {report.dataQuality.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
        {coverage && (coverage.omittedDays > 0 || coverage.missingDefinitionDays.length > 0) && (
          <details className="analysis-coverage">
            <summary>Rozsah a vynechané záznamy</summary>
            <p>
              Rozbor pracuje s {coverage.analyzedDays} dny. Z dostupných dní bylo vynecháno{' '}
              {coverage.omittedDays}; vybírá nejnovější celé dny, nejvýše {coverage.maxDays}.
            </p>
            {coverage.omittedDates.length > 0 && (
              <p>Vynechané dny: {coverage.omittedDates.map((d) => displayDate(d)).join(', ')}.</p>
            )}
            {coverage.missingDefinitionDays.length > 0 && (
              <p>
                Chybí podoba deníku pro tyto dny:{' '}
                {coverage.missingDefinitionDays.map((d) => displayDate(d)).join(', ')}.
              </p>
            )}
          </details>
        )}
      </section>
      <section className="card analysis-report-section">
        <div className="analysis-section-label">02 · CO SE OBJEVUJE SPOLEČNĚ</div>
        <h2>Souvislosti v záznamech</h2>
        {report.patterns.length === 0 ? (
          <p className="muted">
            Z těchto záznamů nelze opřít konkrétní opakující se vzorec. I to je užitečný výsledek: níže
            najdeš, co by další pozorování mohlo doplnit.
          </p>
        ) : (
          report.patterns.map((p, i) => (
            <div className="analysis-pattern" key={i}>
              <div className="analysis-pattern-top">
                <h3>{p.title}</h3>
                <span className="analysis-evidence">
                  {p.strength === 'medium' ? 'Střední' : 'Slabá'} opora v datech
                </span>
              </div>
              <p>{p.observation}</p>
              <p className="analysis-small-label">ZÁZNAMY, O KTERÉ SE OPÍRÁ</p>
              <div className="analysis-date-links">
                {p.evidenceDates.map((date) => (
                  <Link href={`/app/denik?den=${date}`} key={date}>
                    {displayDate(date)}
                  </Link>
                ))}
              </div>
              {p.alternativeExplanations.length > 0 && (
                <div className="analysis-alternatives">
                  <strong>Co může hrát roli také</strong>
                  <ul>
                    {p.alternativeExplanations.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))
        )}
      </section>
      <section className="card analysis-report-section">
        <div className="analysis-section-label">03 · MOŽNÉ SMĚRY K OVĚŘENÍ</div>
        <h2>Možná vysvětlení, otevřené otázky</h2>
        <p className="muted">Následující možnosti nejsou určením příčiny ani pravděpodobnosti onemocnění.</p>
        {report.hypotheses.length ? (
          report.hypotheses.map((h, i) => (
            <div className="analysis-hypothesis" key={i}>
              <h3>{h.possibility}</h3>
              <p>{h.basis}</p>
              <p className="analysis-uncertainty">
                <strong>Nejistota: </strong>
                {h.uncertainty}
              </p>
            </div>
          ))
        ) : (
          <p className="hint">V těchto datech není dost opory pro další konkrétní vysvětlení.</p>
        )}
      </section>
      <section className="card analysis-report-section">
        <div className="analysis-section-label">04 · CO SI Z TOHO ODNÉST</div>
        <h2>Další užitečné kroky</h2>
        <ol className="analysis-next-steps">
          {report.nextSteps.map((step, i) => (
            <li key={i}>
              <span>{step.kind === 'observation' ? 'DALŠÍ POZOROVÁNÍ' : 'PŘÍPRAVA NA KONZULTACI'}</span>
              <h3>{step.action}</h3>
              <p>{step.reason}</p>
            </li>
          ))}
        </ol>
        <div className="analysis-consultation">
          <h3>Otázky, které si můžeš vzít k lékaři</h3>
          <ul>
            {report.clinicianQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="card analysis-report-section">
        <div className="analysis-section-label">05 · CO ZŮSTÁVÁ NEJISTÉ</div>
        <h2>Limity vyhodnocení</h2>
        <ul className="analysis-readable-list">
          {report.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <p className="hint">
          Podle přehledu neměň léčbu ani dávkování léků. Nové, závažné nebo přetrvávající potíže řeš s
          kvalifikovaným zdravotníkem.
        </p>
      </section>
      <div className="analysis-toolbar no-print">
        <Link className="btn btn-primary" href="/app/denik">
          Pokračovat v deníku
        </Link>
        <Link className="btn btn-ghost" href="/app/ucet">
          Účet a moje data
        </Link>
      </div>
    </article>
  );
}
