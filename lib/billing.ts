// Entitlement = zdroj pravdy o přístupu. Nikdy se neodvozuje z návratu ze Stripe,
// z query parametrů ani ze stavu ve frontendu – zapisuje ho výhradně ověřený webhook.
//
// Zpracování události je napsané nad rozhraním `BillingStore`, aby šlo testovat bez databáze.

import { ACCOUNTS, CHECKOUT_SESSIONS, ENTITLEMENTS, STRIPE_EVENTS, getDb } from './db';

export type EntitlementKind = 'purchase' | 'legacy' | 'manual';
export type EntitlementStatus = 'active' | 'revoked';

export interface Entitlement {
  accountId: string;
  kind: EntitlementKind;
  status: EntitlementStatus;
  stripeCustomerId?: string | null;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripePriceId?: string | null;
  paidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Minimální podoba Stripe události, se kterou logika pracuje. */
export interface StripeEventInput {
  id: string;
  type: string;
  accountId?: string | null;
  /** Dotazník vyplněný před platbou; účet k němu vzniká až tady. */
  draftId?: string | null;
  /** E-mail z Checkoutu – jediný osobní údaj, který od Stripe přebíráme. */
  customerEmail?: string | null;
  checkoutSessionId?: string | null;
  customerId?: string | null;
  paymentIntentId?: string | null;
  priceId?: string | null;
  paymentStatus?: string | null;
}

export interface BillingStore {
  /** false = událost už byla zpracovaná (duplicitní doručení). */
  recordEvent(eventId: string, type: string): Promise<boolean>;
  markEventDone(eventId: string, outcome: string): Promise<void>;
  grantEntitlement(input: {
    accountId: string;
    checkoutSessionId?: string | null;
    customerId?: string | null;
    paymentIntentId?: string | null;
    priceId?: string | null;
  }): Promise<'created' | 'already_active'>;
  setCheckoutSessionStatus(sessionId: string, status: string): Promise<void>;
  advanceOnboarding(accountId: string, to: 'paid' | 'payment_pending' | 'unpaid'): Promise<boolean>;
  accountEmail(accountId: string): Promise<string | null>;
  notifyPaid?(email: string): Promise<void>;
  /**
   * Z draftu (dotazník vyplněný před platbou) udělá účet a vrátí jeho ID.
   * Musí být idempotentní – Stripe stejnou událost klidně doručí víckrát.
   */
  accountFromDraft?(draftId: string, email: string | null): Promise<string | null>;
  /** Pozvánka k nastavení hesla pro čerstvě založený účet. */
  notifyAccountReady?(email: string): Promise<void>;
}

export type EventOutcome =
  | 'duplicate'
  | 'granted'
  | 'already_active'
  | 'pending'
  | 'failed_payment'
  | 'expired'
  | 'ignored'
  | 'missing_account'
  /** Platba dorazila, ale draft ani účet se k ní nepodařilo najít – nutný ruční zásah. */
  | 'draft_unresolved';

/**
 * Idempotentní zpracování jedné Stripe události.
 * Duplicitní doručení skončí hned na `recordEvent`, takže se nikdy nevytvoří druhý entitlement.
 */
export async function handleStripeEvent(event: StripeEventInput, store: BillingStore): Promise<EventOutcome> {
  const fresh = await store.recordEvent(event.id, event.type);
  if (!fresh) return 'duplicate';

  const outcome = await processEvent(event, store);
  await store.markEventDone(event.id, outcome);
  return outcome;
}

async function processEvent(event: StripeEventInput, store: BillingStore): Promise<EventOutcome> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      if (event.checkoutSessionId) await store.setCheckoutSessionStatus(event.checkoutSessionId, 'completed');

      // Odložené platby (bankovní převod) mají session dokončenou, ale platbu ještě ne.
      // U platby bez účtu nemáme koho posunout – účet vznikne až po doplacení.
      const settled =
        !event.paymentStatus || event.paymentStatus === 'paid' || event.paymentStatus === 'no_payment_required';
      if (!settled) {
        if (event.accountId) await store.advanceOnboarding(event.accountId, 'payment_pending');
        return 'pending';
      }

      // Účet buď existuje (starší flow), nebo teprve vzniká z draftu.
      let accountId = event.accountId ?? null;
      let freshAccount = false;
      if (!accountId && event.draftId && store.accountFromDraft) {
        accountId = await store.accountFromDraft(event.draftId, event.customerEmail ?? null);
        freshAccount = Boolean(accountId);
      }
      if (!accountId) return event.draftId ? 'draft_unresolved' : 'missing_account';

      const result = await store.grantEntitlement({
        accountId,
        checkoutSessionId: event.checkoutSessionId,
        customerId: event.customerId,
        paymentIntentId: event.paymentIntentId,
        priceId: event.priceId,
      });
      // Účet z draftu má dotazník vyplněný ještě před platbou, takže je rovnou dál než `paid`.
      if (!freshAccount) await store.advanceOnboarding(accountId, 'paid');

      if (result === 'created') {
        const email = (await store.accountEmail(accountId)) ?? event.customerEmail ?? null;
        // Nepovedený e-mail nesmí shodit webhook – Stripe by ho pak posílal znovu.
        if (email && freshAccount && store.notifyAccountReady) {
          await store.notifyAccountReady(email).catch(() => undefined);
        } else if (email && store.notifyPaid) {
          await store.notifyPaid(email).catch(() => undefined);
        }
      }
      return result === 'created' ? 'granted' : 'already_active';
    }

    case 'checkout.session.async_payment_failed': {
      if (event.checkoutSessionId) await store.setCheckoutSessionStatus(event.checkoutSessionId, 'payment_failed');
      if (event.accountId) await store.advanceOnboarding(event.accountId, 'unpaid');
      return 'failed_payment';
    }

    case 'checkout.session.expired': {
      if (event.checkoutSessionId) await store.setCheckoutSessionStatus(event.checkoutSessionId, 'expired');
      if (event.accountId) await store.advanceOnboarding(event.accountId, 'unpaid');
      return 'expired';
    }

    default:
      return 'ignored';
  }
}

