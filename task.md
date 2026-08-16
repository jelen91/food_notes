# Zadání

<!-- Sem napiš, co má být hotové. Piš klidně česky. Zbytek souboru jsou vodítka,
     co harness reálně potřebuje vědět, aby task nezapadl. Nepotřebné sekce smaž. -->

## Cíl

<!-- Jedna až tři věty: jaký je výsledek, ne jak ho dosáhnout.
     Špatně: "uprav lib/email.ts"
     Dobře:  "zákazník si může nechat znovu poslat ověřovací e-mail z UI, když mu první nedorazil" -->

## Hotovo znamená

<!-- Nejdůležitější sekce. Auditor podle tohohle nezávisle ověřuje výsledek a
     nevěří tomu, co executor tvrdí. Piš věci, které jdou zkontrolovat v reálném
     prostředí — soubor, obrazovka, test, chování API. Ne pocity. -->

- [ ] …
- [ ] …
- [ ] `npm test`, `npm run typecheck`, `npm run lint` a `npm run build` procházejí

## Kontext

- Projekt: Next.js 14 (pages router), TypeScript, MongoDB, Stripe, vitest.
- Dokumentace stavu: `README.md`, `docs/architektura.md`, `docs/milnik-1.md`,
  `docs/milnik-2.md`, `docs/milnik-3.md`, `docs/tok-zakaznika.md`.
  Sekce **„Známá omezení"** v milnících popisují, co je vědomě nedodělané.
- Výchozí stav (ověřeno): typecheck čistý, lint bez varování, 159/159 testů, build projde.

## Hranice

<!-- Čeho se agent nesmí dotknout. Bez tohohle si to vyloží po svém. -->

- Neměň `MASTER_KEY` ani nic v šifrovací obálce (`lib/crypto.ts`) — přešifrování DEKů je samostatná operace.
- Nesahej na `.env` a nikam nezapisuj tajné klíče.
- Nedělej `git push` ani deploy.
- Zachovej izolaci zákazníků: každý dotaz do dat jde přes `lib/store.ts` s `tenantId` jako prvním parametrem.

## Jak si výsledek ověřit

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

<!-- Když je potřeba běžící aplikace nebo databáze, napiš to sem i s tím,
     co má agent udělat, když ji nemá k dispozici. -->
