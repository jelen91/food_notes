# Milník 2 — dotazník a generování trackeru

Navazuje na [milník 1](milnik-1.md) (účty, platby, entitlement). Zákazník vyplní dotazník
a Claude z něj sestaví konfiguraci deníku na míru.

**Pořadí kroků se od milníku 1 změnilo:** dotazník je první krok, ještě bez účtu a bez platby —
viz [nová cesta zákazníka](tok-zakaznika.md). Účet vzniká až po zaplacení.

## Tok

```
dotazník (draft) ──► platba ──► účet ──► kontrola odpovědí proběhla už v dotazníku
                                                                  │
                              minimalizace (jen otázky a odpovědi) │
                                                                  ▼
                                        Claude (structured outputs, JSON schema)
                                                                  │
                                  nezávislá validace na serveru ──┤
                                                                  ├─ neprojde → nic se neuloží,
                                                                  │             stav failed, lze opakovat
                                                                  ▼
                                     verzovaná definice v DB (šifrovaná) → /app/tracker
```

## Co Claude generuje

**Jen data, nikdy kód.** Výstup je konfigurace: sekce a pole z pevného seznamu typů. Sekce má
`kind`: `daily` (jednou za den) nebo `timeline` (události s časem během dne).

Povolené typy polí: `boolean`, `number`, `scale`, `short_text`, `long_text`, `single_select`,
`multi_select`, `date`, `time`, `duration`, `meal`, `sleep`, `exercise`, `symptom`,
`stool_bristol`, `medication_or_supplement`, `custom_observation`.

## Kolik toho Claude navrhne (prompt v2)

První verze promptu generovala na „do 1 minuty denně" deset denních polí — příliš na to, aby to
někdo vyplňoval. Prompt v2 proto dává tvrdé stropy podle zvoleného času: do 1 minuty nejvýš 5
denních polí, 2–3 minuty 8, asi 5 minut 12, klidně víc 16. Povinná pole nejvýš dvě, kategorií na
časové ose nejvýš čtyři — na zbytek má uživatel volnou poznámku.

## Bezpečnostní hranice: `lib/tracker/schema.ts`

Odpověď modelu projde nezávislou validací, než se čehokoli dotkne. Odmítne se:

- neznámý typ pole nebo jiná verze schématu,
- neznámé vlastnosti navíc (schéma je `strict`),
- HTML, skripty, entity, `javascript:`/`data:` odkazy, URL, šablonové výrazy, řídicí znaky,
- nebezpečné identifikátory (povolené je jen `^[a-z][a-z0-9_]*$`),
- duplicitní ID sekcí, polí i voleb,
- překročení limitů (12 sekcí, 80 polí, 20 na sekci, 30 voleb, 120/600 znaků),
- nesmyslné meze (`min ≥ max`, škála mimo 3–11 stupňů, `step` větší než rozsah),
- odkaz podmíněného zobrazení na neexistující pole, na sebe sama nebo cyklus,
- nepodporovaný operátor podmínky,
- typ nevhodný pro `timeline` sekci.

Při jakémkoli problému se **neuloží nic** — ani částečná definice — a předchozí aktivní tracker
zůstane nedotčený.

## Co se posílá Anthropicu

Jen otázky a odpovědi z dotazníku plus verze dotazníku. **Neposílá se** jméno, e-mail, ID účtu
ani workspace, Stripe identifikátory, IP adresa, časová razítka ani denní záznamy. Ověřuje to test
i kontrola skutečného odchozího payloadu.

Klíč `ANTHROPIC_API_KEY` je jen v serverovém prostředí — nikdy v prohlížeči, v databázi ani v logu.

## Model a parametry

| Nastavení | Hodnota | Proč |
| --- | --- | --- |
| model | `claude-opus-5` (`ANTHROPIC_MODEL` přebije) | výchozí volba; konfigurace zůstává |
| structured outputs | `output_config.format` = JSON schema | tvar výstupu se nevynucuje jen textem promptu |
| effort | `high` | kvalita návrhu je důležitější než pár korun |
| max_tokens | 16 000 | definice se pohodlně vejde i s uvažováním |
| timeout | 180 s | SDK počítá v milisekundách |
| opakování | 2 (SDK) | jen přechodné chyby: 408/409/429/5xx a výpadky spojení |

## Stavy a zámek

`not_started → generating → completed | failed`, uložené u dotazníku. Zámek je podmíněný zápis do
databáze: souběžné volání dostane `409` a z jednoho odeslání nikdy nevzniknou dva trackery.
Generování zaseknuté déle než 10 minut (spadlá instance) jde převzít.

Kategorie selhání v DB: `not_configured`, `timeout`, `rate_limited`, `upstream_error`, `refused`,
`truncated`, `invalid_json`, `invalid_schema`. Uživatel vidí jen neutrální hlášku, nikdy technický
detail ani odpověď poskytovatele.

## Verzování

Každé generování založí novou verzi (`tracker_definitions`), předchozí zůstávají. Aktivní je právě
jedna — hlídá to částečný unikátní index v databázi, ne aplikační kód. Ke každé verzi se ukládá
model, verze promptu a verze schématu; obsah je šifrovaný klíčem zákazníka.

## Retence odpovědí

Po úspěšném vygenerování už syrové odpovědi nejsou provozně potřeba —
`deleteQuestionnaireAnswers()` je umí smazat (idempotentně, metadata zůstanou). Konkrétní lhůta
je **bod k právnímu posouzení**, proto zatím není nastavená automaticky.

## Nové soubory

`lib/tracker/{schema,jsonSchema,prompt,generate,store}.ts`, `lib/questionnaire.ts`,
`pages/api/{questionnaire,tracker}.ts`, `pages/app/{dotaznik,tracker}.tsx`,
`tests/tracker-{schema,generate}.test.ts`. Upraveno: `lib/db.ts` (kolekce a indexy),
`middleware.ts` (účtové API).

## Ověření

`npm test` (100 testů) · `npm run typecheck` · `npm run lint` · `npm run build`.

Proti běžící aplikaci s falešným endpointem modelu (`ANTHROPIC_BASE_URL`) prošlo: registrace →
platba webhookem → dotazník (neúplný odmítnut, podvržené pole odfiltrováno) → generování →
uložená verze 1 → dvě souběžná volání (jedno `409`, vznikla jedna verze) → rozbitá odpověď modelu
(`502`, stav `failed`, **žádná částečná definice**, předchozí tracker zůstal aktivní) → opakování
po opravě (verze 3) → cizí účet nevidí nic.

## Co zbývá (milník 3)

Renderer definice nad stávajícími primitivy, denní záznamy s připnutou verzí definice, export s
výběrem rozsahu a escapováním, mazání účtu a dat. Do té doby `/app/tracker` ukazuje **náhled**
vygenerovaného deníku — sekce, pole, typy a volby — ale ještě se do něj nezapisuje.
