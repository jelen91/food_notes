# Milník 1 — účty, platby, entitlement

Souhrn toho, co se změnilo, jak to provozovat a co zbývá.

## Původní architektura

Jednouživatelská aplikace rozšířená na ručně spravované zákazníky: konfigurace deníku v
`tenants/<id>.json` (git), zakládání zákazníka CLI příkazem, přihlášení jedním sdíleným heslem na
`/t/<slug>`, obsah šifrovaný per-tenant klíčem. Žádné účty, e-maily, platby ani testy.

## Nová architektura

Nad workspace (dosavadní „tenant“) přibyla vrstva **účtu**. Návštěvník se zaregistruje, dostane
workspace i šifrovací klíč, zaplatí přes Stripe Checkout a přístup mu udělí až **ověřený webhook**.
Ruční zákazníci fungují beze změny vedle toho.

```
registrace ──► workspace + DEK ──► Stripe Checkout ──► webhook (ověřený podpis)
                                                          │
                                              entitlement (zdroj pravdy)
                                                          │
                                         dotazník ──► Claude ──► tracker   (milník 2 a 3)
```

## Stavový automat

`account.status`: `active` → `deletion_requested` → `deleted` (mazání je součástí milníku 3).

`account.onboarding`:

```
unpaid ──► checkout_started ──► payment_pending ──► paid ──► questionnaire_completed
   │              │                    │
   └──────────────┴────────────────────┴──► paid        (platba mimo náš checkout)
paid ──► questionnaire_completed ──► tracker_queued ──► tracker_generating
                                          ▲                    │
                                          └── tracker_failed ◄─┘
                                                               └──► tracker_ready
```

Přechody dělá jen `lib/onboarding.ts` přes podmíněný zápis, takže dvojí doručení webhooku stav
neposune dvakrát. **O přístupu ale nikdy nerozhoduje stav onboardingu, nýbrž `entitlements`.**

## Změněné a nové soubory

**Nové knihovny:** `lib/accounts.ts`, `lib/billing.ts`, `lib/stripe.ts`, `lib/onboarding.ts`,
`lib/tokens.ts`, `lib/email.ts`, `lib/rateLimit.ts`
**Upravené knihovny:** `lib/db.ts` (nové kolekce a indexy), `lib/session.ts` (session účtu +
oddělení druhů tokenů), `lib/apiAuth.ts` (`requireAccount`, přijetí session účtu na `/t/<slug>`)
**API:** `pages/api/auth/*` (register, login, logout, verify-email, request-reset, reset-password),
`pages/api/billing/{checkout,status}.ts`, `pages/api/stripe/webhook.ts`
**Stránky:** `pages/app/*` (registrace, přihlášení, ověření, zapomenuté a nové heslo, platba,
platba/hotovo, rozcestník), `pages/index.tsx`, `components/AppShell.tsx`
**Provoz:** `middleware.ts`, `next.config.js` (bezpečnostní hlavičky),
`scripts/migrate-accounts.js`, `.env.example`
**Testy:** `vitest.config.ts`, `tests/*.test.ts`

## Databáze

Migrace není samostatný krok — indexy zakládá idempotentní `ensureIndexes()` z `lib/db.ts`, které
volá webhook, registrace i CLI. Nové kolekce: `accounts`, `entitlements`, `stripe_events`,
`checkout_sessions`, `auth_tokens`, `rate_limits`. Stávající kolekce se nemění.

## Stávající zákazníci

```bash
node scripts/migrate-accounts.js legacy --all    # entitlement zdarma pro všechny z tenants/
node scripts/migrate-accounts.js status
```

Přihlášení heslem na `/t/<slug>`, konfigurace v souborech i data zůstávají beze změny; nikdo z nich
není poslán na platbu ani na dotazník. Volitelné napojení e-mailového účtu na existující workspace:

```bash
node scripts/migrate-accounts.js link roman --email jmeno@domena.cz
```

## Nastavení Stripe

