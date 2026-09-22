import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import AppShell from '../components/AppShell';
import { BRAND } from '../lib/brand';
import {
  ACCESS_MONTHS,
  EXPORT_GRACE_DAYS,
  PURCHASE_POLICY_VERSION,
  REFUND_DAYS,
} from '../lib/purchase-policy';

interface SellerInfo {
  name: string;
  ico: string;
  address: string;
  email: string;
}
interface Props {
  seller: SellerInfo | null;
}

export default function PurchaseTermsPage({ seller = null }: Props) {
  return (
    <AppShell
      title="Podmínky přístupu a vrácení peněz"
      subtitle="Jeden rok pro vaše pozorování. Tři dny na rozhodnutí, jestli vám deník vyhovuje."
      back={{ href: '/', label: 'Zpět na úvod' }}
    >
      <article className="card stack">
        {seller && (
          <section id="provozovatel">
            <h2>Provozovatel a kontakt</h2>
            <p>
              <strong>{seller.name}</strong>
              <br />
              IČO: {seller.ico}
              <br />
              Sídlo: {seller.address}
            </p>
            <p>
              Podpora, odstoupení a reklamace:{' '}
              <a href={`mailto:${encodeURIComponent(seller.email)}`}>{seller.email}</a>
            </p>
          </section>
        )}
        <p>
          Tyto produktové podmínky popisují délku placeného přístupu, obsah balíčku a vrácení peněz za službu{' '}
          {BRAND.name}. Platí pro objednávky, u kterých byly před zaplacením výslovně přijaty. Dřívější
          objednávky se řídí podmínkami sjednanými při jejich nákupu; tato stránka je zpětně nemění.
        </p>

        <section id="pristup">
          <h2>Jednorázová platba za {ACCESS_MONTHS} měsíců</h2>
          <p>
            Kupujete si přístup na dobu určitou: {ACCESS_MONTHS} kalendářních měsíců od úspěšného zaplacení.
            Po tuto dobu můžete používat svůj deník a funkce zahrnuté v zakoupeném balíčku. Přesné datum konce
            přístupu najdete ve svém účtu.
          </p>
          <p>
            Cena je jednorázová a její konečnou výši vidíte před potvrzením platby. Přístup se automaticky
            neprodlužuje a další platba se sama nestrhne. Pokud bude prodloužení dostupné, bude vyžadovat
            novou objednávku a váš výslovný souhlas.
          </p>
        </section>

        <section>
          <h2>Co je v přístupu zahrnuto</h2>
          <p>
            AI sestavení deníku podle vašich odpovědí, zapisování a prohlížení vlastních pozorování, export
            záznamů a jedno úspěšně dokončené AI vyhodnocení. Vyhodnocení spouštíte sami, po samostatném
            souhlasu se zpracováním vybraných zdravotních údajů.
          </p>
          <p>
            Vyhodnocení se odemkne nejdříve po 21 dnech od zaplacení a po nasbírání 21 různých dní se záznamem
            od zaplacení. Tyto dny nemusí následovat po sobě. Nárok je potřeba využít během placeného
            přístupu. Neúspěšný technický pokus jej nespotřebuje. Jde o jedno vyhodnocení pro účet, nikoli o
            opakované rozbory po každé změně deníku.
          </p>
          <p>
            AI přehled nabízí podněty k dalšímu pozorování a konzultaci. Nejde o diagnózu ani léčebný plán.
            Počet záznamů ani uplynutí tří týdnů nezaručují nalezení příčiny potíží nebo zlepšení zdraví.
          </p>
        </section>

        <section id="vraceni-penez">
          <h2>{REFUND_DAYS} dny na vyzkoušení s vrácením celé ceny</h2>
          <p>
            Pokud vám deník nevyhovuje, můžete do 72 hodin od úspěšného zaplacení uplatnit naši garanci.
            Vrátíme vám celou zaplacenou cenu, bez udání důvodu a bez srážky za to, že jste si už nechali
            deník sestavit nebo do něj zapisovali. Neúčtujeme poplatek za vyřízení.
          </p>
          <p>
            Garanci uplatníte v účtu na stránce{' '}
            <Link href="/app/vraceni-penez">Vrácení peněz a odstoupení od smlouvy</Link>. Je tam uvedený také
            přesný konec 72hodinové lhůty. Rozhoduje včasné odeslání požadavku, nikoli okamžik, kdy platba
            dorazí zpět na váš účet.
          </p>
          <p>
            Peníze vracíme stejným platebním prostředkem bez zbytečného odkladu, nejpozději do 14 dnů od
            uplatnění garance. Připsání refundace může záviset také na vaší bance. Po vrácení platby končí
            placený přístup k deníku.
          </p>
          <p>
            <strong>
              Tato dobrovolná garance neomezuje vaše zákonná práva. Tři dny nejsou zkrácením zákonné lhůty pro
              odstoupení od smlouvy ani lhůty pro reklamaci.
            </strong>
          </p>
        </section>

        <section id="odstoupeni">
          <h2>Zákonné odstoupení od smlouvy</h2>
          <p>
            Spotřebitel má u služby sjednané přes internet zpravidla právo odstoupit do 14 dnů od uzavření
            smlouvy bez udání důvodu. Pro tento balíček po vás nepožadujeme vzdání se tohoto práva při
            zpřístupnění deníku. Výslovná žádost o zahájení služby ihned po zaplacení není vzdáním se práva na
            odstoupení.
          </p>
          <p>
            Odstoupení můžete odeslat pomocí volby <Link href="/app/vraceni-penez">Odstoupit od smlouvy</Link>
            . Před odesláním své rozhodnutí samostatně potvrdíte. Není potřeba uvádět důvod. Zpracování
            finančního vypořádání nemění zaznamenaný okamžik odeslání odstoupení. Tímto postupem nejsou
            vyloučeny jiné zákonné způsoby jeho uplatnění.
          </p>
          <p>
            Mimo naši třídenní garanci se podmínky vrácení platby řídí zákonem. Pokud jsme na vaši výslovnou
            žádost začali poskytovat službu ještě před uplynutím lhůty pro odstoupení, může být podle
            zákonných podmínek zohledněna poměrná cena již poskytnutého plnění. V rámci třídenní garance tuto
            úhradu nepožadujeme. Zákonné odstoupení není spojeno se smluvní pokutou.
          </p>
        </section>

        <section id="konec-pristupu">
          <h2>Co se stane po roce</h2>
          <p>
            Po uplynutí {ACCESS_MONTHS} měsíců skončí možnost přidávat nebo měnit záznamy a spouštět AI
            funkce. Dalších {EXPORT_GRACE_DAYS} dní máte k dispozici export dosavadních záznamů a dokončeného
            AI přehledu, abyste si své podklady mohli uložit. Vlastní kopii doporučujeme průběžně stahovat už
            během používání.
          </p>
          <p>
            Po této dodatečné lhůtě končí smluvně zajištěný přístup i možnost exportu prostřednictvím
            aplikace. Tím není dotčeno vaše právo požadovat přístup k osobním údajům nebo další zákonná práva.
            Konec přístupu není totéž jako okamžité smazání všech údajů; o zpracování a možnostech výmazu se
            dočtete na stránce <Link href="/jak-chranime-data">Jak pracujeme s vašimi daty</Link>.
          </p>
          <p>
            Případné ukončení prodeje nových přístupů nezkracuje již zaplacené období. Těmito podmínkami si
            nevyhrazujeme právo libovolně ukončit váš zaplacený přístup před sjednaným koncem. Po řádném
            uplynutí sjednané doby nevzniká závazek provozovat službu pro účet neomezeně dlouho.
          </p>
        </section>

        <section>
          <h2>Vaše práva při problémech se službou</h2>
          <p>
            Garance ani doba přístupu nevylučují odpovědnost za vady či neposkytnutí služby a související
            zákonné nároky. Technická nefunkčnost služby se posuzuje odděleně od toho, zda pozorování přinese
            očekávaný osobní přínos. Samotné nenalezení jednoznačné souvislosti v deníku není příslibem, že AI
            takovou souvislost musí najít.
          </p>
        </section>

        <p className="hint">Verze produktových podmínek: {PURCHASE_POLICY_VERSION}</p>
        <Link className="btn btn-primary" href="/app/vraceni-penez">
          Vrácení peněz a odstoupení od smlouvy
        </Link>
        <Link href="/dotaznik">Zpět k sestavení deníku</Link>
      </article>
    </AppShell>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  // Only public operator details leave the server. Incomplete configuration is not published.
  const seller: SellerInfo = {
    name: process.env.SELLER_NAME?.trim() ?? '',
    ico: process.env.SELLER_ICO?.trim() ?? '',
    address: process.env.SELLER_ADDRESS?.trim() ?? '',
    email: process.env.SUPPORT_EMAIL?.trim() ?? '',
  };
  return { props: { seller: Object.values(seller).every(Boolean) ? seller : null } };
};
