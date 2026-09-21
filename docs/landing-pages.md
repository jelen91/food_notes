# Landing pages a prodejní cesta

Veřejné stránky používají společnou komponentu `components/marketing/LandingPage.tsx` a samostatný obsah v `lib/landing-pages.ts`:

- `/` — přehled produktu;
- `/lp/traveni` — jídlo, trávení a nadýmání;
- `/lp/migreny` — migrény a bolesti hlavy;
- `/lp/unava` — únava a energie;
- `/jak-chranime-data` — technický, srozumitelný popis zacházení s daty. Nenahrazuje kompletní právní informace provozovatele.

## Přidání dalšího tématu

Do `LANDING_PAGES` přidej objekt typu `LandingPageContent` s unikátním jednoduchým slugem. Obsahuje titulek a popis pro vyhledávače, nadpis, vysvětlení hodnoty, tematický příběh a rozpoznatelné situace (`story`), upravitelnou úvodní otázku dotazníku, ilustrační zápisy, ukázku AI přehledu (`analysisDemo`), oblasti sledování a jednu tematickou FAQ. Dynamická cesta `/lp/[slug]` stránku automaticky vykreslí a homepage ji nabídne mezi tématy. Neznámá cesta vrátí 404.

CTA vede na `/dotaznik?tema=<slug>`. Téma pouze předvyplní novou hlavní otázku; uložené odpovědi nepřepisuje. Nejde o reklamní měření ani automatickou diagnózu. Dotazník, platba a návrat do aplikace mají zachovanou stávající cestu zákazníka.

Texty nejprve pojmenovávají prožitek opakovaných potíží, nejistotu a přání najít cestu k úlevě. Každé téma má vlastní hero i sekci `story` se situacemi, ve kterých se návštěvník může poznat. Výzva „Chci najít svůj směr“ vede na bezplatný dotazník. Text u nabídky vysvětluje hodnotu záznamů mezi návštěvami lékaře a jejich využití při konzultaci. Netvrdí, že AI nahrazuje odbornou péči nebo určí léčbu.

Nabídka propojuje tři kroky: AI sestaví deník na míru, zákazník zaznamenává vlastní pozorování a po splnění podmínek si jednou spustí osobní AI vyhodnocení. Zdůrazňuje smysluplný rozsah, pravidelnost, srovnatelná měření a zápisy i ve dnech bez potíží. Více relevantního kontextu dává více možností porovnávat; samotný počet údajů nezaručuje přesnost nebo nalezení souvislosti.

Nepřidávej do obsahu záruky zdravotního výsledku, neexistující reference nebo funkce dostupné pouze v ručně vytvořených legacy denících. Služba neuděluje diagnózu, nepotvrzuje příčinu a nenavrhuje léčbu. Minimum 21 dní je produktová podmínka, nikoli klinicky ověřená doba potřebná k určení příčiny. Ilustrační počty a data v ukázkách musí zůstat zřetelně označené jako vymyšlený příklad.

## Cena

Jediným zdrojem ceny je aktivní jednorázová cena `STRIPE_PRICE_ID`, kterou používá checkout. `lib/offer.ts` ji serverově načítá přes Stripe s omezením čekání a cache. Do prohlížeče jde jen formátovaná cena a příznak dostupnosti. Pokud ji nelze ověřit, platební tlačítko je neaktivní; žádnou náhradní cenu nevymýšlíme.

Podle zadání je v lokálním Stripe testovacím nastavení vytvořena/použita cena **949 Kč**. Původní testovací cena nebyla smazaná. Přepnutí na produkci vyžaduje skutečný live klíč, live cenu 949 Kč a odpovídající webhook secret. Testovací ID ceny v live účtu nefunguje. Klíče patří do prostředí, ne do zdrojového kódu.

## Ukázka a vizuál

`JournalDemo.tsx` je funkční ukázka se třemi záložkami: dnešní zápis, AI přehled a export. Lze měnit škálu 0–5, přidat poznámku a stáhnout vzorový Markdown. AI záložka a sekce `#vyhodnoceni` ukazují ručně připravený ilustrační přehled pro téma stránky: konkrétní počty a data, možné vysvětlení s nejistotou, další sledování a otázku pro konzultaci. Ukázka nevolá AI. Texty drží jen v React state; neposílá je na server ani do localStorage. Obnovení stránky ukázku smaže.

