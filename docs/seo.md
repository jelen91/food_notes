# Rozumím tělu: organické vyhledávání

## Témata a vyhledávací záměr

| Veřejná cesta | Hlavní téma | Doplňující otázky a výrazy |
| --- | --- | --- |
| `/potize-s-travenim` | Potíže s trávením a nadýmání po jídle | Bolesti břicha po jídle, nafouklé břicho, deník jídla a příznaků, co sledovat a kdy k lékaři |
| `/migreny-a-bolesti-hlavy` | Migrény a opakované bolesti hlavy | Deník bolesti hlavy, možné spouštěče, co zapisovat, jak dlouho sledovat bolest |
| `/unava-a-nedostatek-energie` | Dlouhodobá únava a nedostatek energie | Únava i po spánku, únava po jídle, záznam spánku a energie, kdy se poradit s lékařem |

Jde o kvalitativní volbu podle tématu služby a vyhledávacího záměru, nikoli o ověřený žebříček hledanosti. Nemáme export objemů z Keyword Planneru ani data nového webu ze Search Console. Po nasazení rozhodovat o dalších tématech podle skutečných dotazů, návštěv a dokončených objednávek, nikoli vytvářet kopie stránek pro každou variantu stejného slova.

## Co je implementováno

- Popisné české cesty bez diakritiky, oddělené pomlčkami. Interní slugs objednávek a dotazníků se nemění.
- Trvalé přesměrování 308 z původních `/lp/traveni`, `/lp/migreny`, `/lp/unava`, včetně zachování query parametrů. Staré adresy nemají vlastní indexovatelnou kopii stránky.
- Jedinečné title, description a H1 pojmenovávající téma. Každá stránka má vlastní praktický obsah, jasné meze deníku, tematické otázky a odkazy na zdravotnické zdroje.
- Plný text v serverovém HTML. Průvodci ani odpovědi nejsou závislé na spuštění JavaScriptu.
- Drobečková navigace, propojení témat z homepage i mezi stránkami a stručný obsah průvodce s kotvami.
- Canonical a Open Graph URL bez UTM či jiných query parametrů; sitemap obsahuje nové adresy. Parametry mohou zůstat v reklamním odkazu, do metadat se nepropíší.
- JSON-LD `WebSite`, `WebPage` a u témat `BreadcrumbList`. Žádná vymyšlená hodnocení, autorství lékaře, diagnózy ani cena odlišná od ověřené nabídky.
- Účty, dotazník a deníky zůstávají mimo sitemap a mají omezené indexování. Autorizace nad soukromými záznamy zůstává samostatnou ochranou.
- Neexistující veřejná témata vrací skutečnou 404.

## Po připojení domény a nasazení

1. Ověřit HTTPS a jednu hlavní variantu `https://rozumimtelu.cz`; ostatní hosty přesměrovat v hostingu. Ponechat funkční staré cesty s přesměrováním.
2. Ve vlastním Google Search Console ověřit doménu a odeslat `https://rozumimtelu.cz/sitemap.xml`. U homepage a tří témat zkontrolovat publikovanou URL a požádat o indexaci. Z lokálního náhledu nelze indexaci provést.
3. Sledovat dostupnost, indexaci a později dotazy, imprese, prokliky a CTR po jednotlivých stránkách. Ověřit chování a rychlost skutečného nasazení na mobilu; lokální kontrola není měření produkčních Core Web Vitals.
4. Doplňovat originální, užitečné příklady a odpovědi na skutečné dotazy zákazníků. Zdravotní vysvětlení aktualizovat podle primárních zdrojů; případnou odbornou kontrolu uvádět až po jejím skutečném provedení a se souhlasem uvedeného odborníka.

Změna URL ani technická připravenost nezaručují indexaci, konkrétní pozici či návštěvnost. U zdravotních témat je zvlášť důležitá důvěryhodnost obsahu. Přidání FAQ neznamená příslib rozšířeného výsledku vyhledávání.

## Podklady

- [Google: srozumitelná struktura URL](https://developers.google.com/search/docs/crawling-indexing/url-structure)
- [Google: trvalá přesměrování](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
- [Google: užitečný a důvěryhodný obsah](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google: drobečková navigace](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Google: pravidla strukturovaných dat](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)

Odborné podklady jednotlivých průvodců jsou přímo v jejich viditelné sekci „Zdroje a další čtení“.
