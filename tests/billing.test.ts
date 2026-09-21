import { describe, expect, it, vi } from 'vitest';
import {
  BillingStore,
  StripeEventInput,
  handleStripeEvent,
  hasAccess,
  toBillingStatus,
} from '../lib/billing';

/** Paměťová náhrada úložiště – logika webhooku jde testovat bez databáze. */
function fakeStore() {
  const events = new Set<string>();
  const entitlements = new Map<string, { accountId: string }>();
  const sessions: Array<{ sessionId: string; status: string }> = [];
  const transitions: Array<{ accountId: string; to: string }> = [];
  const emails: string[] = [];

  const drafts = new Map<string, string>(); // draftId → accountId
  const readyEmails: string[] = [];

  const store: BillingStore = {
    async recordEvent(eventId) {
      if (events.has(eventId)) return false;
      events.add(eventId);
      return true;
    },
    async markEventDone() {},
    async grantEntitlement({ accountId }) {
      if (entitlements.has(accountId)) return 'already_active';
      entitlements.set(accountId, { accountId });
      return 'created';
    },
    async setCheckoutSessionStatus(sessionId, status) {
      sessions.push({ sessionId, status });
    },
    async advanceOnboarding(accountId, to) {
      transitions.push({ accountId, to });
      return true;
    },
    async accountEmail() {
      return 'test@example.com';
    },
    async notifyPaid(email) {
      emails.push(email);
    },
    async accountFromDraft(draftId, email) {
      if (!email) return null;
      if (drafts.has(draftId)) return { accountId: drafts.get(draftId)!, createdForDraft: true };
      if (draftId !== 'draft_ok') return null;
      const accountId = `acc_z_${draftId}`;
      drafts.set(draftId, accountId);
      return { accountId, createdForDraft: true };
    },
    async notifyAccountReady(email) {
      readyEmails.push(email);
    },
  };
  return { store, entitlements, sessions, transitions, emails, drafts, readyEmails };
}

const completedEvent = (overrides: Partial<StripeEventInput> = {}): StripeEventInput => ({
  id: 'evt_1',
  type: 'checkout.session.completed',
  accountId: 'acc_1',
  checkoutSessionId: 'cs_1',
  customerId: 'cus_1',
  paymentIntentId: 'pi_1',
  priceId: 'price_1',
  paymentStatus: 'paid',
  ...overrides,
});

