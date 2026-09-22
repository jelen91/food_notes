import Link from 'next/link';
import AppShell from '../components/AppShell';

export default function DataPage() {
  return (
    <AppShell
      title="Jak pracujeme s vašimi daty"
      subtitle="Jak Rozumím tělu ukládá vaše záznamy a pracuje s AI"
      back={{ href: '/', label: 'Zpět na úvod' }}
    >
      <article className="card stack">
        <section>
          <h2>Co si zapisujete, zůstává oddělené od platby</h2>
          <p>
            Dotazník a deník obsahují vaše vlastní pozorování. U účtu evidujeme e-mail a údaje potřebné pro
            přístup. Platbu zpracovává Stripe; do jeho metadat posíláme pouze interní identifikátor účtu nebo
            rozpracovaného dotazníku, nikoli zdravotní odpovědi.
          </p>
        </section>
        <section>
          <h2>Šifrované uložení</h2>
          <p>
            Obsah odpovědí, denních zápisů, AI vyhodnocení a souhlasu s vyhodnocením ukládáme do databáze
            zašifrovaně. Každý deník má vlastní datový klíč. Šifrování chrání uložený obsah; server jej pro
            zobrazení přihlášenému uživateli dešifruje. Nejde tedy o koncové šifrování, ke kterému by
            provozovatel neměl přístup.
          </p>
        </section>
        <section>
          <h2>Jak se používá AI</h2>
          <p>
            Pro sestavení struktury deníku zpracuje jazykový model Claude od Anthropic otázky a vaše odpovědi.
            Nepřidáváme k nim e-mail, identifikátor účtu ani platební údaje. Do volného textu proto nepište
            jména a další identifikující údaje, které ke sledování nepotřebujete.
          </p>
          <p>
            Zápisy se k AI vyhodnocení odešlou pouze na váš pokyn a po samostatném výslovném souhlasu. Claude
            zpracuje vybrané denní zápisy a popisy polí deníku, včetně zdravotních údajů, které obsahují.
            Údaje o účtu a platbě k nim nepřidáváme. Vyhodnocení se nespouští průběžně na pozadí.
          </p>
          <p>
            Vybíráme nejvýše 90 nejnovějších celých zaznamenaných dní, které se vejdou do limitu rozboru.
            Poznámky uvnitř vybraných dní nezkracujeme; případné vynechané dny uvedeme u výsledku. Hotový
            přehled a znění souhlasu s časem přijetí se uloží zašifrovaně ve vašem účtu.
          </p>
        </section>
        <section>
          <h2>Export a smazání</h2>
          <p>
            V deníku můžete stáhnout záznamy za zvolené období a hotové AI vyhodnocení samostatně stáhnout
            nebo vytisknout. V nastavení účtu lze požádat o smazání účtu a jeho obsahu; při výmazu se
            odstraňuje také datový klíč. Nezaplacené rozpracované dotazníky mají dobu platnosti 30 dní. Jejich
            úklid probíhá při zakládání nových dotazníků, proto nemusí nastat přesně třicátý den.
          </p>
        </section>
        <section>
          <h2>Cookies a ukázka</h2>
          <p>
            Technické cookies udržují přihlášení a umožňují vrátit se k rozpracovanému dotazníku. Interaktivní
            ukázka na úvodní stránce ponechává zadaný text jen v paměti stránky. Po obnovení se vymaže.
            Ukázkové poznámky se neukládají na server.
          </p>
        </section>
        <Link className="btn btn-primary" href="/dotaznik">
          Pokračovat k dotazníku
        </Link>
      </article>
    </AppShell>
  );
}
