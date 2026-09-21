import { PURCHASE_POLICY_VERSION } from './purchase-policy';

/** Versioned text is retained with each checkout and sent with the payment receipt. */
export const PURCHASE_SUMMARY =
  'Jednorázový nákup Deníku pozorování na 12 kalendářních měsíců od zaplacení, bez automatického obnovení. V ceně je AI sestavení deníku a jedno AI vyhodnocení pro účet, které lze spustit během placeného přístupu po 21 dnech od platby a alespoň 21 různých dnech se záznamy od platby. Po skončení přístupu následuje 30 dní na export. Do 72 hodin od platby lze požádat o vrácení celé zaplacené ceny bez udání důvodu, i po používání deníku; peníze vracíme stejným platebním prostředkem nejpozději do 14 dnů. Garance neomezuje zákonná práva včetně práva na odstoupení, které má spotřebitel u služby sjednané přes internet zpravidla do 14 dnů. Zahájení služby ihned není vzdáním se tohoto práva. Mimo garanci může být podle zákonných podmínek zohledněna poměrná cena poskytnuté služby. AI nabízí podněty k ověření, nikoli diagnózu nebo léčebný plán.';
export const IMMEDIATE_SERVICE_REQUEST =
  'Výslovně žádám o zahájení poskytování služby ihned po zaplacení, ještě před uplynutím zákonné lhůty pro odstoupení. Beru na vědomí, že mimo třídenní garanci může být při odstoupení podle zákonných podmínek zohledněna poměrná cena již poskytnuté služby.';

export function purchaseConsent(body: unknown, now = new Date()) {
  const input = body as Record<string, unknown> | null;
  if (
    !input ||
    input.purchasePolicyVersion !== PURCHASE_POLICY_VERSION ||
    input.acceptedTerms !== true ||
    input.requestImmediateService !== true
  )
    return null;
  return {
    purchasePolicyVersion: PURCHASE_POLICY_VERSION,
    acceptedAt: now.toISOString(),
    acceptedTerms: true,
    requestImmediateService: true,
    termsText: PURCHASE_SUMMARY,
    immediateServiceText: IMMEDIATE_SERVICE_REQUEST,
  };
}
