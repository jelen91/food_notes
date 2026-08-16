# Milník 3 — deník, export a mazání

Uzavírá samoobslužný tok: zákazník teď do vygenerovaného deníku opravdu zapisuje, může si
záznamy stáhnout a smazat účet. Navazuje na [milník 1](milnik-1.md) a [milník 2](milnik-2.md).

## Renderer

`components/TrackerFields.tsx` vykresluje definici nad stejnými primitivy, jaké používá zbytek
appky (`Scale`, `ChipGroup`, `Field`). Podle `type` se vybere vstup z pevné sady — **nic se
nevyhodnocuje ani nespouští**, žádný `eval`, žádné dynamické importy, neznámý typ se nevykreslí.

| Typ pole | Vstup |
| --- | --- |
| `scale`, `stool_bristol` | tlačítková škála (Bristol má pevný číselník 1–7 s popisy) |
| `number`, `duration`, `sleep` | číslo s jednotkou, mezemi a krokem |
| `boolean` | ano/ne |
| `single_select`, `multi_select` | chipy |
| `date`, `time` | nativní vstup |
| `long_text`, `custom_observation` | víceřádkový text |
| `meal`, `exercise`, `symptom`, `medication_or_supplement`, `short_text` | jednořádkový text |

Sekce `daily` se vyplňují jednou za den, sekce `timeline` jsou události s časem. Podmíněné
zobrazení se vyhodnocuje při psaní; hodnota schovaného pole se **neuloží** — jinak by v datech
zůstalo něco, co uživatel na obrazovce nikdy neviděl.

## Denní záznamy

Ukládají se do stávajícího denního dokumentu (`daily_notes`) pod klíč `tracker`, takže platí
stejná pravidla jako všude jinde: jeden dokument na `tenantId` + `date`, obsah šifrovaný klíčem
zákazníka, v čistém jen datum a tenantId.

Ke každému dni je **připnutá verze definice**, se kterou vznikl. Server hodnoty vždy validuje
proti definici té verze, ne proti aktuální:

- nová definice nepřepíše ani nezahodí starší dny,
- starý den se zobrazuje i exportuje s původními popisky a je označený,
- hodnoty mimo rozsah, neznámá pole a cizí volby se zahodí (`lib/tracker/entry.ts`).

## Co nejmenší odpor při zápisu

Deník má cenu jen tehdy, když ho člověk skutečně vyplňuje, takže zápis nesmí vyžadovat
rozhodování:

- **Volná poznámka je hlavní vstup.** Na `/app/denik` je nahoře textové pole „Co se právě
  děje?" s předvyplněným časem. Jedno kliknutí, žádná kategorie. V datech je to událost
  s prázdným `fieldId` — `normalizeTrackerDay` ji úmyslně nezahazuje.
- Poznámka u pole, které z definice zmizelo, se **nezahodí**, ale zůstane jako volná poznámka.
- **Struktura je nabídka, ne povinnost.** Kategorie z časové osy jsou tlačítka pod poznámkou;
  kdo je nechce, nemusí na ně sáhnout.
- **Denní formulář se krátí.** Vidět jsou povinná pole, první tři nepovinná a ta už vyplněná;
  zbytek je za „Doplnit další (N)".
- Časová osa je nad denním formulářem — během dne se zapisuje často, souhrn jednou večer.
- Ukládá se průběžně, žádné tlačítko Uložit.

## Export

`GET /api/tracker-export?from=&to=&preview=1` sestaví Markdown jen z dat přihlášeného účtu.
Obsahuje datum exportu, zvolené období, název a verzi deníku, upozornění, dny seskupené podle
data se sekcemi, popisky, hodnotami a jednotkami, chybějící údaj jako „—“ a závěrečné vysvětlení,
že jde o vlastní záznamy uživatele.

**Text od uživatele se escapuje** (`escapeMarkdown`): nemůže založit nadpis, odrážku, citaci,
tabulku ani kódový blok a nepropašuje řídicí znaky. Ověřeno testem i proti běžící aplikaci —
poznámka `# Falešný nadpis` skončí v dokumentu jako text.

Aplikace export **nikam neposílá**. Uživatel si ho stáhne nebo zobrazí a sám se rozhodne, co dál.

## Mazání účtu

`POST /api/account/delete` vyžaduje potvrzení heslem. Identita pochází ze session — `accountId`
poslaný prohlížečem se ignoruje, takže cizí účet smazat nejde.

| Kategorie | Osud |
| --- | --- |
| dny, laboratorní výsledky, dotazník, všechny verze deníku | smaže se hned |
| datový klíč zákazníka | smaže se → i kopie v zálohách zůstanou nečitelné |
| doklady o platbě (`entitlements`, `checkout_sessions`) | **zůstávají** kvůli účetnictví |
| e-mail a heslo | přepíše se na `smazano+<accountId>@invalid`, heslo se zahodí |

Vazba na osobu se tím omezí na interní ID, které drží doklad o platbě pohromadě. Operace je
idempotentní. Doba uchování účetních dokladů je **bod k právnímu posouzení**.

## Nové soubory

`lib/tracker/{entry,markdown}.ts`, `lib/accountDeletion.ts`, `components/TrackerFields.tsx`,
`pages/api/{tracker-day,tracker-export}.ts`, `pages/api/account/delete.ts`,
`pages/app/{denik,ucet}.tsx`, `tests/tracker-{entry,export,render}.test.ts`.
Úvodní stránka `pages/index.tsx` má vlastní vzhled (papír a inkoust, styly `.lp-*` v `globals.css`).
Upraveno: `lib/store.ts` a `lib/schema.ts` (denní dokument nese `tracker`),
`lib/tracker/store.ts` (`getTrackerByVersion`), `lib/onboarding.ts` (hotový deník vede na
`/app/denik`), `pages/app/index.tsx`.

## Ověření

139 testů, typecheck, lint bez varování, build. Proti běžící aplikaci s falešným endpointem
modelu prošlo: registrace → platba → dotazník → generování → zápis dne s podvrženými hodnotami
(`kvalita_spanku: 99` mimo rozsah, `cizi_pole` se skriptem i neznámá událost se zahodily) →
export (5 nadpisů, všechny od exportu, falešný nadpis escapovaný) → export s rozsahem (filtruje
správně) → přegenerování na verzi 2 (starý den si drží verzi 1 i hodnoty, nový den má verzi 2,
export obojí rozliší) → mazání se špatným heslem (401) → podvržené `accountId` (smaže vlastní,
ne cizí) → smazání (3 dny, 2 verze, dotazník a klíč pryč, doklad o platbě zůstal) → přihlášení
po smazání nefunguje.

## Známá omezení

- Vykreslení formuláře v prohlížeči není pokryté automatickým testem — v projektu není nástroj
  pro testování komponent. Otestované jsou čisté funkce (viditelnost, formátování, validace) a
  celá datová cesta přes API.
- Samoobslužný deník (`/app/denik`) a ručně stavěný (`/t/<slug>`) jsou dvě obrazovky nad stejnými
  primitivy. Sloučit je půjde, až bude jasné, jestli ruční zákazníci mají přejít na stejný model.
- Automatická retence odpovědí z dotazníku po vygenerování zatím neběží (funkce existuje, lhůta
  čeká na právní posouzení).
- Apple Health se do samoobslužného deníku zatím nenapojuje; zůstává u ručně stavěných zákazníků.
