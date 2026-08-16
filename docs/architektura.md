# Architektura, soukromí a bezpečnost

Stav po milnících 1–3: účty a platby, dotazník a generování deníku přes Claude, zápis do
deníku, export a mazání účtu.

> Tento dokument **netvrdí, že aplikace je v souladu s GDPR** ani s jinými předpisy. Popisuje,
> co je technicky zavedené. Seznam bodů k právnímu posouzení je na konci.

## 1. Jaká data se ukládají

| Kategorie | Příklad | Kde |
| --- | --- | --- |
| Identita účtu | e-mail, hash hesla (scrypt), stav onboardingu | `accounts` |
| Přístup | druh a stav entitlementu, identifikátory Stripe, datum platby | `entitlements` |
| Provoz plateb | ID Checkout Session, ID a typ Stripe události | `checkout_sessions`, `stripe_events` |
| Krátkodobá tajemství | otisky tokenů na ověření e-mailu a reset hesla | `auth_tokens` (TTL) |
| **Zdravotní obsah** | denní záznamy, škály, události, laboratorní výsledky, PDF | `daily_notes`, `blood_tests` — **šifrované** |
| **Zdravotní obsah** | odpovědi z onboardingového dotazníku (i před platbou, viz [tok-zakaznika.md](tok-zakaznika.md)) | `questionnaire_responses` — **šifrované** |
| Konfigurace deníku | vygenerované definice trackeru (všechny verze) | `tracker_definitions` — **šifrované** |
| Konfigurace deníku | škály, kategorie, epizody | `tenants/*.json` v gitu (ruční zákazníci) |
| Provozní stopa | přihlášení, mazání dat | `audit_log` |

Hesla se ukládají jen jako scrypt hash se solí. Tokeny jen jako SHA-256 otisk.

## 2. Které údaje mohou být zdravotní

Denní záznamy, subjektivní škály, události (jídlo, léky, doplňky, nemoc), strukturované epizody,
laboratorní hodnoty, nahraná PDF a odpovědi z onboardingového dotazníku. Jde o zvláštní
kategorii osobních údajů podle čl. 9 GDPR — viz body k právnímu review.

## 3. Šifrování

Aplikace používá **envelope šifrování**, které v projektu existovalo už před touto změnou:

- `MASTER_KEY` (env) šifruje datový klíč zákazníka (DEK), uložený v `tenants`.
- DEK šifruje obsah dnů a laboratoří algoritmem AES-256-GCM.
- V čitelné podobě zůstává jen to, podle čeho se dotazujeme: `tenantId`, `date`, časová razítka.
- Smazání DEK činí zbylá data trvale nečitelnými (kryptografické skartování).

**Nejde o end-to-end šifrování.** Klíče drží server, takže provozovatel je technicky schopen
data přečíst. Tvrdit opak by bylo zavádějící. Vlastní kryptografie se nepoužívá — jen standardní
primitiva z `node:crypto` a WebCrypto.

## 4. Externí zpracovatelé

| Poskytovatel | Co dostane | Co nedostane |
| --- | --- | --- |
| **Stripe** | e-mail plátce, částka, interní identifikátor (`metadata.draftId` u platby bez účtu, jinak `metadata.accountId`) | žádné zdravotní údaje, žádné odpovědi z dotazníku, žádné záznamy |
| **Resend** | e-mailová adresa, text odkazu na ověření/reset/potvrzení platby | žádný zdravotní obsah |
| **MongoDB Atlas** | šifrovaný obsah deníků, provozní metadata | klíč `MASTER_KEY` (je jen v prostředí aplikace) |
| **Vercel** | běh aplikace, provozní logy | obsah deníků se do logů nezapisuje |
| **Anthropic** | minimalizované odpovědi z dotazníku (jen otázky a odpovědi) | jméno, e-mail, ID účtu, Stripe identifikátory, denní záznamy |

Údaje o kartě se k aplikaci nikdy nedostanou — platba probíhá na stránkách Stripe.
Export záznamů aplikace **nikam neposílá**; stáhne si ho uživatel a sám rozhodne, co s ním.

## 5. Izolace zákazníků

- Veškerý přístup k datům vede přes `lib/store.ts`, kde je `tenantId` prvním parametrem každé
  funkce a součástí filtru každého dotazu.
- Identita se bere výhradně z podepsané cookie. `accountId` ani `userId` z prohlížeče se ignorují.
- Autorizace se ověřuje dvakrát: v Edge middleware (podpis cookie) a znovu v každé Node routě
  (`requireAccount`, `requireTenant`) — skrytí prvku v UI se za ochranu nepovažuje.
