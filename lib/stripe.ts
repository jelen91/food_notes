// Stripe klient a překlad události do tvaru, se kterým pracuje lib/billing.ts.
//
// Tajný klíč zůstává na serveru; do prohlížeče se posílá jen URL Checkoutu.

import Stripe from 'stripe';
import type { StripeEventInput } from './billing';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Chybí STRIPE_SECRET_KEY.');
    // Verzi API needitujeme ručně – bere se ta, na kterou je navázané SDK.
    client = new Stripe(key);
  }
  return client;
}

/** Události, na které reagujeme. Ostatní webhook přijme a ignoruje. */
export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
];

function idOf(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return (value as { id?: string }).id ?? null;
}

/** Ze Stripe události vytáhne jen to málo, co aplikace potřebuje. */
export function toEventInput(event: Stripe.Event): StripeEventInput {
  const session = event.data?.object as Stripe.Checkout.Session | undefined;
  const draftId = session?.metadata?.draftId ?? null;
  return {
    id: event.id,
    type: event.type,
    // Platba bez účtu (dotazník napřed) nese draftId; starší Checkouty accountId.
    // client_reference_id je jen zrcadlo pro dashboard, proto se čte až na druhém místě.
    accountId: session?.metadata?.accountId ?? (draftId ? null : (session?.client_reference_id ?? null)),
    draftId,
    // E-mail vybírá Stripe v Checkoutu; jiné údaje o zákazníkovi si nebereme.
    customerEmail: session?.customer_details?.email ?? session?.customer_email ?? null,
    checkoutSessionId: session?.id ?? null,
    customerId: idOf(session?.customer),
    paymentIntentId: idOf(session?.payment_intent),
    priceId: session?.metadata?.priceId ?? process.env.STRIPE_PRICE_ID ?? null,
    paymentStatus: session?.payment_status ?? null,
    purchasePolicyVersion: session?.metadata?.purchasePolicyVersion ?? null,
    paidAt: Number.isFinite(event.created) ? new Date(event.created * 1000) : null,
  };
}
