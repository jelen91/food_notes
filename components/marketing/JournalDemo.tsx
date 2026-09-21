import { useState } from 'react';
import type { LandingPageContent } from '../../lib/landing-pages';
import Icon from './Icon';

export default function JournalDemo({ content }: { content: LandingPageContent }) {
  const [tab, setTab] = useState<'entry' | 'analysis' | 'export'>('entry');
  const [intensity, setIntensity] = useState(3);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const { demo } = content;
  const exportText = `# ${demo.label} — ukázkový den\n\nToto jsou ilustrační záznamy, nikoli skutečná zdravotní data.\n\n${demo.entries.map((e) => `- ${e.time} · ${e.label}: ${e.note}`).join('\n')}\n\n${demo.scale}: ${intensity}/5\n${saved && note ? `\nPoznámka: ${note}\n` : ''}\nVlastní pozorování, nikoli diagnóza. Souvislost neprokazuje příčinu.\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportText], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ukazka-deniku.md';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="journal-scene" id="ukazka">
      <div className="journal-orbit" aria-hidden="true" />
      <div className="journal-card">
        <div className="journal-heading">
          <span className="journal-logo">
            <Icon name="book" size={19} /> {demo.label}
          </span>
          <span className="demo-badge">UKÁZKA</span>
        </div>
        <div className="journal-tabs" role="group" aria-label="Zobrazení ukázky deníku">
          <button
            id="demo-entry-tab"
            aria-controls="demo-panel"
            aria-pressed={tab === 'entry'}
            onClick={() => setTab('entry')}
          >
            Dnešní zápis
          </button>
          <button
            id="demo-analysis-tab"
            aria-controls="demo-panel"
            aria-pressed={tab === 'analysis'}
            onClick={() => setTab('analysis')}
          >
            AI přehled <Icon name="leaf" size={13} />
          </button>
          <button
            id="demo-export-tab"
            aria-controls="demo-panel"
            aria-pressed={tab === 'export'}
            onClick={() => setTab('export')}
          >
            Export <Icon name="arrow" size={14} />
          </button>
        </div>
        <div
          id="demo-panel"
          role="region"
          aria-labelledby={`demo-${tab}-tab`}
        >
          {tab === 'entry' ? (
            <>
              <div className="journal-date">
                <div>
                  <span>JEDEN OBYČEJNÝ DEN</span>
                  <h3>Malé věci. Celý příběh.</h3>
                </div>
                <Icon name="sun" size={27} />
              </div>
              <div className="journal-timeline">
                {demo.entries.map((entry) => (
                  <div className="journal-event" key={entry.time}>
                    <span className="journal-event-icon">
                      <Icon name={entry.icon} size={17} />
                    </span>
                    <div>
                      <div className="journal-event-title">
                        <strong>{entry.label}</strong>
                        <time>{entry.time}</time>
                      </div>
                      <p>{entry.note}</p>
                    </div>
                  </div>
                ))}
              </div>
              <fieldset className="journal-scale">
                <legend>
                  {demo.scale} <span>Zkuste změnit</span>
                </legend>
                <div>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <button
                      type="button"
                      key={n}
                      aria-label={`${demo.scale}: ${n} z 5`}
                      aria-pressed={intensity === n}
                      onClick={() => setIntensity(n)}
                      className={intensity === n ? 'selected' : ''}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p>
                  <span>Bez potíží</span>
                  <span>Výrazné potíže</span>
                </p>
              </fieldset>
              <form
                className="journal-quick-note"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim()) setSaved(true);
                }}
              >
                <label htmlFor="demo-note">Prostor na vlastní poznámku</label>
                <div>
                  <input
                    id="demo-note"
                    placeholder="Třeba: po obědě krátká procházka…"
                    value={note}
                    maxLength={300}
                    onChange={(e) => {
                      setNote(e.target.value);
                      setSaved(false);
                    }}
                  />
                  <button type="submit" aria-label="Přidat ukázkovou poznámku" disabled={!note.trim()}>
                    <Icon name={saved ? 'check' : 'plus'} size={19} />
                  </button>
                </div>
                <span role="status">
                  {saved
                    ? 'Přidáno do ukázky. Najdete i v exportu.'
                    : 'Ukázka zůstává jen na této stránce. Nic neodesíláme.'}
                </span>
              </form>
            </>
          ) : tab === 'analysis' ? (
            <div className="journal-analysis">
              <span className="demo-badge">ILUSTRAČNÍ VÝSTUP · VYMYŠLENÁ DATA</span>
              <h3>21 dní. Vlastní přehled.</h3>
              <p className="journal-analysis-intro">Příklad z 1.–21. září. Jedno vyhodnocení zahrnuté v ceně vašeho deníku.</p>
              <div className="journal-analysis-pattern">
                <span>VZOREC K DALŠÍMU POZOROVÁNÍ</span>
                <h4>{content.analysisDemo.title}</h4>
                <p>{content.analysisDemo.observation}</p>
                <p className="journal-analysis-evidence">{content.analysisDemo.evidence}</p>
              </div>
              <div className="journal-analysis-next"><strong>Co dál sledovat</strong><p>{content.analysisDemo.nextStep}</p></div>
              <p className="journal-analysis-limit">{content.analysisDemo.uncertainty}</p>
              <a href="#vyhodnoceni" className="marketing-text-link">Co obsahuje váš přehled <Icon name="arrow" size={14} /></a>
            </div>
          ) : (
            <div className="journal-export">
              <span className="demo-badge">VAŠE ZÁZNAMY, POHROMADĚ</span>
              <h3>Přehled, který si vezmete s sebou.</h3>
              <p>
                Ukázkový dokument s časem, pozorováním a vlastní poznámkou. V aplikaci si vyberete období a
                stáhnete skutečné záznamy.
              </p>
              <pre>{exportText}</pre>
              <button className="marketing-button compact" onClick={download}>
                <Icon name="download" size={17} /> Stáhnout ukázku
              </button>
              <p className="demo-export-note">
                Export je dostupný kdykoli. Osobní AI vyhodnocení si v aplikaci spustíte po splnění
                podmínek; jedno je zahrnuté v ceně.
              </p>
            </div>
          )}
        </div>
        <div className="journal-bottom">
          <span className="status-dot" /> Deník od AI. Každodenní zápisy od vás.
          <Icon name="lock" size={13} />
        </div>
      </div>
      <div className="journal-side-note">
        <span className="side-note-icon">
          <Icon name="leaf" size={20} />
        </span>
        <div>
          <strong>Každý zápis má smysl.</strong>
          <span>Budujete podklad pro svůj AI přehled.</span>
        </div>
      </div>
      <p className="journal-caption">Interaktivní ukázka · ilustrační údaje · bez registrace</p>
    </div>
  );
}