`styles/marketing.css` obsahuje styl veřejných stránek a malé sjednocení barev/formulářů v existující aplikaci. Nepoužíváme vzdálené fonty, reklamní skripty ani cizí obrázky. HTML má jazyk `cs`. Veřejné LP mají vlastní titulky, description a Open Graph metadata; canonical se sestavuje jen z platné veřejné HTTPS `APP_URL`. Žádné parametry dotazníku se do canonical nepřidávají.

## Sestavení deníku: dotazník v3 a prompt v4

Dotazník v `lib/questionnaire.ts` má čtyři části a tři povinné odpovědi. Verze 3 přidává kontext načasování, rozdíly mezi lepšími a horšími dny a dosavadní sledování. Do AI jde minimalizovaný seznam otázek a odpovědí; nepřidáváme účet, e-mail ani platební údaje.

Generátor používá prompt verze 4 (`lib/tracker/prompt.ts`). Vychází z hlavní otázky a žádá jeden srovnatelný denní ukazatel, relevantní další kontext a vysvětlení, co zapsat a proč. Míra potíží má mít nulu pro den bez potíží; neznámý údaj má zůstat prázdný. Čas události znamená skutečný výskyt, ne čas zápisu. Návrh nesmí jen potvrzovat uživatelův podezřívaný spouštěč.

Nezávislá kontrola `lib/tracker/design-quality.ts` ověřuje mimo jiné:

- nejvýše 5 / 8 / 12 / 16 denních polí podle časové volby;
- nejvýše dvě denní sekce a čtyři nepovinné kategorie událostí;
- jedno až dvě povinná denní pole a alespoň jedno stále viditelné srovnatelné měření;
- popis každého pole, jednotky číselných údajů a odhad denního času v zvoleném rozsahu.

Kontrola hodnotí strukturu návrhu, nikoli medicínskou správnost nebo kvalitu každé věty. Nevyhovující nový návrh se neuloží; uživatel může generování zopakovat. Již uložené deníky se tím nepřepisují.

## Jednorázové AI vyhodnocení

Stránka `/app/vyhodnoceni` a karta v deníku čtou stav z `/api/journal-analysis`. Server povolí spuštění jen při současném splnění obou podmínek:

1. Aktivní jednorázový nákup s ověřeným `paidAt`, od něhož uplynulo alespoň 21 × 24 hodin.
2. Alespoň 21 různých platných kalendářních dní s neprázdným normalizovaným záznamem, od dne nákupu do dneška v pásmu `Europe/Prague`.

Den nákupu se započítává, datum v budoucnosti ani před nákupem ne. Dny nemusí navazovat a není nutné vyplnit všechna pole. Počítají se platné odpovědi včetně nuly/„ne“, poznámky nebo události; prázdný den se nezapočte. Zpětné doplnění skutečného pozorování v povoleném období je možné. Nejde o ověření poctivosti zápisu nebo záruku kvality dat. Staré záznamy bez dohledatelné definice polí se nepřekládají odhadem.

Spuštění je ruční, se samostatným verzovaným výslovným souhlasem. Běžné denní zápisy se do AI průběžně neposílají. Jednou zakoupený nárok se spotřebuje až uložením úspěšně dokončeného přehledu. Současné požadavky a opakované načtení stránky nevyvolají druhý úspěšný rozbor; neúspěch ponechá nárok na nový pokus. Hotový přehled zůstává dostupný, pozdější úpravy a nové zápisy jej automaticky nemění. Zákazník může v deníku pokračovat.

Podklad vychází z historických verzí polí příslušných ke zvoleným dnům. Obsahuje nejvýše 90 nejnovějších zaznamenaných dní, které se vejdou do limitu 150 000 UTF-8 bajtů celého zadání. Vynechávají se nejstarší celé dny; text uvnitř vybraného dne se nezkracuje. Do rozboru se musí vejít nejméně 21 dní, jinak se analýza nespustí a nárok zůstane zachovaný. Rozsah a vynechané dny se ukazují ve výsledku. Nepřidáváme identifikátory účtu, e-mail ani platbu, ale osobní údaje zadané uživatelem do volného textu mohou být součástí vybraných záznamů.

Výstup obsahuje shrnutí, kvalitu dat, opakující se vzorce s odkazy na konkrétní dny, možná vysvětlení a jejich nejistoty, další pozorování, otázky pro lékaře a limity. Může také uvést, že jasný vzorec nelze doložit. Server kontroluje schéma a odkazovaná data před uložením; nejde o klinické ověření AI. Výstup i souhlas se ukládají šifrovaně. Přehled lze stáhnout jako text nebo vytisknout do PDF.

