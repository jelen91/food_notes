# Doba přístupu a garance vrácení peněz

Pracovní produktová a implementační specifikace, ověřeno 12. 9. 2026. Nejde o potvrzení úplnosti finálních obchodních podmínek. Veřejná stránka `/podminky` záměrně nese název „Podmínky přístupu a vrácení peněz“; neobsahuje vymyšlenou identitu provozovatele.

## Rozhodnutí pro tuto verzi produktu

- Nové objednávky přijímají verzi `2026-09-12.purchase.v1` před přesměrováním k platbě. Přijetí musí být svázané s konkrétní objednávkou a dohledatelné po zaplacení. Nepřidělovat novou verzi zpětně existujícím zákazníkům.
- Jednorázová platba kupuje **12 kalendářních měsíců od úspěšné platby**, bez automatického prodloužení nebo další automatické platby. Časové termíny jsou uložené na serveru a zobrazované v účtu.
- Poté následuje **30 dní jen pro export** dosavadních zápisů a hotového AI přehledu. Další tvorba deníku, zápisy a spouštění AI už nejsou součástí přístupu. Konec exportu neznamená zánik zákonných práv k osobním údajům ani příslib okamžitého smazání databázových dokladů.
- **72 hodin od platby: celá zaplacená cena zpět bez důvodu a bez poplatku**, i když už byla vytvořena struktura deníku nebo uloženy zápisy. Rozhoduje čas včasného požadavku, nikoli dokončení komunikace se Stripe. Technické selhání nebo opakování požadavku nesmí vytvářet další refundace nebo zákazníkovi spotřebovat včas uplatněný nárok.
- Po třech dnech zůstává samostatná možnost **odeslat zákonné odstoupení**, nikoli jen žádat o souhlas provozovatele s jeho účinností. Vypořádání případné poměrné úhrady je samostatné rozhodnutí podle práva a okolností, ne automatické zamítnutí kvůli konci 72 hodin.
- AI vyhodnocení: jedno úspěšné pro účet; aktivní přístup; nejméně 21 dní od platby i 21 různých dní se záznamem od platby; samostatný souhlas; neúspěch nárok neodebere. Využít během placeného období.

## Co to znamená pro případné ukončení podnikání

Pro nové smlouvy je konec závazku předem konkrétní: poskytovat přístup do konce zaplacených 12 měsíců a poté zajistit dohodnutých 30 dní na export. Zastavení prodeje nekrátí již prodané období. Prakticky lze ukončit prodej, zjistit nejpozdější termín všech běžících smluv a naplánovat konec provozu až po jejich dokončení. Případné dřívější ukončení vyžaduje řešit práva zákazníků, vypořádání a zpřístupnění dat; pouhá věta „garantujeme jeden rok“ neopravňuje během tohoto roku službu bez náhrady vypnout.

Starší nákupy bez této verze podmínek nemají automaticky nově zavedený konec. Je nutné zjistit, co jim bylo skutečně slíbeno, a řešit je samostatně. Expirace přístupu rovněž neruší povinnosti kolem vyřizování práv k datům, zákonné evidence a spotřebitelských nároků.

