// Stavový automat onboardingu.
//
// Stav je durable v databázi a mění se jen tady. Přechod je podmíněný očekávaným výchozím
// stavem (findOneAndUpdate), takže dvě souběžná volání nemůžou stav posunout dvakrát —
// třeba když Stripe doručí webhook vícekrát.

import { ACCOUNTS, getDb } from './db';

export type OnboardingState =
  | 'unpaid'
  | 'checkout_started'
  | 'payment_pending'
  | 'paid'
  | 'questionnaire_completed'
  | 'tracker_queued'
  | 'tracker_generating'
  | 'tracker_ready'
  | 'tracker_failed';

export type AccountStatus = 'active' | 'deletion_requested' | 'deleted';

/** Povolené přechody. Cokoli mimo tuhle mapu je chyba v aplikaci, ne uživatelský vstup. */
export const TRANSITIONS: Record<OnboardingState, OnboardingState[]> = {
  // `paid` i z `unpaid`: platba může dorazit i mimo náš checkout (platební odkaz, ruční
  // platba v Dashboardu) nebo se nemusí povést poznamenat začátek Checkoutu. Bez toho by
  // zaplacený zákazník uvízl na stránce s platbou.
  unpaid: ['checkout_started', 'payment_pending', 'paid'],
  // Zrušený nebo propadlý Checkout vrací účet zpět na začátek.
  checkout_started: ['payment_pending', 'paid', 'unpaid'],
  payment_pending: ['paid', 'unpaid'],
  paid: ['questionnaire_completed'],
  questionnaire_completed: ['tracker_queued'],
  tracker_queued: ['tracker_generating', 'tracker_failed'],
  tracker_generating: ['tracker_ready', 'tracker_failed'],
  // Opakovaný pokus po chybě i pozdější přegenerování hotového trackeru.
  tracker_failed: ['tracker_queued'],
  tracker_ready: ['tracker_queued'],
};

export function isAllowedTransition(from: OnboardingState, to: OnboardingState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** Stavy, ze kterých se smí přejít do `to`. */
export function statesLeadingTo(to: OnboardingState): OnboardingState[] {
  return (Object.keys(TRANSITIONS) as OnboardingState[]).filter((from) => isAllowedTransition(from, to));
}

/**
 * Posune účet do stavu `to`, pokud je v některém z povolených výchozích stavů.
 * Vrací false, když přechod neplatí nebo už ho stihl někdo jiný.
 */
export async function advance(accountId: string, to: OnboardingState): Promise<boolean> {
  const allowedFrom = statesLeadingTo(to);
  if (!allowedFrom.length) return false;
  const db = await getDb();
  const result = await db.collection(ACCOUNTS).updateOne(
    { accountId, onboarding: { $in: allowedFrom }, status: 'active' },
    { $set: { onboarding: to, updatedAt: new Date() } }
  );
  return result.modifiedCount === 1;
}

/** Je účet už v cílovém stavu (nebo dál)? Používá se pro idempotentní zpracování. */
export async function isInState(accountId: string, states: OnboardingState[]): Promise<boolean> {
  const db = await getDb();
  const doc = await db.collection(ACCOUNTS).findOne({ accountId }, { projection: { onboarding: 1 } });
  return Boolean(doc && states.includes(doc.onboarding));
}

/** Kam uživatele poslat podle jeho stavu – jediné místo, kde se to rozhoduje. */
export function nextStepPath(state: OnboardingState, hasAccess: boolean, slug?: string | null): string {
  if (!hasAccess) return '/app/platba';
  switch (state) {
    // Zdrojem pravdy o přístupu je entitlement. Když stav onboardingu zůstal viset před
    // platbou, ale přístup existuje, pustíme zákazníka dál místo zacyklení na platbě.
    case 'unpaid':
    case 'checkout_started':
    case 'payment_pending':
    case 'paid':
      return '/dotaznik';
    // Dotazník je hotový (nově se vyplňuje ještě před platbou) – zbývá vyrobit deník.
    case 'questionnaire_completed':
      return '/app/tracker';
    case 'tracker_queued':
    case 'tracker_generating':
    case 'tracker_failed':
      return '/app/tracker';
    case 'tracker_ready':
      // Samoobslužní zákazníci píší do /app/denik; /t/<slug> patří ručně stavěným.
      return '/app/denik';
    default:
      return '/app/platba';
  }
}