describe('zpracování Stripe události', () => {
  it('po udělení přístupu a dočasném selhání onboardingu dokončí opakovaný webhook původní platby', async () => {
    const { store, entitlements } = fakeStore();
    store.recordEvent = vi.fn(async () => true);
    store.markEventDone = vi.fn(async () => undefined);
    store.markEventFailed = vi.fn(async () => undefined);
    store.resolveDuplicatePayment = vi.fn(async () => 'already_active' as const);
    store.advanceOnboarding = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary_database_failure'))
      .mockResolvedValue(true);
    await expect(handleStripeEvent(completedEvent(), store)).rejects.toThrow('temporary_database_failure');
    expect(entitlements.size).toBe(1);
    expect(store.markEventFailed).toHaveBeenCalledWith('evt_1');
    expect(store.markEventDone).not.toHaveBeenCalled();
    expect(await handleStripeEvent(completedEvent(), store)).toBe('already_active');
    expect(store.advanceOnboarding).toHaveBeenCalledTimes(2);
    expect(store.markEventDone).toHaveBeenCalledWith('evt_1', 'already_active');
  });
  it('jinou platbu předá refundaci a nezmění onboarding původního zákazníka', async () => {
    const { store, transitions } = fakeStore();
    await handleStripeEvent(completedEvent(), store);
    transitions.length = 0;
    store.resolveDuplicatePayment = vi.fn(async () => 'duplicate_purchase_refunded' as const);
    const second = completedEvent({ id: 'evt_2', checkoutSessionId: 'cs_2', paymentIntentId: 'pi_2' });
    expect(await handleStripeEvent(second, store)).toBe('duplicate_purchase_refunded');
    expect(store.resolveDuplicatePayment).toHaveBeenCalledWith('acc_1', second);
    expect(transitions).toEqual([]);
  });
  it('chybu refundace nechá webhook bezpečně opakovat', async () => {
    const { store } = fakeStore();
    await handleStripeEvent(completedEvent(), store);
    store.markEventDone = vi.fn(async () => undefined);
    store.markEventFailed = vi.fn(async () => undefined);
    store.resolveDuplicatePayment = vi.fn(async () => {
      throw new Error('stripe_timeout');
    });
    await expect(
      handleStripeEvent(
        completedEvent({ id: 'evt_2', checkoutSessionId: 'cs_2', paymentIntentId: 'pi_2' }),
        store
      )
    ).rejects.toThrow('stripe_timeout');
    expect(store.markEventFailed).toHaveBeenCalledWith('evt_2');
    expect(store.markEventDone).not.toHaveBeenCalled();
  });
  it('úspěšná platba udělí přístup', async () => {
    const { store, entitlements, transitions } = fakeStore();
    expect(await handleStripeEvent(completedEvent(), store)).toBe('granted');
    expect(entitlements.size).toBe(1);
    expect(transitions).toContainEqual({ accountId: 'acc_1', to: 'paid' });
  });

  it('duplicitní doručení stejné události je neškodné', async () => {
    const { store, entitlements } = fakeStore();
    await handleStripeEvent(completedEvent(), store);
    const second = await handleStripeEvent(completedEvent(), store);
    expect(second).toBe('duplicate');
    expect(entitlements.size).toBe(1);
  });

  it('dvě různé události pro stejný účet nezaloží druhý entitlement', async () => {
    const { store, entitlements } = fakeStore();
    await handleStripeEvent(completedEvent({ id: 'evt_1' }), store);
    const second = await handleStripeEvent(completedEvent({ id: 'evt_2', checkoutSessionId: 'cs_2' }), store);
    expect(second).toBe('already_active');
    expect(entitlements.size).toBe(1);
  });

  it('potvrzovací e-mail se pošle jen při prvním udělení', async () => {
    const { store, emails } = fakeStore();
    await handleStripeEvent(completedEvent({ id: 'evt_1' }), store);
    await handleStripeEvent(completedEvent({ id: 'evt_2' }), store);
    expect(emails).toEqual(['test@example.com']);
  });

  it('selhání odeslání e-mailu neshodí zpracování', async () => {
    const { store, entitlements } = fakeStore();
    store.notifyPaid = async () => {
      throw new Error('poskytovatel nedostupný');
    };
    expect(await handleStripeEvent(completedEvent(), store)).toBe('granted');
    expect(entitlements.size).toBe(1);
  });

  it('nezaplacená odložená platba přístup nedá', async () => {
    const { store, entitlements, transitions } = fakeStore();
    const outcome = await handleStripeEvent(completedEvent({ paymentStatus: 'unpaid' }), store);
    expect(outcome).toBe('pending');
    expect(entitlements.size).toBe(0);
    expect(transitions).toContainEqual({ accountId: 'acc_1', to: 'payment_pending' });
  });

  it('událost bez účtu nic neudělí', async () => {
    const { store, entitlements } = fakeStore();
    expect(await handleStripeEvent(completedEvent({ accountId: null }), store)).toBe('missing_account');
    expect(entitlements.size).toBe(0);
  });

  it('neúspěšná odložená platba vrátí účet na nezaplaceno', async () => {
    const { store, entitlements, transitions } = fakeStore();
    const outcome = await handleStripeEvent(
      completedEvent({ type: 'checkout.session.async_payment_failed' }),
      store
    );
    expect(outcome).toBe('failed_payment');
    expect(entitlements.size).toBe(0);
    expect(transitions).toContainEqual({ accountId: 'acc_1', to: 'unpaid' });
  });

  it('propadlá session přístup nedá', async () => {
    const { store, entitlements, sessions } = fakeStore();
    const outcome = await handleStripeEvent(completedEvent({ type: 'checkout.session.expired' }), store);
    expect(outcome).toBe('expired');
    expect(entitlements.size).toBe(0);
    expect(sessions).toContainEqual({ sessionId: 'cs_1', status: 'expired' });
  });

  it('událost, kterou nesledujeme, se ignoruje', async () => {
    const { store, entitlements } = fakeStore();
    expect(await handleStripeEvent(completedEvent({ type: 'customer.created' }), store)).toBe('ignored');
    expect(entitlements.size).toBe(0);
  });

  it('odložená platba potvrzená později přístup udělí', async () => {
    const { store, entitlements } = fakeStore();
    await handleStripeEvent(completedEvent({ id: 'evt_1', paymentStatus: 'unpaid' }), store);
    const outcome = await handleStripeEvent(
      completedEvent({ id: 'evt_2', type: 'checkout.session.async_payment_succeeded' }),
      store
    );
    expect(outcome).toBe('granted');
    expect(entitlements.size).toBe(1);
  });
});

