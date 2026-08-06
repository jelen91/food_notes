# Zdravotní deník

Mobilní aplikace pro sledování zdraví: časované události, denní subjektivní škály, epizody slabosti,
automatický import všech metrik z Apple Health a laboratorní výsledky. Všechno jde vyexportovat
do jednoho Markdown souboru navrženého tak, aby v něm AI dokázala hledat dlouhodobé souvislosti.

Data jsou v MongoDB, aplikace běží na Next.js (pages router) a je určená pro jednoho uživatele
chráněného heslem.

## Co appka umí

**Denní subjektivní škály (1–10)** — energie, únava, slabost, stres, nálada, regenerace, brain fog,
bolest svalů, bolest hlavy, bolest krku. U každé škály je uložený i směr (vyšší = lépe / hůř), takže
analýza ví, jak hodnoty interpretovat. Ukládá se hned po kliknutí.

**Časované události v kategoriích** — trénink, jídlo, kofein, alkohol, léky, doplňky, stres, nemoc,
práce, cestování, poznámka. Kategorie mají strukturovaná pole (délka a intenzita tréninku, mg kofeinu,
počet nápojů, dávka léku, teplota u nemoci). U jídla lze navíc hodnotit trávicí symptomy 1–5.

**Epizoda slabosti** — samostatný typ záznamu se strukturovanými poli: čas, intenzita 1–10, trvání,
hodiny od posledního jídla, zasažené části těla, spouštěč, doprovodné příznaky a co pomohlo.

**Apple Health** — ukládá se automaticky vše, co pošle aplikace Health Auto Export, včetně metrik,
které appka nezná (uloží se pod odvozeným klíčem i s jednotkou). Kumulativní metriky se přes den
sčítají, ostatní průměrují, min/max se drží zvlášť. Importují se i tréninky z hodinek.

**Laboratorní výsledky** — jednotlivé analyty s jednotkou a referenčním rozmezím (hodnoty mimo
rozmezí se automaticky označí), metadata odběru (čas, nalačno, laboratoř, důvod, kontext, medikace)
a volitelně původní PDF. Hodnoty jde nakopírovat hromadně z laboratorní zprávy.

**Export pro AI** — `/api/export` složí Markdown se zadáním pro analýzu, legendou datového modelu,
CSV tabulkami (denní škály, Apple Health, události, epizody slabosti, laboratoře), denními zápisy
a poznámkami o limitech dat. Zadání cílí na hledání korelací s časovým posunem 0–14 dní, vyžaduje
uvádět `n` a nejistotu a explicitně zakazuje stanovovat diagnózu.

## Struktura

- `pages/index.tsx` – hlavní obrazovka (škály, přidávání záznamů, časová osa dne, Apple Health, export)
- `pages/labs.tsx` – laboratorní výsledky (`/blood` přesměrovává sem)
- `pages/api/notes.ts` – čtení a zápis dne (události + škály)
- `pages/api/health.ts` – příjem dat z Health Auto Export (`POST` chrání hlavička `x-health-key`)
- `pages/api/labs.ts` – laboratorní odběry včetně PDF
- `pages/api/export.ts` – generování Markdown exportu
- `pages/api/report.ts` – všechna data jako JSON
- `lib/schema.ts` – škály, kategorie, pole epizody slabosti, validace
- `lib/health.ts` – parsování a popisky metrik z Apple Health
- `lib/markdown.ts` – skládání exportu
- `middleware.ts`, `lib/auth.ts` – přihlášení heslem (HMAC cookie, 90 dní)

Data v MongoDB: kolekce `daily_notes` (den = `date`, `entries`, `scales`, `health`, `healthUnits`,
`workouts`) a `blood_tests` (odběr = `date`, `meta`, `values`, PDF v `data`).

## Instalace

1. `npm install`
2. `.env` (nebo `.env.local`):
   ```env
   MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/food_notes?retryWrites=true&w=majority
   APP_PASSWORD=<heslo do aplikace>
   AUTH_SECRET=<náhodný dlouhý řetězec pro podpis cookie>
   HEALTH_API_KEY=<klíč pro Health Auto Export>
   ```
3. `npm run dev`

## Health Auto Export

V aplikaci Health Auto Export nastav REST API export:

- URL: `https://<doména>/api/health`
- Metoda: `POST`, formát JSON
- Header: `x-health-key: <HEALTH_API_KEY>`
- Vyber libovolné metriky – uloží se všechny, i ty, které appka nezná

Data se ve výchozím stavu slučují (víc automatizací se nepřepisuje). `POST /api/health?replace=1`
nahradí celý denní snímek.

## Deployment na Vercel

1. Pushni kód na GitHub
2. Připoj projekt na Vercel a přidej environment variables (`MONGODB_URI`, `APP_PASSWORD`,
   `AUTH_SECRET`, `HEALTH_API_KEY`)
3. Deploy
