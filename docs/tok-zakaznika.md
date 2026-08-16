# Cesta zákazníka: dotazník → platba → účet

Cílem je co nejmenší počet překážek před platbou. Zákazník proto nejdřív uvidí, co za své
peníze dostane, a teprve pak platí. Registrace ani heslo se cestou neřeší — účet vzniká sám
po zaplacení.

```
úvodní stránka
      │  „Sestavit můj deník“
      ▼
/dotaznik ──► první uložení založí draft (workspace + datový klíč) + cookie hj_draft
      │       odpovědi se šifrují stejnou obálkou jako všechna ostatní zdravotní data
      │  odeslání
      ▼
/app/platba ──► „Tvůj deník je připravený“, shrnutí z vlastních odpovědí
      │  POST /api/billing/checkout   (metadata: jen draftId)
      ▼
Stripe Checkout ──► zákazník tam zadá e-mail a zaplatí
      │
      ├─► webhook (ověřený podpis)   ──► účet z draftu + entitlement + e-mail s odkazem na heslo
      │
      └─► návrat na /app/platba/hotovo?session_id=…
                    │  POST /api/billing/claim  (session_id + cookie hj_draft)
                    ▼
              přihlášení do nového účtu ──► /app/tracker ──► /app/denik
```

## Proč je to bezpečné

| Riziko | Opatření |
| --- | --- |
| Návrat z Checkoutu by odemkl přístup | `claim` vyžaduje entitlement, který zapisuje jen ověřený webhook; do té doby vrací `202 pending` |
| Cizí `session_id` z URL | Checkout Session musí patřit k draftu z cookie tohohle prohlížeče, jinak 403 |
| Uhodnutí cizího draftu | `draftId` je 24 náhodných znaků v HttpOnly cookie; bez ní API nevydá nic |
| Dvojí doručení webhooku | Unikátní index na `eventId`, unikátní `accountId` v `entitlements`, `claimDraft` je atomický |
| Zdravotní údaje ve Stripe | Do metadat jde jen `draftId`; e-mail bere Stripe sám, nic dalšího od něj nepřebíráme |
| Odpovědi bez majitele v databázi | Nezaplacený draft se po 30 dnech maže i s obsahem a datovým klíčem (`purgeExpiredDrafts`) |
| Přepsání existujícího deníku | Když e-mail už účet má, workspace draftu se převezme jen do prázdného účtu; jinak se zahodí |

## Přihlášení po platbě

Zákazník je po návratu z platby přihlášený rovnou (cookie draftu prokáže, že platba patří jemu).
Heslo si nastaví z e-mailu, který po zaplacení odchází — odkaz platí 7 dní a je zároveň jedinou
cestou do deníku z jiného zařízení. Nastavením hesla se účet přihlásí a e-mail označí za ověřený.

## Co zůstalo z původní cesty

`/app/registrace` a přihlášení účtem fungují dál kvůli zákazníkům, kteří vznikli před změnou.
Platba s existujícím účtem používá stejný endpoint, jen místo `draftId` posílá `accountId`.
Ručně zakládaní zákazníci na `/t/<slug>` se tohohle toku vůbec netýkají.
