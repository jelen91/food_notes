import Head from 'next/head';
import Link from 'next/link';
import type { LandingPageContent } from '../../lib/landing-pages';
import { LANDING_PAGES, questionnaireHref } from '../../lib/landing-pages';
import { ACCESS_MONTHS, EXPORT_GRACE_DAYS } from '../../lib/purchase-policy';
import JournalDemo from './JournalDemo';
import Icon, { type IconName } from './Icon';

export interface LandingProps {
  content: LandingPageContent;
  offer: { priceLabel: string | null; available: boolean };
  resume: { href: string; label: string } | null;
  canonical: string | null;
}

export default function LandingPage({ content, offer, resume, canonical }: LandingProps) {
  const cta = resume ?? { href: questionnaireHref(content.slug), label: 'Chci najít svůj směr' };
  const benefits: { icon: IconName; title: string; text: string }[] = [
    {
      icon: 'note',
      title: 'Začínáme vaším příběhem',
      text: 'Co vás trápí, co už jste vypozorovali a jak vypadá váš den? Podle vašich odpovědí AI sestaví osobní deník. Vybere, co sledovat a proč, v rozsahu, který zvládnete.',
    },
    {
      icon: 'book',
      title: 'Nemusíte si všechno pamatovat',
      text: 'Co jste jedli, jak jste spali, kdy vám bylo hůř a kdy naopak dobře. Zapište to ve chvíli, kdy to máte v hlavě. Později se k těmto detailům můžete vrátit.',
    },
    {
      icon: 'leaf',
      title: 'Další krok má o co se opřít',
      text: 'AI projde vaše záznamy a pomůže hledat, co se opakuje. Dostanete možná vysvětlení, tipy, co dál pozorovat, a otázky, se kterými se můžete obrátit na lékaře.',
    },
  ];
  const questions = [
    {
      q: 'Co když mi vlastní deník nebude vyhovovat?',
      a: 'Do 3 dnů, tedy 72 hodin od zaplacení, můžete požádat o vrácení celé zaplacené ceny. Bez udání důvodu, bez poplatku a i tehdy, když vám AI už deník sestavila a vy jste do něj zapisovali. Garanci uplatníte přímo ve svém účtu. Třídenní garance neomezuje zákonná práva, včetně práva na odstoupení od smlouvy. Přesné podmínky najdete v Podmínkách přístupu a vrácení peněz.',
    },
    {
      q: 'Může mi to pomoci najít cestu k úlevě?',
      a: 'Může vám to pomoci udělat konkrétnější další krok při hledání toho, co by vám mohlo ulevit. AI vychází z vašich záznamů a upozorní na možné souvislosti, mezery a směry k dalšímu pozorování. Ty můžete využít i při konzultaci. Výsledek ale může být nejednoznačný a deník sám potíže neléčí. Tipy se týkají dalšího sledování a přípravy na konzultaci, nikoli změn léčby nebo diet na vlastní pěst.',
    },
    {
      q: 'Co přesně za platbu dostanu?',
      a: `Přístup na ${ACCESS_MONTHS} měsíců od zaplacení: osobní deník sestavený pomocí AI z vašich odpovědí, denní škály, časované události, poznámky, historii a export. V ceně je také jedno AI vyhodnocení vašich záznamů, které si spustíte po splnění podmínek během placeného přístupu. Platíte jednorázově, přístup se sám neobnovuje a další platba se automaticky nestrhne. Deník můžete během zakoupeného roku používat i po vyhodnocení.`,
    },
    {
      q: 'Kdy si můžu nechat deník vyhodnotit?',
      a: 'Až uplyne alespoň 21 dní od zaplacení a zároveň budete mít záznamy z alespoň 21 různých dní od zaplacení. Dny nemusí jít za sebou. Datum zápisu počítáme podle času v Praze a zahrnujeme i den nákupu; prázdné dny se nepočítají. V aplikaci uvidíte svůj postup a sami se rozhodnete, kdy jediné vyhodnocení během placeného přístupu využijete — klidně i později, až budete mít více dat. Technická chyba při vytváření výstupu váš nárok nespotřebuje.',
    },
    {
      q: 'Stačí tři týdny k nalezení příčiny potíží?',
      a: 'Tři týdny jsou minimum pro odemčení funkce, nikoli záruka, že záznamy ukážou jasný vzorec. U méně častých potíží může být užitečné sledovat delší období. AI pojmenuje mezery v datech a nejistoty; pokud pro souvislost není dost podkladů, má to ve výstupu říct. Vyhodnocení neurčuje diagnózu ani nepotvrzuje příčinu.',
    },
    {
      q: 'Mám opravdu zapisovat co nejvíc věcí?',
      a: 'Pomáhá co nejúplnější záznam věcí, které souvisejí s vaší otázkou. Samotný údaj „bylo mi špatně“ má méně kontextu než čas, intenzita, průběh a okolnosti. Důležitá je pravidelnost i dny bez potíží, se kterými lze porovnávat. AI vám pomůže vybrat zvládnutelný rozsah. Více údajů samo o sobě nezaručuje lepší závěr a chybějící údaje není potřeba odhadovat.',
    },
    {
      q: 'Můžu si deník nejdřív vyzkoušet?',
      a: 'Ano, ukázka na této stránce funguje bez účtu a dotazník je zdarma. Váš vlastní deník se sestaví po zaplacení; potom máte 72 hodin na vyzkoušení s garancí vrácení celé ceny. Během těchto tří dnů si ověříte, zda vám vyhovuje deník a způsob zapisování. Skutečné AI vyhodnocení vašich záznamů se odemkne až po splnění podmínek nejdříve po 21 dnech; jeho ilustrační ukázku si můžete prohlédnout už teď.',
    },
    {
      q: 'Co se stane po roce? Nezačne se mi strhávat další platba?',
      a: `Ne. Přístup je na ${ACCESS_MONTHS} kalendářních měsíců od zaplacení, bez automatického prodloužení. Potom máte ještě ${EXPORT_GRACE_DAYS} dní pro stažení dosavadních záznamů a hotového AI přehledu. Nové zápisy ani AI funkce už po roce nejsou zahrnuté. Přesné termíny najdete ve svém účtu. Případné prodloužení by vyžadovalo novou objednávku; nic nemusíte předem rušit.`,
    },
    {
      q: 'Co tady dělá AI a kdy vidí moje záznamy?',
      a: 'AI od Anthropic nejprve zpracuje odpovědi z dotazníku a navrhne váš deník. Denní zápisy průběžně do AI neposíláme. Až si sami spustíte vyhodnocení, předáme jí podklady z deníku k vytvoření vašeho přehledu. Vyhodnocení zpracuje nejvýše 90 nejnovějších zaznamenaných dní, které se vejdou do rozboru; případná vynechání uvidíte ve výsledku. Váš e-mail ani platební údaje do zadání nepřidáváme. Výstup si během přístupu můžete otevřít a stáhnout; pozdější zápisy se do něj automaticky nedoplní.',
    },
    {
      q: content.slug ? content.question : 'Nahradí deník lékaře nebo stanoví diagnózu?',
      a: content.slug
        ? content.answer
        : 'Ne. Pomůže uspořádat vaše pozorování a připravit podněty k dalšímu postupu. Neurčuje diagnózu, nepotvrzuje příčinu potíží a nedoporučuje léčbu. Souvislost mezi dvěma záznamy sama o sobě příčinu nedokazuje. Kvůli deníku neodkládejte potřebnou lékařskou péči.',
    },
    {
      q: 'Kdo má moje údaje a můžu je smazat?',
      a: 'Obsah dotazníku a denních záznamů ukládáme zašifrovaně, s odděleným datovým klíčem pro každý deník. Anthropic zpracuje zadání pro sestavení deníku a na váš pokyn podklady pro vyhodnocení. Z účtu můžete data exportovat a účet smazat. Platbu zpracovává Stripe. Podrobnosti najdete na stránce Jak pracujeme s daty.',
    },
  ];
  return (
    <div className="marketing">
      <Head>
        <title>{content.metaTitle}</title>
        <meta name="description" content={content.description} />
        <meta name="theme-color" content="#f8f8f2" />
        <meta property="og:title" content={content.metaTitle} />
        <meta property="og:description" content={content.description} />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="cs_CZ" />
        {canonical && (
          <>
            <link rel="canonical" href={canonical} />
            <meta property="og:url" content={canonical} />
          </>
        )}
      </Head>
      <a className="marketing-skip" href="#obsah">
        Přejít na obsah
      </a>
      <header className="marketing-header">
        <div className="marketing-container marketing-nav">
          <Link className="marketing-brand" href="/" aria-label="Deník pozorování — úvod">
            <span className="brand-symbol">
              <Icon name="book" size={24} />
            </span>
            <span>
              deník<span className="brand-second">pozorování</span>
            </span>
          </Link>
          <nav aria-label="Hlavní navigace">
            <a href="#jak-to-funguje">Jak to funguje</a>
            <a href="#vyhodnoceni">AI vyhodnocení</a>
            <a href="#cena">Co získáte</a>
            <a href="#garance">Garance</a>
          </nav>
          <Link className="marketing-login" href={resume?.href ?? '/app/prihlaseni'}>
            {resume?.label ?? 'Přihlásit se'}
            <Icon name="arrow" size={16} />
          </Link>
        </div>
      </header>
      <main id="obsah">
        <section className="marketing-container marketing-hero">
          <div className="hero-copy">
            <p className="marketing-eyebrow">
              <span />
              {content.eyebrow}
            </p>
            <h1>
              {content.headline}
              <br />
              <em>{content.emphasis}</em>
            </h1>
            <p className="hero-lead">{content.lead}</p>
            <div className="hero-included">
              <Icon name="check" size={18} />
              <p>
                <strong>Deník na míru + 1 osobní AI vyhodnocení</strong>
                <span>
                  {offer.priceLabel ? `${offer.priceLabel} jednorázově` : 'Jednorázová platba'} · přístup na{' '}
                  {ACCESS_MONTHS} měsíců · bez automatického obnovení
                </span>
              </p>
            </div>
            <div className="hero-actions">
              <Link className="marketing-button" href={cta.href}>
                {cta.label}
                <Icon name="arrow" size={19} />
              </Link>
              <a className="marketing-text-link" href="#vyhodnoceni">
                Co mi AI ukáže <span>↗</span>
              </a>
            </div>
            <p className="hero-microcopy">
              <Icon name="check" size={15} /> Dotazník zdarma, bez registrace<span>·</span> Platba až potom
            </p>
            <Link className="hero-guarantee" href="/podminky#garance">
              <span className="guarantee-check">
                <Icon name="check" size={17} />
              </span>
              <span>
                <strong>3 dny na vyzkoušení. Celá cena zpět, pokud vám deník nesedne.</strong>
                <span>I když už jste si ho nechali sestavit a začali zapisovat.</span>
              </span>
            </Link>
            <div className="hero-topics">
              <p>{content.slug ? 'CO MŮŽE DÁT VAŠIM ZÁZNAMŮM KONTEXT' : 'CO CHCETE LÉPE POZNAT?'}</p>
              <div>
                {content.slug
                  ? content.focus.map((item) => (
                      <span className="topic-tag" key={item}>
                        {item}
                      </span>
                    ))
                  : LANDING_PAGES.map((page) => (
                      <Link key={page.slug} href={`/lp/${page.slug}`} className="topic-link">
                        {page.title}
                        <Icon name="arrow" size={14} />
                      </Link>
                    ))}
              </div>
            </div>
          </div>
          <JournalDemo content={content} key={content.slug} />
        </section>
        <div className="marketing-container proof-strip">
          <span>
            <Icon name="note" size={18} /> AI vybere, co má smysl sledovat
          </span>
          <span>
            <Icon name="book" size={18} /> Od 21 zaznamenaných dní k přehledu
          </span>
          <span>
            <Icon name="lock" size={18} /> Vyhodnocení spustíte jen vy
          </span>
        </div>
        <section className="marketing-container recognition-section" aria-labelledby="recognition-title">
          <div className="recognition-copy">
            <p className="marketing-eyebrow">{content.story.eyebrow}</p>
            <h2 id="recognition-title">{content.story.title}</h2>
            {content.story.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="recognition-card">
            <div className="recognition-card-top">
              <Icon name="note" size={22} />
              <p>Z VAŠEHO KAŽDODENNÍHO ŽIVOTA</p>
            </div>
            <ul>
              {content.story.recognitions.map((recognition) => (
                <li key={recognition}>{recognition}</li>
              ))}
            </ul>
            <p className="recognition-turn">{content.story.turn}</p>
            <Link className="marketing-text-link" href={cta.href}>
              Začít u svého příběhu <Icon name="arrow" size={17} />
            </Link>
          </div>
        </section>
        <section className="marketing-container value-section" id="jak-to-funguje">
          <div className="section-intro">
            <p className="marketing-eyebrow">VAŠE TĚLO. VÁŠ DEN. VAŠE SOUVISLOSTI.</p>
            <h2>
              Dejte hledání úlevy
              <br />
              <em>konkrétní směr.</em>
            </h2>
            <p>
              AI dnes může pomoci hledat souvislosti ve vašich každodenních zápisech. Začnete tím, co
              prožíváte. Získáte deník na míru a pomoc při hledání toho, čemu má smysl věnovat pozornost.
            </p>
          </div>
          <div className="benefit-grid">
            {benefits.map((b, i) => (
              <article className="benefit" key={b.title}>
                <div className="benefit-top">
                  <span className="benefit-icon">
                    <Icon name={b.icon} size={25} />
                  </span>
                  <span>0{i + 1}</span>
                </div>
                <h3>{b.title}</h3>
                <p>{b.text}</p>
              </article>
            ))}
          </div>
          <div className="data-context">
            <div>
              <p className="marketing-eyebrow">MALÉ DETAILY MOHOU OTEVŘÍT NOVÝ SMĚR</p>
              <h3>
                Co když vám chybí
                <br />
                <em>právě souvislosti?</em>
              </h3>
              <p>
                Samotné „dnes mi nebylo dobře“ neřekne, co se dělo kolem. Přidejte jídlo, spánek, pohyb, stres
                nebo vlastní poznámku. Čím úplnější je relevantní obraz vašich dní, tím více má AI s čím
                porovnávat. Může tak upozornit na opakování, kterého jste si dosud nevšimli.
              </p>
            </div>
            <ul>
              <li>
                <Icon name="check" size={17} />
                <span>
                  <strong>Zapisujte i dobré dny.</strong> Bez nich nevíte, čím se dny s potížemi liší.
                </span>
              </li>
              <li>
                <Icon name="check" size={17} />
                <span>
                  <strong>Držte se podobného způsobu zápisu.</strong> Stejná škála a konkrétní časy usnadní
                  srovnání.
                </span>
              </li>
              <li>
                <Icon name="check" size={17} />
                <span>
                  <strong>Pravidelnost má přednost před dokonalostí.</strong> Zvolte rozsah, který zvládnete.
                  Co nevíte, nechte prázdné.
                </span>
              </li>
            </ul>
          </div>
        </section>
        <section className="process-section">
          <div className="marketing-container process-grid">
            <div className="process-heading">
              <p className="marketing-eyebrow">VÁŠ PLÁN NA PRVNÍ TŘI TÝDNY</p>
              <h2>
                Nemusíte hned vědět proč.
                <br />
                <em>Stačí vědět, čím začít.</em>
              </h2>
              <p>
                Začnete dnešním dnem. Postupně zachytíte vlastní zkušenost a AI vám ji pomůže projít. V
                aplikaci uvidíte, jak se blížíte ke svému vyhodnocení.
              </p>
              <Link className="marketing-text-link" href={cta.href}>
                Začít dotazníkem <Icon name="arrow" size={17} />
              </Link>
              <p className="process-condition">
                Vyhodnocení se zpřístupní nejdříve 21 dní od platby a při záznamech z alespoň 21 různých dní
                od zaplacení. Nemusí jít za sebou. Spustíte ho sami, až budete připraveni.
              </p>
            </div>
            <ol className="process-steps">
              <li>
                <span>01</span>
                <div>
                  <p className="process-time">DNES · DENÍK PODLE VÁS</p>
                  <h3>AI vám připraví vlastní plán sledování</h3>
                  <p>
                    V dotazníku popíšete své potíže, otázky a čas na zapisování. Po platbě AI sestaví deník s
                    poli, která dávají vašemu tématu kontext.
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <p className="process-time">PRVNÍ TŘI TÝDNY · VLASTNÍ POZOROVÁNÍ</p>
                  <h3>Zachyťte lepší i horší dny</h3>
                  <p>
                    Pravidelně doplňujte škály, události a poznámky. Čím úplnější a srovnatelnější relevantní
                    záznamy máte, tím více podkladů bude pro hledání vzorců.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <p className="process-time">PO SPLNĚNÍ PODMÍNEK · JEDNO VYHODNOCENÍ V CENĚ</p>
                  <h3>Získejte přehled a další směr</h3>
                  <p>
                    Na váš pokyn AI projde záznamy: co se opakuje, jaké jsou mezery v datech, co dále sledovat
                    a které otázky probrat s lékařem. Můžete počkat i déle a využít více dat.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>
        <section className="marketing-container analysis-value-section" id="vyhodnoceni">
          <div className="analysis-value-heading">
            <p className="marketing-eyebrow">KONEČNĚ SE MÍT ČEHO CHYTIT</p>
            <h2>
              Co by mohlo hrát roli?
              <br />
              <em>A kudy se vydat dál?</em>
            </h2>
            <p>
              Právě s těmito otázkami vám pomůže osobní AI vyhodnocení. Projde vaše dny, propojí možné
              souvislosti a navrhne, co si zaslouží bližší pozornost. Můžete tak objevit nový směr v hledání
              toho, co by vám mohlo pomoci.
            </p>
            <ul className="analysis-deliverables">
              <li>
                <span>01</span>
                <div>
                  <strong>Co vám vlastní dny mohou napovědět</strong>
                  <p>Srozumitelné shrnutí toho, co se v zápisech objevuje a jaké údaje ještě chybí.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Možnosti, které stojí za pozornost</strong>
                  <p>Souvislosti s konkrétními záznamy, možná vysvětlení a poctivě přiznaná nejistota.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Konkrétní další krok</strong>
                  <p>Co dál sledovat ve svém běžném dni a které otázky probrat s lékařem.</p>
                </div>
              </li>
            </ul>
            <p className="analysis-value-limit">
              Tři týdny jsou začátek pozorování. Jasný vzorec se nemusí ukázat a souvislost sama nepotvrzuje
              příčinu. Výstup nenahrazuje diagnózu ani lékařskou péči.
            </p>
          </div>
          <article className="analysis-example">
            <div className="analysis-example-top">
              <Icon name="book" size={20} />
              <span>UKÁZKA VÝSTUPU · VYMYŠLENÁ DATA</span>
            </div>
            <p className="analysis-example-period">Příklad období 1.–21. září · 21 zaznamenaných dní</p>
            <h3>{content.analysisDemo.title}</h3>
            <p>{content.analysisDemo.observation}</p>
            <p className="analysis-evidence">
              <Icon name="note" size={15} />
              {content.analysisDemo.evidence}
            </p>
            <div className="analysis-example-detail">
              <h4>Jak to číst</h4>
              <p>{content.analysisDemo.uncertainty}</p>
            </div>
            <div className="analysis-example-detail">
              <h4>Co sledovat dál</h4>
              <p>{content.analysisDemo.nextStep}</p>
            </div>
            <div className="analysis-example-question">
              <span>OTÁZKA PRO KONZULTACI</span>
              <p>{content.analysisDemo.doctorQuestion}</p>
            </div>
            <p className="analysis-example-caption">
              Ilustrace obsahu, nikoli skutečné vyhodnocení nebo slíbený výsledek. Váš přehled bude vycházet z
              vašich dat.
            </p>
          </article>
        </section>
        <section className="marketing-container offer-section" id="cena">
          <div className="offer-story">
            <p className="marketing-eyebrow">DŮLEŽITÉ VĚCI SE DĚJÍ I MEZI NÁVŠTĚVAMI LÉKAŘE</p>
            <h2>
              Vaše potíže mají příběh
              <br />
              <em>delší než jednu návštěvu.</em>
            </h2>
            <p>
              Při konzultaci může být těžké vybavit si, co se dělo před dvěma týdny. Co jste jedli, kdy potíže
              začaly, jak dlouho trvaly a čím se lišil den, kdy vám bylo dobře.
            </p>
            <p>
              Deník zachytí právě tyto chvíle. AI vám je pomůže uspořádat, abyste se na další krok mohli
              připravit s konkrétními příklady a vlastními otázkami.
            </p>
            <div className="offer-takeaway">
              <Icon name="leaf" size={24} />
              <p>
                <strong>Prostor věnovat se tomu, co prožíváte právě vy.</strong> Vaše zkušenost a odborná péče
                se mohou doplňovat. Vy přinesete každodenní pozorování. S lékařem můžete probrat, co znamenají
                a jaký postup je pro vás vhodný.
              </p>
            </div>
          </div>
          <div className="offer-card">
            <div className="offer-card-top">
              <Icon name="leaf" size={24} />
              <span>VÁŠ DENÍK + OSOBNÍ AI VYHODNOCENÍ</span>
            </div>
            <h3>
              Váš první krok
              <br />k jasnějšímu směru.
            </h3>
            <div className="offer-price">
              {offer.priceLabel ? (
                <>
                  <strong>{offer.priceLabel}</strong>
                  <span>jednorázově · přístup na {ACCESS_MONTHS} měsíců</span>
                  <span>Bez automatického obnovení a dalších stržených plateb.</span>
                </>
              ) : (
                <>
                  <strong>Jedna platba.</strong>
                  <span>
                    {offer.available
                      ? 'Aktuální cenu zobrazíme před objednáním.'
                      : 'Cenu nyní nelze načíst. Dotazník si můžete projít zdarma.'}
                  </span>
                </>
              )}
            </div>
            <Link className="offer-guarantee" href="/podminky#garance">
              <span className="guarantee-check">
                <Icon name="check" size={18} />
              </span>
              <span>
                <strong>3denní garance vrácení celé ceny</strong>
                <span>Vyzkoušejte vlastní deník. Bez důvodu, bez poplatku.</span>
              </span>
            </Link>
            <ul>
              {[
                `${ACCESS_MONTHS} měsíců přístupu od zaplacení`,
                'AI sestavení osobního deníku podle vašich odpovědí',
                'Škály, časované události a vlastní poznámky',
                '1 AI vyhodnocení záznamů po splnění podmínek',
                'Přehled souvislostí a podnětů pro další sledování',
                'Historie a export vlastních záznamů',
                'Šifrované uložení a možnost smazání účtu',
              ].map((b) => (
                <li key={b}>
                  <Icon name="check" size={17} />
                  {b}
                </li>
              ))}
            </ul>
            <p className="offer-unlock">
              AI vyhodnocení: alespoň 21 dní od platby + záznamy z 21 různých dní od zaplacení. Spuštění je na
              vás během zakoupeného roku.
            </p>
            <Link className="marketing-button" href={cta.href}>
              {cta.label}
              <Icon name="arrow" size={19} />
            </Link>
            <p className="offer-fine">Nejprve dotazník zdarma. Vlastní deník vznikne po platbě.</p>
            <p className="offer-terms">
              <Link href="/podminky">Podmínky přístupu a garance</Link>. Zákonná práva zůstávají zachována.
            </p>
          </div>
        </section>
        <section
          className="marketing-container guarantee-section"
          id="garance"
          aria-labelledby="guarantee-title"
        >
          <div className="guarantee-seal" aria-hidden="true">
            <Icon name="check" size={26} />
            <strong>3</strong>
            <span>dny na vyzkoušení</span>
          </div>
          <div className="guarantee-copy">
            <p className="marketing-eyebrow">ROZHODNĚTE SE PODLE VLASTNÍ ZKUŠENOSTI</p>
            <h2 id="guarantee-title">
              Dejte tomu šanci.
              <br />
              <em>Rozhodnutí je pořád na vás.</em>
            </h2>
            <p>
              Když už hledáte, co by vám mohlo pomoci, nechcete platit za další věc, která vám nesedne. Nechte
              si sestavit vlastní deník, vyzkoušejte zápisy a zjistěte, jestli je to váš způsob.
            </p>
            <p className="guarantee-promise">
              Pokud ne, do 3 dnů od zaplacení požádáte v účtu o vrácení peněz.{' '}
              <strong>Vrátíme celou zaplacenou cenu. Bez udání důvodu a bez srážky za vyzkoušení.</strong>
            </p>
            <div className="guarantee-actions">
              <Link className="marketing-button" href={cta.href}>
                {resume ? cta.label : 'Chci dát deníku šanci'}
                <Icon name="arrow" size={18} />
              </Link>
              <Link className="marketing-text-link" href="/podminky#garance">
                Jak funguje garance
              </Link>
            </div>
            <p className="guarantee-details">
              Garance platí 72 hodin od platby, i po sestavení a používání deníku. V této době si zkoušíte
              deník; AI vyhodnocení se odemkne nejdříve po 21 dnech a 21 dnech se záznamem. Třídenní garance
              neomezuje vaše zákonná práva včetně odstoupení od smlouvy.
            </p>
          </div>
        </section>
        <section className="marketing-container faq-section" id="otazky">
          <div>
            <p className="marketing-eyebrow">JEŠTĚ NEŽ ZAČNETE</p>
            <h2>
              Dobré otázky.
              <br />
              <em>Jasné odpovědi.</em>
            </h2>
            <p>
              Co je v ceně, jak funguje AI
              <br />a kdy získáte svůj přehled.
            </p>
          </div>
          <div className="faq-list">
            {questions.map(({ q, a }) => (
              <details key={q}>
                <summary>
                  {q}
                  <span>
                    <Icon name="plus" size={17} />
                  </span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="marketing-container closing-section">
          <Icon name="leaf" size={32} />
          <p className="marketing-eyebrow">ZAČNĚTE U SEBE</p>
          <h2>Udělejte krok z nejistoty.</h2>
          <p>
            Nemusíte mít odpověď na všechno. Popište, co vás trápí, a začněte hledat svůj další směr s
            deníkem, který vznikne právě pro vás.
          </p>
          <Link className="marketing-button light" href={cta.href}>
            {cta.label}
            <Icon name="arrow" size={19} />
          </Link>
          <Link className="closing-guarantee" href="/podminky#garance">
            <Icon name="check" size={16} /> Po zaplacení máte 3 dny na vyzkoušení s vrácením celé ceny.
          </Link>
        </section>
      </main>
      <footer className="marketing-container marketing-footer">
        <div>
          <Link className="footer-brand" href="/">
            Deník pozorování
          </Link>
          <p>Vaše pozorování. Jasnější další krok.</p>
        </div>
        <div className="footer-links">
          <Link href="/jak-chranime-data">Jak pracujeme s daty</Link>
          <Link href="/podminky">Podmínky přístupu a garance</Link>
          <Link href="/app/vraceni-penez#odstoupeni">Odstoupit od smlouvy</Link>
          <Link href="/app/prihlaseni">Přihlášení</Link>
          <a href="#otazky">Časté otázky</a>
        </div>
        <p className="marketing-disclaimer">
          Deník a AI přehled pracují s vašimi vlastními pozorováními. Neurčují diagnózu, nepotvrzují příčinu
          potíží a nenahrazují lékařskou péči.
        </p>
      </footer>
      <div className="mobile-cta">
        <Link className="marketing-button" href={cta.href}>
          {cta.label}
          <Icon name="arrow" size={17} />
        </Link>
        <Link href="/podminky#garance">3 dny na vyzkoušení · garance vrácení celé ceny</Link>
      </div>
    </div>
  );
}