- Session účtu a session zákazníka jsou odlišené druhem tokenu, takže jednu nelze použít místo druhé.
- Cookies: `HttpOnly`, `SameSite=Lax`, v produkci `Secure`.

## 6. Kdo technicky vidí produkční data

- **Provozovatel s přístupem k produkčnímu prostředí** (`MASTER_KEY` + přístup do databáze) si
  data technicky přečíst může. Aplikace to nijak nezakrývá.
- **Administrátorské nástroje** (`scripts/tenant.js`, `scripts/migrate-accounts.js`) ukazují jen
  metadata: ID, e-mail, stav platby, počty záznamů, stav klíčů. Obsah deníku nezobrazují a
  hromadný prohlížeč obsahu neexistuje.
- **Poskytovatelé infrastruktury** (Atlas, Vercel) mají přístup k šifrovaným datům a provozním
  logům podle svých podmínek.

Doporučený provozní režim: samostatné produkční přihlašovací údaje, žádné sdílené účty, žádné
kopírování produkčních dat do vývoje, přístup do produkční databáze jen pro konkrétní osoby.

## 7. Logy

Logují se jen provozní metadata: typ a ID Stripe události, výsledek zpracování, kategorie chyby,
stavové přechody. **Nelogují se** odpovědi z dotazníku, denní záznamy, obsah e-mailů, tajné klíče
ani celá těla požadavků. Chyby od Stripe a od e-mailového poskytovatele se ven vracejí jen jako
obecná hláška; podrobnost zůstává v serverovém logu.

## 8. Zálohy a mazání

Zálohy Atlasu obsahují **šifrovaný** obsah. Po smazání dat mohou v zálohách existovat do jejich
vypršení; smazáním DEK se stávají nečitelnými. Samoobslužný zákazník si účet smaže sám v `/app/účet` (potvrzení heslem): obsah deníku,
dotazník i všechny verze trackeru se smažou hned a spolu s nimi datový klíč, takže případné
kopie v zálohách zůstanou nečitelné. E-mail se přepíše a heslo zahodí. Doklady o platbě
zůstávají kvůli účetnictví a neobsahují žádný zdravotní obsah. U ručně stavěných zákazníků
maže data provozovatel příkazem `node scripts/tenant.js delete <id> --yes`.

Účetní doklady o platbách je zpravidla potřeba uchovávat déle než obsah deníku; datový model je
proto odděluje (`entitlements` vs. `daily_notes`). Konkrétní lhůty je nutné doplnit po právním
posouzení.

## 9. Následky případného neoprávněného přístupu

- Únik dumpu databáze bez `MASTER_KEY`: útočník získá e-maily, stavy plateb a metadata; obsah
  deníků zůstává nečitelný.
- Únik dumpu **i** `MASTER_KEY`: obsah deníků je čitelný — proto klíč nepatří do repozitáře,
  do logů ani do stejného trezoru jako připojovací řetězec k databázi.
- Kompromitace jednoho účtu: session je vázaná na jeden účet a jeden workspace, takže se nedostane
  k datům ostatních.

## 10. Proč jsou opatření považovaná za přiměřená

Služba běží na spravované infrastruktuře, obsah je šifrovaný aplikačním klíčem, přístup je
autorizovaný na serveru u každého požadavku, tajemství jsou v prostředí a rozsah zpracovávaných
údajů je držený na minimu. End-to-end šifrování by znemožnilo serverový export, obnovu hesla i
podporu; per-položkové šifrování by přineslo složitost bez odpovídajícího přínosu proti stejnému
modelu hrozeb. Pokud by právní posouzení dospělo k jinému závěru, lze aplikační šifrování rozšířit
bez zásahu do zbytku architektury — všechny zápisy procházejí jedním modulem (`lib/store.ts`).

## 11. Body k právnímu posouzení

1. Právní titul zpracování zdravotních údajů (čl. 9 GDPR) a jeho dokumentace.
2. Znění souhlasu před odesláním dotazníku ke zpracování jazykovým modelem.
3. Zásady zpracování osobních údajů a obchodní podmínky.
4. Zpracovatelské smlouvy: MongoDB Atlas, Vercel, Stripe, Resend, Anthropic.
5. Podmínky zpracování dat u Anthropicu (retence, trénink, umístění).
6. Umístění dat a případné předání mimo EU.
7. Doba uchování odpovědí z dotazníku po vygenerování trackeru.
8. Doba uchování účetních dokladů a její vztah k mazání účtu.
9. Věková hranice pro založení účtu.
10. Postavení produktu vůči regulaci zdravotnických prostředků — produkt se prezentuje jako
    záznamník pozorování, nikoli jako diagnostický nástroj; hranice je vhodné posoudit.
11. Postup a lhůty při ohlašování bezpečnostního incidentu.