// ---------- implementace nad MongoDB ----------

export const mongoBillingStore: BillingStore = {
  async recordEvent(eventId, type) {
    const db = await getDb();
    try {
      await db.collection(STRIPE_EVENTS).insertOne({ eventId, type, status: 'processing', receivedAt: new Date() });
      return true;
    } catch (err: any) {
      if (err?.code === 11000) return false; // unikátní index = už jsme ji viděli
      throw err;
    }
  },

  async markEventDone(eventId, outcome) {
    const db = await getDb();
    await db
      .collection(STRIPE_EVENTS)
      .updateOne({ eventId }, { $set: { status: 'processed', outcome, processedAt: new Date() } });
  },

  async grantEntitlement(input) {
    const db = await getDb();
    const now = new Date();
    const result = await db.collection(ENTITLEMENTS).updateOne(
      { accountId: input.accountId },
      {
        $setOnInsert: {
          accountId: input.accountId,
          kind: 'purchase' as EntitlementKind,
          status: 'active' as EntitlementStatus,
          stripeCustomerId: input.customerId ?? null,
          stripeCheckoutSessionId: input.checkoutSessionId ?? null,
          stripePaymentIntentId: input.paymentIntentId ?? null,
          stripePriceId: input.priceId ?? null,
          paidAt: now,
          createdAt: now,
        },
        $set: { updatedAt: now },
      },
      { upsert: true }
    );
    return result.upsertedCount === 1 ? 'created' : 'already_active';
  },

  async setCheckoutSessionStatus(sessionId, status) {
    const db = await getDb();
    await db
      .collection(CHECKOUT_SESSIONS)
      .updateOne({ sessionId }, { $set: { status, updatedAt: new Date() } });
  },

  async advanceOnboarding(accountId, to) {
    const { advance } = await import('./onboarding');
    return advance(accountId, to);
  },

  async accountEmail(accountId) {
    const db = await getDb();
    const doc = await db.collection(ACCOUNTS).findOne({ accountId }, { projection: { email: 1 } });
    return doc?.email ?? null;
  },

  async notifyPaid(email) {
    const { sendPaymentConfirmationEmail } = await import('./email');
    await sendPaymentConfirmationEmail(email);
  },

  async accountFromDraft(draftId, email) {
    if (!email) return null;
    const { getDraft, claimDraft, workspaceHasContent, discardDraftWorkspace } = await import('./drafts');
    const { createAccountForPurchase, setWorkspace } = await import('./accounts');

    const draft = await getDraft(draftId);
    if (!draft) return null;
    // Opakované doručení stejné platby – účet už z tohohle draftu vznikl.
    if (draft.accountId) return draft.accountId;

    const { account, created } = await createAccountForPurchase(email, {
      tenantId: draft.tenantId,
      slug: draft.slug,
    });

    if (!created) {
      // Zákazník už účet měl. Workspace draftu si vezme jen tehdy, když v tom svém
      // ještě nic nemá – hotový deník ani zápisy nikdy nepřepisujeme.
      if (await workspaceHasContent(account.tenantId)) {
        await discardDraftWorkspace(draft);
      } else {
        await setWorkspace(account.accountId, { tenantId: draft.tenantId, slug: draft.slug }, 'questionnaire_completed');
      }
    }

    await claimDraft(draftId, account.accountId);
    return account.accountId;
  },

  async notifyAccountReady(email) {
    const { findAccountByEmail } = await import('./accounts');
    const { issueToken } = await import('./tokens');
    const { sendAccountReadyEmail } = await import('./email');
    const account = await findAccountByEmail(email);
    if (!account) return;
    const token = await issueToken(account.accountId, 'set_password');
    await sendAccountReadyEmail(email, token);
  },
};

// ---------- čtení pro aplikaci ----------

export async function getEntitlement(accountId: string): Promise<Entitlement | null> {
  const db = await getDb();
  return (await db.collection(ENTITLEMENTS).findOne({ accountId })) as unknown as Entitlement | null;
}

export function hasAccess(entitlement: Entitlement | null): boolean {
  return Boolean(entitlement && entitlement.status === 'active');
}

/** DTO pro obrazovku s platbou – žádné syrové Stripe objekty. */
export function toBillingStatus(entitlement: Entitlement | null) {
  return {
    access: hasAccess(entitlement),
    kind: entitlement?.kind ?? null,
    paidAt: entitlement?.paidAt ?? null,
    customerRef: entitlement?.stripeCustomerId ?? null,
  };
}

/** Legacy zákazníci (ruční onboarding) – přístup bez platby. */
export async function grantLegacyEntitlement(accountId: string): Promise<'created' | 'already_active'> {
  const db = await getDb();
  const now = new Date();
  const result = await db.collection(ENTITLEMENTS).updateOne(
    { accountId },
    {
      $setOnInsert: {
        accountId,
        kind: 'legacy' as EntitlementKind,
        status: 'active' as EntitlementStatus,
        paidAt: null,
        createdAt: now,
      },
      $set: { updatedAt: now },
    },
    { upsert: true }
  );
  return result.upsertedCount === 1 ? 'created' : 'already_active';
}
