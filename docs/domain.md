# Doména a značka Rozumím tělu

Hlavní veřejná adresa je **https://rozumimtelu.cz**, značka **Rozumím tělu**.
Základní texty a doména jsou v `lib/brand.ts`; canonical a sitemap odkazují na tuto adresu.
Nasazení kódu samo neznamená, že byla doména zakoupena, připojena nebo změněna DNS.

## Připojení produkční domény

1. U registrátora zajisti vlastnictví `rozumimtelu.cz`.
2. V projektu Food Notes na Vercelu přidej `rozumimtelu.cz` jako produkční doménu.
   Případné `www.rozumimtelu.cz` přesměruj na variantu bez `www`.
3. U registrátora nastav přesně DNS záznamy zobrazené hostingem pro tento projekt.
   Hodnoty nepřebírej ze starého návodu; existující MX a ověřovací záznamy pro poštu zachovej.
4. Počkej na potvrzení domény a funkční HTTPS certifikát. Ověř všechny veřejné stránky.
5. Pro produkci nastav `APP_URL=https://rozumimtelu.cz` a proveď nové nasazení.
   Náhledové prostředí může mít vlastní `APP_URL`; nezaměňuj ho s produkcí.

## Platby, e-maily a přihlášení

- `APP_URL` zůstává explicitní provozní nastavení pro návrat ze Stripe a odkazy v e-mailech.
  Název značky ani canonical tuto proměnnou nenahrazují.
- Pokud přesouváš Stripe webhook na novou doménu, nastav jeho endpoint na
  `https://rozumimtelu.cz/api/stripe/webhook` a použij secret patřící právě tomuto endpointu.
  Původní endpoint nevypínej, dokud není ověřené doručování událostí.
- `EMAIL_FROM` musí obsahovat skutečného ověřeného odesílatele, například jméno „Rozumím tělu“
  s adresou, kterou provozovatel vlastní a ověřil u e-mailové služby. Rebranding automaticky
  nezakládá schránku a nevymýšlí adresu podpory; `SUPPORT_EMAIL` musí být funkční kontakt.
- Cookies platí pro doménu, na které byly vydané. Po přechodu z Vercel adresy se zákazník může
  potřebovat znovu přihlásit. Účty, uložená data, šifrovací klíče, databázová jména i cookie
  identifikátory zůstávají zachované.
- Po připojení zkontroluj syntetický testovací nákup, návrat ze Stripe, webhook, doručení
  e-mailů, odkazy pro ověření a obnovu hesla a přístup k deníku. Teprve potom aktualizuj
  cílové adresy reklam a další veřejné odkazy.

## Veřejné adresy a soukromí

| Stránka | Adresa |
| --- | --- |
| Rozumím tělu | https://rozumimtelu.cz/ |
| Trávení | https://rozumimtelu.cz/potize-s-travenim |
| Migrény | https://rozumimtelu.cz/migreny-a-bolesti-hlavy |
| Únava | https://rozumimtelu.cz/unava-a-nedostatek-energie |
| Podmínky | https://rozumimtelu.cz/podminky |
| Ochrana dat | https://rozumimtelu.cz/jak-chranime-data |

Sitemap uvádí jen tyto veřejné stránky. Dotazník, účtové stránky, API a osobní deníky jsou
vyloučené z indexování pomocí robots pravidel a HTTP hlaviček. Tyto pokyny nenahrazují
autorizaci. Homepage a tematické LP ponechávají `private, no-store`, protože mohou ukazovat
odkaz pro pokračování konkrétního zákazníka; sitemap a robots žádné osobní informace nečtou.

Přejmenování nemění délku přístupu, garanci ani ostatní sjednané podmínky. Verze
produktových podmínek proto zůstává zachována; u minulých objednávek se nepřepisuje
uložené znění souhlasu ani jejich nároky.
