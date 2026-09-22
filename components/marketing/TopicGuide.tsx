import type { LandingGuide } from '../../lib/landing-guides';
import Icon from './Icon';

export default function TopicGuide({ guide }: { guide: LandingGuide }) {
  return (
    <section className="marketing-container topic-guide" id="pruvodce" aria-labelledby="guide-title">
      <div className="guide-heading">
        <p className="marketing-eyebrow">NEŽ ZAČNETE HLEDAT SOUVISLOSTI</p>
        <h2 id="guide-title">{guide.title}</h2>
        <p>{guide.intro}</p>
        <nav aria-label="Obsah průvodce" className="guide-toc">
          {guide.sections.map((section, index) => (
            <a href={`#${section.id}`} key={section.id}>
              <span>0{index + 1}</span>{section.title}<Icon name="arrow" size={15} />
            </a>
          ))}
          <a href="#otazky-k-potizim"><span>04</span>Otázky k vašim potížím<Icon name="arrow" size={15} /></a>
        </nav>
      </div>
      <div className="guide-body">
        {guide.sections.map((section) => (
          <section className="guide-section" id={section.id} key={section.id} aria-labelledby={`${section.id}-title`}>
            <h3 id={`${section.id}-title`}>{section.title}</h3>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && (
              <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
            )}
          </section>
        ))}
        <section className="guide-questions" id="otazky-k-potizim" aria-labelledby="guide-questions-title">
          <h3 id="guide-questions-title">Na co se možná také ptáte</h3>
          {guide.questions.map(({ q, a }) => (
            <div key={q}>
              <h4>{q}</h4>
              <p>{a}</p>
            </div>
          ))}
        </section>
        <div className="guide-sources">
          <p><strong>Zdroje a další čtení</strong></p>
          <ul>
            {guide.sources.map((source) => <li key={source.url}><a href={source.url}>{source.label} ↗</a></li>)}
          </ul>
          <p>Průvodce připravilo Rozumím tělu pro orientaci a vedení vlastních záznamů. Nejde o individuální lékařské doporučení.</p>
        </div>
      </div>
    </section>
  );
}
