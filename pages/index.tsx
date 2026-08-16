import fs from 'fs';
import path from 'path';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';

interface Props {
  /** Cesta k videu, pokud je nahrané v public/video/. */
  videoSrc: string | null;
  poster: string | null;
  /** Kam pokračuje ten, kdo už je rozjetý (přihlášený účet nebo rozepsaný dotazník). */
  pokracovat: { href: string; label: string } | null;
}

// Úvodní stránka. Vysvětluje, komu je to určené (lidem, kterým dosud nic nepomohlo),
// a ukazuje produkt na ukázce zápisu místo výčtu funkcí.
export default function Landing({ videoSrc, poster, pokracovat }: Props) {
  const cta = pokracovat ?? { href: '/dotaznik', label: 'Sestavit můj deník' };
  return (
    <div className="lp">
      <Head>
        <title>Deník pozorování — když dosud nic nepomohlo</title>
        <meta
          name="description"
          content="Systematicky si zapisujte, jak se máte. Data pak necháte vyhodnotit AI, která v nich hledá souvislosti napříč týdny."
        />
        <meta name="theme-color" content="#f6f2ea" />
      </Head>

      <div className="lp-wrap">
        <header className="lp-top">
          <Link className="lp-mark" href="/">
            Deník pozorování
          </Link>
          {pokracovat ? (
            <Link className="lp-login" href={pokracovat.href}>
              {pokracovat.label}
            </Link>
          ) : (
            <Link className="lp-login" href="/app/prihlaseni">
              Přihlásit se
            </Link>
          )}
        </header>

        <section className="lp-hero">
          <p className="lp-kicker">Když dosud nic nepomohlo</p>
          <h1>
            Roky vám nikdo neřekl proč.
            <br />
            Zkuste to <em>daty</em>.
          </h1>
          <p className="lp-lead">
            Únava, bolesti, trávení, výkyvy — potíže, na které vyšetření nic nenašla. Chybí u nich
            obvykle jedno: souvislá řada pozorování v čase. Deset minut v ordinaci ji nenahradí,
            protože souvislost bývá vidět až po týdnech a s odstupem několika dní.
          </p>
          <p className="lp-lead">
            Zapisujte si pár vět denně. Až toho bude dost, stáhnete si všechno jedním klikem a
            necháte to vyhodnotit AI, která hledá opakující se vzorce — mezi tím, co jíte, jak
            spíte, co berete a jak se pak cítíte. <strong>Tohle před pár lety nešlo.</strong> Dnes
            to zvládne kdokoli za pár minut denně.
          </p>

          <div className="lp-cta">
            <Link className="lp-btn" href={cta.href}>
              {cta.label}
            </Link>
            {!pokracovat && <span className="lp-note">Pár otázek. Zaplatíte, až uvidíte, co vznikne.</span>}
          </div>
        </section>

        <section aria-label="Video s vysvětlením">
          {videoSrc ? (
            <div className="lp-video">
              <video controls preload="metadata" playsInline poster={poster ?? undefined}>
                <source src={videoSrc} />
                Váš prohlížeč neumí přehrát video.
              </video>
            </div>
          ) : (
            <div className="lp-video">
              <div className="lp-video-empty">
                Sem přijde video. Nahraj soubor do <code>public/video/uvod.mp4</code> a objeví se tady.
              </div>
            </div>
          )}
          <p className="lp-caption">Za dvě minuty vysvětlím, jak to funguje a proč to dává smysl.</p>
        </section>

        <section className="lp-personal">
          <p>
            Tenhle deník jsem si původně napsal pro sebe. Měl jsem potíže, se kterými si roky nikdo
            nevěděl rady — a teprve když jsem si začal poctivě zapisovat, co jím, jak spím a jak se
            pak cítím, začaly být vidět souvislosti, na které bych sám nepřišel.
          </p>
          <p>
            Pomohlo to mně a pak i lidem kolem mě. Nic to negarantuje a diagnózu to nenahradí. Ale
            když vám dosud nikdo nepomohl, sbírat data je nejlepší směr, který znám.
          </p>
          <p className="lp-sign">— Roman</p>
        </section>

        <section className="lp-sample" aria-label="Ukázka zápisu">
          <div className="lp-sample-head">
            <span>úterý 12. srpna</span>
            <span>Záznam</span>
          </div>

          <div className="lp-line">
            <span className="lp-time">07:40</span>
            <span>Špatně jsem se vyspal, budil jsem se okolo třetí.</span>
          </div>
          <div className="lp-line">
            <span className="lp-time">12:15</span>
            <span>Oběd — těstoviny, po nich těžká hlava.</span>
          </div>
          <div className="lp-line">
            <span className="lp-time">15:00</span>
            <span>Zase ten útlum, tentokrát slabší než včera.</span>
          </div>

          <div className="lp-scale">
            <b>Energie</b>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <span key={n} className={`lp-dot${n === 4 ? ' on' : ''}`}>
                {n}
              </span>
            ))}
          </div>
        </section>

        <section className="lp-steps">
          <div className="lp-step">
            <span>1</span>
            <h3>Řeknete, co chcete zjistit</h3>
            <p>Krátký dotazník. Třeba „proč mám odpoledne útlum“ nebo „co spouští migrény“. Bez registrace.</p>
          </div>
          <div className="lp-step">
            <span>2</span>
            <h3>Deník vznikne na míru</h3>
            <p>
              Jen pole, která k vaší otázce dávají smysl — obvykle pět. Uvidíte, co vznikne, a
              teprve pak se rozhodnete zaplatit.
            </p>
          </div>
          <div className="lp-step">
            <span>3</span>
            <h3>Data necháte vyhodnotit</h3>
            <p>
              Kdykoli si stáhnete celý deník jako dokument připravený pro AI. Ta v něm hledá
              opakující se vzorce a časové souvislosti — a vy máte konečně co ukázat lékaři.
            </p>
          </div>
        </section>

        <div className="lp-boundary">
          <p>
            Deník neurčuje diagnózu, nedoporučuje léčbu a nenahrazuje lékařské vyšetření. Zapisujete
            si vlastní pozorování a sami rozhodujete, komu je ukážete. Vyhodnocení dat je podklad
            k přemýšlení a k rozhovoru s odborníkem, ne lékařský závěr.
          </p>
        </div>

        <section className="lp-end">
          <h2>Nejtěžší je začít si všímat.</h2>
          <p className="lp-lead" style={{ marginTop: 6 }}>
            Zbytek už je jen pár vět denně.
          </p>
          <div className="lp-cta">
            <Link className="lp-btn" href={cta.href}>
              {cta.label}
            </Link>
            {!pokracovat && (
              <Link className="lp-login" href="/app/prihlaseni">
                Už mám účet
              </Link>
            )}
          </div>
        </section>

        <footer className="lp-foot">
          <span>Deník pozorování</span>
          <span>Data jsou uložená zašifrovaně. Kdykoli je smažete.</span>
        </footer>
      </div>
    </div>
  );
}

