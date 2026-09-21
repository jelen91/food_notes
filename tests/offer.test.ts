import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { retrieve } = vi.hoisted(() => ({ retrieve: vi.fn() }));
vi.mock('../lib/stripe', () => ({ getStripe: () => ({ prices: { retrieve } }) }));

beforeEach(() => {
  vi.resetModules();
  retrieve.mockReset();
  vi.stubEnv('STRIPE_PRICE_ID', 'price_test_public_offer');
  vi.stubEnv('STRIPE_SECRET_KEY', 'test-only-key');
});
afterEach(() => vi.unstubAllEnvs());

const price = { active: true, type: 'one_time', billing_scheme: 'per_unit', unit_amount: 49000, currency: 'czk' };

describe('public offer uses the checkout price', () => {
  it('formats the configured price and caches repeated reads', async () => {
    retrieve.mockResolvedValue(price);
    const { getPublicOffer } = await import('../lib/offer');
    const offer = await getPublicOffer();
    expect(offer.available).toBe(true);
    expect(offer.priceLabel?.replace(/\s/g, ' ')).toBe('490,00 Kč');
    expect(await getPublicOffer()).toEqual(offer);
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith('price_test_public_offer', {}, { timeout: 3500, maxNetworkRetries: 0 });
    expect(JSON.stringify(offer)).not.toContain('price_test');
  });

  it('does not display a recurring price as a one-time purchase', async () => {
    retrieve.mockResolvedValue({ ...price, type: 'recurring' });
    expect(await (await import('../lib/offer')).getPublicOffer()).toEqual({ available: false, priceLabel: null });
  });

  it('fails closed when Stripe is unavailable', async () => {
    retrieve.mockRejectedValue(new Error('provider error with internal details'));
    const { getPublicOffer } = await import('../lib/offer');
    expect(await getPublicOffer()).toEqual({ available: false, priceLabel: null });
    expect(await getPublicOffer()).toEqual({ available: false, priceLabel: null });
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it('never calls Stripe when configuration is missing', async () => {
    vi.stubEnv('STRIPE_PRICE_ID', '');
    expect(await (await import('../lib/offer')).getPublicOffer()).toEqual({ available: false, priceLabel: null });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('respects zero-decimal currencies', async () => {
    retrieve.mockResolvedValue({ ...price, currency: 'jpy', unit_amount: 1000 });
    const offer = await (await import('../lib/offer')).getPublicOffer();
    expect(offer.priceLabel?.replace(/\s/g, '')).toContain('1000');
  });
});
