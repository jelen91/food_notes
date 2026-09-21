// Server-only service. Import from getServerSideProps/API handlers only; the browser
// receives this DTO, never the Stripe client, price ID or secret key.
import { getStripe } from './stripe';

export interface PublicOffer {
  priceLabel: string | null;
  available: boolean;
}

const UNAVAILABLE: PublicOffer = { priceLabel: null, available: false };
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
let cached: { key: string; expiresAt: number; value: PublicOffer } | null = null;
let pending: { key: string; promise: Promise<PublicOffer> } | null = null;

/** The actual one-time Stripe price used by checkout. Fail closed, without a made-up price. */
export async function getPublicOffer(): Promise<PublicOffer> {
  if (typeof window !== 'undefined') throw new Error('Offer must be loaded on the server.');
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId || !process.env.STRIPE_SECRET_KEY) return { ...UNAVAILABLE };
  if (cached?.key === priceId && cached.expiresAt > Date.now()) return { ...cached.value };
  if (pending?.key === priceId) return pending.promise;

  const promise = (async (): Promise<PublicOffer> => {
    let value = { ...UNAVAILABLE };
    try {
      const price = await getStripe().prices.retrieve(priceId, {}, { timeout: 3500, maxNetworkRetries: 0 });
      if (price.active && price.type === 'one_time' && price.billing_scheme === 'per_unit' &&
          typeof price.unit_amount === 'number' && price.unit_amount > 0 && !price.custom_unit_amount) {
        value = {
          priceLabel: new Intl.NumberFormat('cs-CZ', {
            style: 'currency', currency: price.currency.toUpperCase(), maximumFractionDigits: 2,
          }).format(price.unit_amount / (ZERO_DECIMAL.has(price.currency) ? 1 : 100)),
          available: true,
        };
      }
    } catch {
      // A missing/slow provider must not break public pages or expose internal errors.
    }
    cached = { key: priceId, value, expiresAt: Date.now() + (value.available ? 300_000 : 30_000) };
    return { ...value };
  })();
  pending = { key: priceId, promise };
  try { return await promise; } finally { if (pending?.promise === promise) pending = null; }
}