U průběžně poskytované digitální služby se počítá s funkčností a potřebnými aktualizacemi po dobu sjednaného plnění. Předčasné neposkytnutí nebo vady mohou založit nároky zákazníka. [ČOI: smlouvy o digitálním obsahu a službách](https://coi.gov.cz/faq/smlouvy-o-poskytovani-digitalniho-obsahu-ci-sluzby/)

## Proč tři dny nenahrazují zákonné odstoupení

Vedení a ukládání deníku v cloudu má znaky průběžné digitální služby. Personalizace struktury AI sama o sobě bezpečně neprokazuje, že se na celý roční balíček nevztahuje odstoupení. Nezavádíme automatickou výjimku „na míru = bez vrácení peněz“.

U služeb ČOI popisuje základní 14denní možnost odstoupení a výjimku při úplném poskytnutí služby za splnění dalších podmínek. Výslovná žádost o okamžité zahájení není totožná se vzdáním se práva u průběžné roční služby. Poměrnou cenu už poskytnutého plnění lze řešit jen při splnění zákonných předpokladů a správném předchozím poučení. [ČOI: nákup přes internet, část 7](https://coi.gov.cz/faq/a-nakup-pres-internet/)

Dobrovolná garance je proto přidaná jistota **vrácení celé částky i po použití během 72 hodin**, nikoli prezentace tří dnů jako jediného možného termínu pro odstoupení. Nepsat „po třech dnech už peníze nevracíme“. Nepředzaškrtávat souhlas, nespojovat okamžité zahájení s fikcí ztráty všech práv a nepovažovat zaplacení za samostatný výslovný souhlas.

Zákonnou lhůtu nelze obecně nahradit prostými `14 * 24` hodinami od platby: ČOI popisuje počítání od následujícího dne a posun konce připadlého na víkend či svátek. Samostatný kanál odstoupení proto nesmí být slepě zablokován klientským odpočtem. [ČOI: počítání lhůty](https://coi.gov.cz/faq/9-odstoupeni-od-smlouvy-do-14-dnu-u-digitalniho-obsahu/)

## Online odstoupení a změny od června 2026

**Ověřený evropský požadavek:** směrnice (EU) 2023/2673 přidala článek 11a do spotřebitelské směrnice. Není omezený na finanční služby: stanoví snadno dostupnou, viditelnou funkci odstoupení pro relevantní smlouvy uzavřené online. Členské státy mají opatření používat od 19. 6. 2026. [EUR-Lex: směrnice 2023/2673, čl. 1 bod 3 a čl. 2](https://eur-lex.europa.eu/legal-content/en/ALL/?uri=CELEX%3A32023L2673)

Pro implementaci:

1. Viditelný vstup „Odstoupit od smlouvy“ v účtu, podmínkách a patičce, dostupný po celou zákonnou lhůtu. Není to jen formulář na reklamaci nebo tlačítko časově omezené na 72 hodin.
2. Možnost poskytnout nebo potvrdit identitu, smlouvu a elektronický kontakt pro potvrzení. Již přihlášeného zákazníka zbytečně nenutit opisovat údaje.
3. Oddělené potvrzení jednoznačně nazvané „Potvrdit odstoupení“.
4. Bezodkladné potvrzení přijetí v trvalé podobě s obsahem prohlášení, datem a časem. Preferovat e-mail; samotná proměnlivá stavová stránka nebo interní záznam nestačí. Soubor ke stažení je užitečný doplněk, nikoli důvod vynechat provozní potvrzovací kanál.
5. Zpětné volání, schválení operátorem ani připsání refundace neposouvá čas právního podání.

**Český stav odlišit od evropského termínu:** nařízení vlády 66/2026 Sb. s účinností 19. 6. 2026 upravilo vzorové poučení o odkaz na online odstoupení a jeho potvrzení. Nařízení samo o sobě nedokládá účinnost každé související hmotněprávní změny občanského zákoníku. V načtených primárních podkladech nebylo samostatně ověřeno konečné české transpoziční ustanovení pro tlačítko; netvrdit zákazníkovi, že tato implementace představuje kompletní právní audit českých pravidel k datu nasazení. [e-Sbírka: aktuální nařízení 29/2023 Sb.](https://e-sbirka.gov.cz/sb/2023/29), [EUR-Lex: česká novela 66/2026 Sb.](https://eur-lex.europa.eu/legal-content/CS/TXT/PDF/?uri=NIM%3A202605368)

## Nutné před ostrým prodejem

- **Identita skutečného provozovatele:** jméno nebo firma, IČO, sídlo, telefon a kontaktní e-mail; podpora a adresát pro odstoupení/reklamace. Údaje doplnit do úplných podmínek a objednávky, neodhadovat z uživatelského jména počítače. Předsmluvní povinnosti zahrnují identitu, cenu, vlastnosti, podmínky plnění, trvání, odstoupení a reklamace. [MPO: předsmluvní informace](https://mpo.gov.cz/cz/ochrana-spotrebitele/prehledne-o-ochrane-spotrebitele/predsmluvni-informace--290823/)
- Úplné předsmluvní informace a obchodní podmínky, poučení i vzorový formulář odstoupení s doplněným adresátem, postup reklamace a údaje o příslušném subjektu mimosoudního řešení sporů. `/podminky` je produktová část, nikoli náhrada chybějící identity a všech dokumentů. Vzor formuláře nelze dokončit bez adresáta. [MPO: vzorové poučení a formulář](https://www.mpo.gov.cz/assets/cz/ochrana-spotrebitele/pravni-predpisy-pro-ochranu-spotrebitele/2023/2/Narizeni-vlady-c--29_2023-Sb-.pdf)
- Konečné potvrzení objednávky na trvalém nosiči včetně doby přístupu, ceny, verze přijatých podmínek a poučení; uchovat přesné historické znění podmínek, nikoli jen odkaz na později měnitelnou stránku.
- Funkční e-mail pro bezodkladné potvrzování odstoupení a provozní příjem pro ručně řešené případy. Pouhé vytvoření záznamu `withdrawal_requested` bez člověka/procesu jeho vypořádání nestačí.
- Ověřit Stripe refundace v testovacím režimu, webhooky a opakování stejného požadavku. Žádné skutečné refundace nebyly v rámci úpravy autorizovány ani provedeny.
- Finálně posoudit klasifikaci balíčku roční služby a AI výstupu, konkrétní poučení o případné poměrné ceně a českou účinnost transpozice při nasazení. Neprezentovat výsledek práce na kódu jako právní garanci.

Nejčistší řešení chybějících údajů není veřejný text s falešným IČO nebo výplní „DOPLNIT“, ale zachování testovacího prodeje do dokončení těchto údajů. Veřejná produktová stránka může zůstat srozumitelná; její název a rozsah nesmějí předstírat úplné VOP.

## Konfigurace pro otevření ostrých objednávek

Checkout s produkčním Stripe klíčem nyní odmítne vytvořit platbu, pokud chybí některá z následujících šesti neprázdných proměnných:

| Proměnná | Skutečný údaj nebo účel |
| --- | --- |
| `SELLER_NAME` | Jméno podnikatele nebo firma provozovatele. |
| `SELLER_ICO` | IČO skutečného provozovatele. |
| `SELLER_ADDRESS` | Úplná adresa sídla. |
| `SUPPORT_EMAIL` | Obsluhovaná kontaktní adresa pro podporu, odstoupení a reklamace. |
| `RESEND_API_KEY` | Serverový klíč pro odesílání potvrzení. Nikdy nepatří do veřejných props. |
| `EMAIL_FROM` | Odesílatel na ověřené doméně nakonfigurované v Resend. |

Čtyři veřejné údaje provozovatele se zobrazují na `/podminky` pouze tehdy, jsou-li všechny doplněné. Server nevydává klíč Resend ani další neveřejnou konfiguraci. Checkout s testovacími Stripe klíči `sk_test_…` a `rk_test_…` tomuto provoznímu požadavku nepodléhá, aby šlo ověřovat rozhraní bez vymýšlení údajů. Samotná přítomnost šesti hodnot není ověřením jejich pravdivosti, doručitelnosti e-mailu ani úplnosti právních dokumentů.

Současně jsou stále potřeba funkční `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, správné `APP_URL` a standardní databázová a autentizační konfigurace aplikace. Před ostrým provozem ověřit doručení skutečných potvrzení ve zvoleném testovacím postupu a nastavit odběr refund webhooků: `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded`. Žádný z testů přidaných při této úpravě skutečné e-maily ani platby neposílá.

## Provozní vyřízení refundů a odstoupení

Automatická garance si uloží čas podání před komunikací se Stripe. Ledger `refund_requests` je jedinečný podle Payment Intent a každý požadavek má neměnný idempotency key. Při chybě nebo nejasné odpovědi klient obnoví stav; opakování používá tentýž požadavek. Po 23 hodinách od jeho založení systém další Stripe create neprovádí, protože starší idempotency key nemusí být u poskytovatele uchován. Ověření už existujících refundů zůstává možné. Tyto limity nekrátí včas uplatněnou garanci.

Je nutné provozně sledovat `refund_requests` se stavy `review_required`, `failed` a dlouho nevyřízenými `processing` či `pending`, a příchozí záznamy v `withdrawal_requests`. Aplikace zatím neobsahuje administrační frontu ani automatické upozorňování provozovatele na tyto případy. Před prodejem musí být určený člověk a pravidelný postup jejich kontroly a včasného vypořádání; samotná existence databázového záznamu tuto povinnost neřeší.

U nejasného refundu nejprve ve Stripe dohledat původní platbu a všechny její refundy. Nevytvářet nový refund naslepo; ověřit částky, měnu, stav a vazbu na původní objednávku. Částečný nebo vícenásobný externí refund vyžaduje porovnání celé historie. Po dořešení finanční operace zachovat záznam původního požadavku i jeho čas a zkontrolovat doručení webhooku a výsledný stav přístupu. `pending` znamená zpracování u poskytovatele, nikoli připsání peněz zákazníkovi.

Záznam v `withdrawal_requests` potvrzuje **přijetí právního odstoupení**, nikoli čekání na souhlas provozovatele. Jeho obsah, identita, reference a původní datum a čas se nemají přepisovat. Zvlášť se posoudí zákonné podmínky a finanční vypořádání a zákazník se o vyřízení informuje přes skutečný kontaktní kanál. Neomezovat toto podání automatickým 72hodinovým ani prostým 14denním odpočtem.

Potvrzení odstoupení se ukládá před pokusem o e-mail. Stav `sent` znamená úspěšné předání poskytovateli, nikoli důkaz přečtení. Při `unavailable` nebo `failed` zůstává odstoupení přijaté a uživatel si může stáhnout TXT; provozovatel musí problém doručování dořešit. Finanční záznamy a obsah právního prohlášení včetně identifikačního e-mailu se uchovávají odděleně od zdravotního deníku; smazání účtu je automaticky neodstraňuje.
