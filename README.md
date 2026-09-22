# Rozumím tělu — osobní deník na míru

**Rozumím tělu** na **https://rozumimtelu.cz** pomáhá zachytit vlastní pozorování a hledat
souvislosti mezi jídlem, režimem a tím, jak se člověk cítí. AI sestaví osobní deník a po splnění
podmínek připraví jednorázový přehled. Jde o pomůcku pro orientaci a další konzultaci, nikoli diagnózu.
Značka a veřejná doména jsou sjednocené v `lib/brand.ts`; připojení domény a provozní nastavení
popisuje [docs/domain.md](docs/domain.md).

Jeden engine, ze kterého se dá postavit deník na míru pro každého zákazníka. Zákazník dostane
vlastní odkaz `/t/<slug>` a heslo, jeho data jsou v databázi zašifrovaná vlastním klíčem.

Zákazníci vznikají dvěma cestami:

- **samoobslužně** — registrace na `/app/registrace`, platba přes Stripe, přístup uděluje ověřený
  webhook (viz [docs/milnik-1.md](docs/milnik-1.md)),
- **ručně** — CLI `scripts/tenant.js` a konfigurace v `tenants/<id>.json` (níže).

Popis dat, šifrování a externích zpracovatelů je v [docs/architektura.md](docs/architektura.md).
Samoobslužný tok po částech: [milník 1](docs/milnik-1.md) (účty a platby),
[milník 2](docs/milnik-2.md) (dotazník a generování deníku přes Claude),
[milník 3](docs/milnik-3.md) (zápis do deníku, export a mazání účtu).

**Klíčový princip: aplikace na míru není fork kódu, ale konfigurační soubor.** Podoba deníku
(škály, denní údaje, kategorie událostí, strukturované epizody, moduly) je popsaná v
`tenants/<id>.json`. Když zákazník něco chce, upraví se JSON — ne komponenty.

## Prodejní stránky (září 2026)

Nový veřejný web a tři tematické landing pages jsou na `/`, `/lp/traveni`, `/lp/migreny` a `/lp/unava`.
Obsah kampaní, přidání dalších stránek, cenu a ověření popisuje [návod k landing pages](docs/landing-pages.md).
Cena se načítá ze stejné Stripe konfigurace jako checkout. Lokálně je nastavena požadovaná cena **949 Kč v testovacím režimu**.

## Jak vypadá běžná práce

**Založení zákazníka**

```bash
node scripts/tenant.js create 1151 --name "Jan Novák" --from roman
```

Vypíše URL, heslo a klíč pro Health Auto Export (jinde už se v čitelné podobě neobjeví).
Konfiguraci vytvoří v `tenants/1151.json` podle vzoru `roman` (nebo bez `--from` z minimální šablony).

**Změna na přání zákazníka**

> „U zákazníka 1151 přidej sledování, kolik denně vypije.“

```json
"dailyMetrics": [
  { "key": "water", "label": "Vypitá voda", "unit": "l", "step": 0.25,
    "min": 0, "max": 10, "quickAdd": [0.25, 0.5], "hint": "Sklenice ≈ 0,25 l" }
]
```

Commit + deploy. Metrika se objeví v appce, v CSV exportu (`water_l`) i v legendě pro AI.
Historická data zůstávají platná — chybějící dny jsou prostě prázdné.

**Ostatní příkazy**

```bash
node scripts/tenant.js list                 # přehled zákazníků, stav klíčů, počty dat
node scripts/tenant.js info 1151            # detail jednoho
node scripts/tenant.js provision 1151       # dogeneruje klíč a heslo (nové prostředí, obnova)
node scripts/tenant.js passwd 1151          # nové heslo
node scripts/tenant.js healthkey 1151       # nový klíč pro Health Auto Export
node scripts/tenant.js delete 1151 --yes    # smaže data i klíč (nevratné)
```

## Co jde nakonfigurovat

| Sekce | K čemu je |
| --- | --- |
| `scales` | denní subjektivní škály s rozsahem a směrem (`higherBetter` / `higherWorse`) |
| `dailyMetrics` | denní čísla — voda, váha, cigarety; volitelně tlačítka `quickAdd` |
| `categories` | kategorie časovaných událostí a jejich pole |
| `episodes` | strukturované epizody (epizoda slabosti, migréna, záchvat…) |
| `entrySymptoms` | symptom 1–N navázaný na událost, volitelně jen u vybraných kategorií |
| `modules` | zapnutí/vypnutí Apple Health, laboratoří, exportu, historie |
| `theme`, `title`, `subtitle` | vzhled a názvosloví |
| `defaultCategory` | kam spadnou záznamy bez kategorie (historická data) |
| `export.focus`, `export.caveats` | doplní zadání pro AI o kontext konkrétního zákazníka |

Typy polí: `number`, `text`, `scale`, `select`, `multiselect`. Konfigurace se při načtení validuje;
neplatný soubor se přeskočí a chyba se vypíše do logu, takže překlep neshodí ostatní zákazníky.