describe('platba bez účtu (dotazník napřed)', () => {
  const draftEvent = (overrides: Partial<StripeEventInput> = {}): StripeEventInput =>
    completedEvent({ accountId: null, draftId: 'draft_ok', customerEmail: 'novy@example.com', ...overrides });

  it('platba k draftu založí účet a udělí přístup', async () => {
    const { store, entitlements, drafts, readyEmails } = fakeStore();
    expect(await handleStripeEvent(draftEvent(), store)).toBe('granted');
    expect(entitlements.size).toBe(1);
    expect(drafts.get('draft_ok')).toBe('acc_z_draft_ok');
    // Nový účet nemá heslo – odkaz na jeho nastavení je jediná cesta dovnitř.
    expect(readyEmails).toEqual(['test@example.com']);
  });

  it('účet z draftu se nezakládá dvakrát', async () => {
    const { store, entitlements, drafts } = fakeStore();
    await handleStripeEvent(draftEvent({ id: 'evt_1' }), store);
    const second = await handleStripeEvent(draftEvent({ id: 'evt_2', checkoutSessionId: 'cs_2' }), store);
    expect(second).toBe('already_active');
    expect(entitlements.size).toBe(1);
    expect(drafts.size).toBe(1);
  });

  it('neznámý draft nic neudělí', async () => {
    const { store, entitlements } = fakeStore();
    expect(await handleStripeEvent(draftEvent({ draftId: 'draft_neznamy' }), store)).toBe('draft_unresolved');
    expect(entitlements.size).toBe(0);
  });

  it('platba bez e-mailu účet nezaloží', async () => {
    const { store, entitlements } = fakeStore();
    expect(await handleStripeEvent(draftEvent({ customerEmail: null }), store)).toBe('draft_unresolved');
    expect(entitlements.size).toBe(0);
  });

  it('nedoplacená platba k draftu účet nezaloží', async () => {
    const { store, entitlements, drafts } = fakeStore();
    expect(await handleStripeEvent(draftEvent({ paymentStatus: 'unpaid' }), store)).toBe('pending');
    expect(entitlements.size).toBe(0);
    expect(drafts.size).toBe(0);
  });
});

describe('stav přístupu', () => {
  it('bez entitlementu není přístup', () => {
    expect(hasAccess(null)).toBe(false);
  });

  it('odebraný entitlement přístup nedává', () => {
    expect(hasAccess({ status: 'revoked' } as any)).toBe(false);
  });

  it('DTO neobsahuje syrová Stripe data', () => {
    const dto = toBillingStatus({
      accountId: 'acc_1',
      kind: 'purchase',
      status: 'active',
      stripeCustomerId: 'cus_1',
      stripeCheckoutSessionId: 'cs_1',
      stripePaymentIntentId: 'pi_1',
      stripePriceId: 'price_1',
      paidAt: new Date('2026-01-01'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(Object.keys(dto).sort()).toEqual([
      'access',
      'accessUntil',
      'customerRef',
      'expired',
      'exportAvailable',
      'exportUntil',
      'kind',
      'paidAt',
      'purchasePolicyVersion',
      'refundUntil',
    ]);
    expect(JSON.stringify(dto)).not.toContain('pi_1');
    expect(JSON.stringify(dto)).not.toContain('cs_1');
  });
});

describe('překlad Stripe události', () => {
  it('z Checkoutu bez účtu vytáhne draft i e-mail, jinak nic navíc', async () => {
    const { toEventInput } = await import('../lib/stripe');
    const input = toEventInput({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          client_reference_id: 'draft_ok',
          metadata: { draftId: 'draft_ok' },
          customer_details: { email: 'Novy@Example.com' },
          payment_status: 'paid',
        },
      },
    } as any);

    expect(input.draftId).toBe('draft_ok');
    expect(input.customerEmail).toBe('Novy@Example.com');
    // client_reference_id nese draft, ne účet – jinak by se platba přiřadila cizímu účtu.
    expect(input.accountId).toBeNull();
  });

  it('starší Checkout s účtem funguje dál', async () => {
    const { toEventInput } = await import('../lib/stripe');
    const input = toEventInput({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_2', client_reference_id: 'acc_1', metadata: { accountId: 'acc_1' } } },
    } as any);

    expect(input.accountId).toBe('acc_1');
    expect(input.draftId).toBeNull();
  });
});