/**
 * Kdo už je rozjetý, nemá na úvodní stránce vidět „Přihlásit se“ a „Sestavit deník“.
 * Nepřihlášený návštěvník bez rozepsaného dotazníku tímhle neplatí ani jeden dotaz do databáze.
 */
async function kdePokracovat(cookies: Record<string, string>): Promise<Props['pokracovat']> {
  const { ACCOUNT_COOKIE, verifyAccountSession } = await import('../lib/session');
  const session = await verifyAccountSession(process.env.AUTH_SECRET || '', cookies[ACCOUNT_COOKIE]);

  if (session) {
    const { findAccountById } = await import('../lib/accounts');
    const { getEntitlement, hasAccess } = await import('../lib/billing');
    const { nextStepPath } = await import('../lib/onboarding');
    const account = await findAccountById(session.a);
    if (account && account.status !== 'deleted') {
      const access = hasAccess(await getEntitlement(account.accountId));
      const href = nextStepPath(account.onboarding, access, account.slug);
      return { href, label: access ? 'Můj deník' : 'Dokončit objednávku' };
    }
  }

  const { DRAFT_COOKIE, draftIdFromCookie, getDraft } = await import('../lib/drafts');
  const draft = await getDraft(draftIdFromCookie(cookies[DRAFT_COOKIE]));
  if (draft && !draft.accountId) {
    return draft.submittedAt
      ? { href: '/app/platba', label: 'Zpřístupnit deník' }
      : { href: '/dotaznik', label: 'Dokončit dotazník' };
  }
  return null;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = process.env.DEFAULT_TENANT_SLUG;
  if (slug) return { redirect: { destination: `/t/${slug}`, permanent: false }, props: {} as any };

  // Selhání téhle části nesmí shodit úvodní stránku – v nejhorším se ukáže jako nepřihlášenému.
  const pokracovat = await kdePokracovat(ctx.req.cookies ?? {}).catch(() => null);

  // Video stačí nahrát do public/video/ – žádná konfigurace. Bere se první nalezený formát.
  const dir = path.join(process.cwd(), 'public', 'video');
  const candidates = ['uvod.mp4', 'uvod.webm', 'uvod.mov'];
  let videoSrc: string | null = null;
  for (const name of candidates) {
    if (fs.existsSync(path.join(dir, name))) {
      videoSrc = `/video/${name}`;
      break;
    }
  }
  const poster = fs.existsSync(path.join(dir, 'uvod.jpg')) ? '/video/uvod.jpg' : null;

  return { props: { videoSrc, poster, pokracovat } };
};