## Bezpečnost a soukromí

- **Envelope šifrování.** Každý zákazník má datový klíč (DEK), kterým se šifruje obsah dnů,
  laboratorních výsledků i PDF. DEK leží v databázi zabalený master klíčem z `MASTER_KEY`.
  V čistém zůstává jen `tenantId`, `date` a časová razítka — podle nich se dotazuje.
- **Únik databáze** sám o sobě data neodhalí (bez `MASTER_KEY` jsou nečitelná).
- **Smazání zákazníka** zahodí i jeho DEK, takže zbytky v zálohách jsou trvale nečitelné.
- **Izolace.** Veškerý přístup jde přes `lib/store.ts`, kde má každý dotaz `tenantId` jako první
  parametr. Cookie je pojmenovaná per zákazník (`hj_<slug>`) a nese slug, takže session z jedné
  aplikace neotevře jinou. Ověřuje to middleware i každá API routa zvlášť.
- **Hesla** se ukládají jako scrypt hash se solí; po 10 neúspěších se účet na 15 minut zamkne.
- **Audit** zaznamenává přihlášení a mazání dat (`audit_log`).

> **`MASTER_KEY` je jediný kritický secret.** Bez něj nejdou data přečíst — ani tobě. Ulož si ho
> mimo repozitář i mimo Vercel (password manager) a nikdy ho neměň bez přešifrování DEKů.

### Právní minimum (než přijde první platící zákazník)

Zdravotní údaje jsou podle GDPR zvláštní kategorie (čl. 9), takže samotné šifrování nestačí:

- výslovný souhlas se zpracováním zdravotních údajů (ne jen obchodní podmínky),
- zpracovatelská smlouva se zákazníkem, pokud data zpracováváš pro něj,
- záznamy o činnostech zpracování a doba uchování,
- postup při úniku dat (ohlášení do 72 hodin),
- právo na výmaz a na přenositelnost — obojí appka umí (`delete`, `.md` export),
- databázi i hosting drž v EU (Atlas i Vercel region).

## Struktura

```
tenants/<id>.json          konfigurace aplikace zákazníka (v gitu)
lib/tenant/                typy a načítání konfigurací
lib/crypto.ts              envelope šifrování (master key → DEK → data)
lib/store.ts               jediný přístup k datům, vše scopované tenantId
lib/session.ts             podepsaná cookie (Edge i Node)
lib/schema.ts              validace vstupů podle konfigurace
lib/markdown.ts            export pro AI, taky podle konfigurace
pages/t/[slug]/            aplikace zákazníka (deník, laboratoře, login)
pages/api/                 API, každé volání s ?t=<slug>
scripts/tenant.js          správa zákazníků
```

Kolekce v MongoDB: `daily_notes`, `blood_tests` (data), `tenants` (zabalené klíče),
`tenant_users` (účty a hesla), `audit_log`.

## Aplikace očima zákazníka

Denní škály 1–10 · denní čísla · časované události v kategoriích · strukturované epizody ·
automatický import všeho z Apple Health · laboratorní výsledky s metadaty odběru a PDF ·
export do Markdownu pro AI analýzu (zadání, legenda, CSV tabulky, denní zápisy, limity dat;
hledání souvislostí s posunem 0–14 dní, s explicitním zákazem stanovovat diagnózu).

## Instalace

```bash
npm install
```

Proměnné prostředí zkopíruj z [.env.example](.env.example) do `.env` a doplň. Minimum pro běh:
`MONGODB_URI`, `AUTH_SECRET`, `MASTER_KEY`. Pro platby navíc `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET` a `STRIPE_PRICE_ID`, pro e-maily `RESEND_API_KEY` a `EMAIL_FROM`.

Pak `npm run dev` a `node scripts/tenant.js list`.

## Příkazy

```bash
npm run dev         # vývojový server
npm test            # Vitest
npm run typecheck   # tsc --noEmit
npm run lint
npm run build
```

## Health Auto Export (nastavuje se v telefonu zákazníka)

- URL: `https://<doména>/api/health`
- Metoda `POST`, formát JSON
- Header: `x-health-key: <klíč zákazníka z CLI>`
- Metriky libovolné — uloží se všechny, i ty, které appka nezná

Data se slučují; `?replace=1` přepíše celý denní snímek.

## Deployment na Vercel

1. Push na GitHub
2. Environment variables: `MONGODB_URI`, `AUTH_SECRET`, `MASTER_KEY`, `APP_URL=https://rozumimtelu.cz`
3. Deploy — nový zákazník se pak nasazuje commitem konfigurace

Před přesměrováním zákazníků dokonči připojení domény, HTTPS a kontrolu platebních/e-mailových odkazů
podle [návodu k doméně](docs/domain.md). Rebranding zdrojového kódu sám doménu ani nasazení nemění.