1. Dashboard v **testovacím režimu** → Product → jednorázová cena → zkopírovat `price_...`.
2. Developers → API keys → `sk_test_...` do `STRIPE_SECRET_KEY`.
3. Lokální webhook:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   Vypsaný `whsec_...` patří do `STRIPE_WEBHOOK_SECRET`.
4. Produkční webhook: Developers → Webhooks → endpoint `https://<doména>/api/stripe/webhook`,
   události `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`.
5. Testovací karta `4242 4242 4242 4242`, libovolné budoucí datum a CVC.

## Nastavení Resend

Účet u Resend → ověřená doména → API klíč do `RESEND_API_KEY`, odesílatel do `EMAIL_FROM`.
Bez těchto proměnných se e-maily neposílají a odkazy se vypisují do serverové konzole — pro
lokální vývoj to stačí.

## Anthropic

Až milník 2. Klíč zůstane jen na serveru (`ANTHROPIC_API_KEY`) a do prohlížeče se nikdy nedostane.

## Lokální vývoj

```bash
npm install
cp .env.example .env      # doplnit MONGODB_URI, AUTH_SECRET, MASTER_KEY, Stripe
npm run dev
```

## Testy

```bash
npm test          # Vitest, 45 testů, bez zásahu do databáze
npm run typecheck
npm run lint
npm run build
```

Testy pokrývají zpracování Stripe událostí (idempotence, odložené i neúspěšné platby), stavový
automat, oddělení session účtu a zákazníka, validaci účtů, ochranu proti cizímu původu požadavku a
autorizaci API rout včetně pokusu podvrhnout `accountId` z prohlížeče.

## Nasazení

1. Push do gitu.
2. Vercel → environment variables: `MONGODB_URI`, `AUTH_SECRET`, `MASTER_KEY`, `APP_URL`,
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `RESEND_API_KEY`, `EMAIL_FROM`.
3. Deploy, pak jednorázově `node scripts/migrate-accounts.js legacy --all`.

## Rollback

Aplikace: nasadit předchozí deployment ve Vercelu. Databáze: nové kolekce jsou aditivní a stará
verze je ignoruje, takže návrat nevyžaduje zásah do dat. Odebrat legacy entitlementy (pokud by to
bylo potřeba) lze smazáním dokumentů z `entitlements` s `kind: "legacy"`. `MASTER_KEY` se při
rollbacku **nikdy nemění**.

## Známá omezení

- Chybí CSP; aplikace stojí na inline stylech, zavedení politiky je samostatný úkol.
- Rate limiting je fixed-window nad MongoDB (bez Redisu) — proti hrubému hádání stačí, proti
  distribuovanému útoku není náhradou za WAF.
- Fronta úloh neexistuje; webhook proto pracuje krátce a generování trackeru poběží v samostatném
  požadavku (milník 2).
- E-mail se posílá přímo z requestu; při výpadku poskytovatele se registrace dokončí, ale ověřovací
  odkaz nedorazí (opakované odeslání zatím není v UI).
- Ověření e-mailu je nepovinné — nic zatím neblokuje.
- Účet zatím nejde smazat z UI (milník 3).
- Rozhraní pro správu je CLI, ne webová administrace.

## Předpoklady

- Jednorázová platba, ne předplatné (podle zadání); `STRIPE_PRICE_ID` je konfigurovatelné, takže
  přechod na předplatné nevyžaduje přepis architektury.
- Jeden zákazník = jeden workspace = jeden účet.
- Ruční („legacy“) zákazníci existují dál a nepřecházejí na samoobsluhu.
- Provoz v EU (Atlas i Vercel region) — je potřeba ověřit v konzolích poskytovatelů.

## Co zbývá (milníky 2 a 3)

**Milník 2:** verzovaný dotazník s recenzní obrazovkou a souhlasem, minimalizace dat, Anthropic SDK
se structured outputs, Zod schéma trackeru s allowlistem typů a limity, verzované definice v
databázi, zámek proti souběžnému generování, bezpečné selhání bez částečného uložení.

**Milník 3:** renderer sekcí a polí nad stávajícími primitivy, denní záznamy s připnutou verzí
definice, export s výběrem rozsahu a escapováním, mazání účtu a dat s retencí účetních dokladů.
