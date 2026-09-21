import Link from 'next/link';
import { useJournalAnalysis } from './useJournalAnalysis';
import type { AnalysisEligibility } from '../../lib/analysis/types';
import Icon from '../marketing/Icon';

export function displayDate(value: string | null | undefined, includeTime = false): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    ...(includeTime ? ({ hour: '2-digit', minute: '2-digit' } as const) : {}),
  });
}

export function ProgressMeters({ eligibility }: { eligibility: AnalysisEligibility }) {
  const total = eligibility.requiredDays;
  return (
    <div className="analysis-meters">
      <div>
        <div className="analysis-meter-label">
          <span>Dny se záznamem</span>
          <strong>
            {Math.min(eligibility.recordedDays, total)} / {total}
          </strong>
        </div>
        <progress
          aria-label="Dny se záznamem"
          max={total}
          value={Math.min(eligibility.recordedDays, total)}
        />
      </div>
      <div>
        <div className="analysis-meter-label">
          <span>Dny od platby</span>
          <strong>
            {Math.min(eligibility.elapsedDays, total)} / {total}
          </strong>
        </div>
        <progress aria-label="Dny od platby" max={total} value={Math.min(eligibility.elapsedDays, total)} />
      </div>
    </div>
  );
}

export default function AnalysisProgress({ refreshKey = 0 }: { refreshKey?: number }) {
  const { data, error, refresh } = useJournalAnalysis(refreshKey);
  if (!data)
    return (
      <section className="card analysis-progress">
        <p className="hint" role="status">
          {error || 'Načítám tvůj postup k AI přehledu…'}
        </p>
        {error && (
          <button className="btn btn-ghost btn-sm" onClick={refresh}>
            Zkusit znovu
          </button>
        )}
      </section>
    );
  const completed = data.status === 'completed';
  const ready = data.eligibility.eligible;
  return (
    <section className="card analysis-progress">
      <div className="analysis-card-heading">
        <span className="analysis-symbol">
          <Icon name="leaf" size={22} />
        </span>
        <div>
          <p className="analysis-eyebrow">JEDNO VYHODNOCENÍ V CENĚ</p>
          <h2>
            {completed
              ? 'Tvůj AI přehled je uložený'
              : data.status === 'generating'
                ? 'AI prochází tvé záznamy'
                : ready
                  ? 'Záznamy jsou připravené k vyhodnocení'
                  : 'Od zápisů k novému pohledu'}
          </h2>
        </div>
      </div>
      <p className="muted">
        {completed
          ? 'Vrať se k souvislostem, možným vysvětlením a podnětům pro další pozorování.'
          : 'AI propojí tvá pozorování, ukáže, o co se opírá, a pomůže připravit otázky pro další konzultaci.'}
      </p>
      {!completed && data.status !== 'generating' && data.eligibility.hasPurchase && (
        <ProgressMeters eligibility={data.eligibility} />
      )}
      {!completed && !ready && (
        <p className="hint">
          Odemkne se po 21 dnech od platby a alespoň 21 dnech se záznamem. Nemusí jít po sobě. Prázdný den se
          nepočítá.
        </p>
      )}
      {error && (
        <p className="hint" role="status">
          Postup může být neaktuální. Přesný stav najdeš v přehledu.
        </p>
      )}
      <Link className="btn btn-primary btn-block" href="/app/vyhodnoceni">
        {completed
          ? 'Otevřít můj AI přehled'
          : data.status === 'generating'
            ? 'Zobrazit průběh'
            : ready
              ? 'Přejít k vyhodnocení'
              : 'Můj postup a co získám'}
      </Link>
    </section>
  );
}