## Opravená funkčnost

- HTTP 202 při potvrzování platby nadále znamená čekání na webhook, nikoli úspěšné přihlášení.
- Nově zakoupený přístup k již existujícímu e-mailu automaticky neotevře cizí účet. Auto přihlášení vyžaduje serverový důkaz nového účtu, shodu nákupu a workspace; staré drafty bez důkazu vyžadují přihlášení.
- Dotazník nemá časovanou imitaci generování. Objednávka ukazuje skutečné odpovědi a vysvětluje, že vlastní deník se sestaví po zaplacení.
- Souhlas se žádá před odesláním odpovědí, ověřuje na API a ukládá se šifrovaně s přesným zněním, verzí a serverovým časem. Formulář má přístupné popisky a ukazatel kroků.
- Obnovení stránky při generování obnoví pouze kontrolu stavu, nespouští nové placené generování.
- Ukládání dne je sériové. Starší odpověď nepřepíše novější zápis ani jiný den; při chybě zůstanou změny k opakování. Před změnou dne aplikace počká na uložení. Nejde o offline režim nebo koordinaci souběžných editací ve více tabech.

## Lokální ověření

Použij podporovaný Node (ověřeno na Node 24.15.0), `npm ci`, `npm test`, `npm run lint`, `npm run typecheck` a `npm run build`. Nemíchej běžící dev server a produkční build nad stejnou složkou `.next`.

Pokud běží i vývojový server, pro nezávislé sestavení a náhled nastav `FOOD_NOTES_PREVIEW=1` jak u `npm run build`, tak u `npm run start -- --port 3015`. Použije se samostatná složka `.next-preview`; běžný provoz dál používá `.next`. Proměnné databáze a externích služeb pro testování nastav zvlášť na vývojové hodnoty.

Účty, webhooky a citlivé stavy byly ověřeny mockovanými testy. Browser kontrola používá izolované prostředí a mockované zápisy/platby; není potvrzením celého živého nákupu přes Stripe a MongoDB. Před spuštěním reklam je potřeba test skutečného testovacího nákupu, doručení e-mailu, přihlášení z jiného zařízení a vytvoření deníku s testovacími údaji.


## Před ostrým prodejem

Nasazené veřejné stránky zatím nelze považovat za potvrzení funkčního živého prodeje. Z předchozího lokálního nastavení zůstávají k dokončení:

- Stripe live klíče, live jednorázová cena 949 Kč a odpovídající webhook; dosavadní cena je testovací.
- Resend, ověřený odesílatel a praktické ověření doručení přístupových i obnovovacích e-mailů.
- Jméno nebo firma provozovatele, IČO, sídlo, kontakt podpory a konečné obchodní a informační dokumenty.
- Veřejná HTTPS doména, provozní databáze a tajné klíče, funkční poskytovatel AI a ověřená dostupnost zvoleného modelu.
- Celý nákup se syntetickými údaji v testovacím prostředí: platba → webhook → e-mail → přihlášení → vytvoření deníku → zápisy → oprávněné jednorázové vyhodnocení → export/smazání. Čekací lhůtu ověřovat v izolované sadě dat, ne změnou skutečného nákupu zákazníka.

Testy s mockovaným poskytovatelem neověřují kvalitu živých odpovědí ani doručení e-mailů. Před kampaní otestuj aktuální generátor i rozbor na syntetických scénářích; neposílej do modelu skutečné zákaznické údaje bez odpovídajícího pokynu a souhlasu.

Pro reklamu drž tvrzení ve shodě s implementovanou nabídkou. [Google Ads: Misrepresentation](https://support.google.com/adspolicy/answer/6020955?hl=en) požaduje pravdivý popis, cenu a dostupné funkce; vyhni se zárukám zdravotního výsledku a tlaku vyvolávanému strachem. U témat zdraví ověř [omezení personalizované reklamy](https://support.google.com/adspolicy/answer/143465?hl=en), zejména vlastní remarketingová publika. Zdravotní odpovědi a denní záznamy nepoužívej jako reklamní data. [NHS k migrénám](https://www.nhs.uk/conditions/migraine/) popisuje deník jako pomůcku pro sledování možných spouštěčů; tím nepodporuje tvrzení, že konkrétní AI produkt příčinu určí nebo potíže vyřeší.
