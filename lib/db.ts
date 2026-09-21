import { MongoClient, Db } from 'mongodb';

// Jeden sdílený klient pro všechny API routy. V serverless (Vercel) se modul mezi
// invokacemi recykluje, takže connection promise cachujeme na globálním objektu.
const uri = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'food_notes'; // ponecháno kvůli existujícím datům

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

export function hasDb(): boolean {
  return Boolean(uri);
}

export async function getDb(): Promise<Db> {
  if (!uri) throw new Error('Chybí MONGODB_URI');
  if (!global.__mongoClientPromise) {
    global.__mongoClientPromise = new MongoClient(uri).connect();
  }
  const client = await global.__mongoClientPromise;
  return client.db(DB_NAME);
}

/** Denní záznamy (šifrovaný obsah, v čistém jen tenantId + date). */
export const DAYS = 'daily_notes';
/** Laboratorní odběry včetně šifrovaného PDF. */
export const LABS = 'blood_tests';
/** Tajemství zákazníka: zabalený datový klíč, hash klíče pro Health Auto Export. */
export const TENANTS = 'tenants';
/** Uživatelé zákazníka (zatím jeden na aplikaci, model už počítá s víc). */
export const USERS = 'tenant_users';
/** Přihlášení a mazání dat – kvůli dohledatelnosti u zdravotních dat. */
export const AUDIT = 'audit_log';

/** Samoobslužné účty (identita, heslo, stav onboardingu). */
export const ACCOUNTS = 'accounts';
/** Zdroj pravdy o přístupu – nikdy se neodvozuje ze stavu ve frontendu. */
export const ENTITLEMENTS = 'entitlements';
/** Zpracované Stripe události kvůli idempotenci webhooku. */
export const STRIPE_EVENTS = 'stripe_events';
/** Založené Checkout Session, ať jde spárovat návrat z platby. */
export const CHECKOUT_SESSIONS = 'checkout_sessions';
/** Jednorázové tokeny (ověření e-mailu, reset hesla) – v DB jen otisk. */
export const AUTH_TOKENS = 'auth_tokens';
/** Počitadla pro rate limiting, čistí se TTL indexem. */
export const RATE_LIMITS = 'rate_limits';
/** Odpovědi z onboardingového dotazníku (šifrované) a stav generování. */
export const QUESTIONNAIRES = 'questionnaire_responses';
/** Verzované definice trackeru (šifrované), právě jedna aktivní na zákazníka. */
export const TRACKERS = 'tracker_definitions';
/** Dotazník vyplněný před platbou, zatím bez účtu. */
export const DRAFTS = 'questionnaire_drafts';
/** Jeden zašifrovaný AI výstup a souhlas na zakoupený účet; _id je accountId. */
export const JOURNAL_ANALYSES = 'journal_analyses';
/** Finanční žádosti bez zdravotního obsahu; _id refundu je Payment Intent. */
export const REFUND_REQUESTS = 'refund_requests';
/** Přijatá právní prohlášení o odstoupení; _id je Checkout Session. */
export const WITHDRAWAL_REQUESTS = 'withdrawal_requests';

/** Indexy je bezpečné volat opakovaně; Mongo existující jen potvrdí. */
export async function ensureIndexes(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection(DAYS).createIndex({ tenantId: 1, date: 1 }, { unique: true }),
    db.collection(LABS).createIndex({ tenantId: 1, date: 1 }, { unique: true }),
    db.collection(TENANTS).createIndex({ tenantId: 1 }, { unique: true }),
    db.collection(TENANTS).createIndex({ healthKeyHash: 1 }, { sparse: true }),
    db.collection(USERS).createIndex({ tenantId: 1, userId: 1 }, { unique: true }),
    db.collection(AUDIT).createIndex({ tenantId: 1, at: -1 }),

    db.collection(ACCOUNTS).createIndex({ accountId: 1 }, { unique: true }),
    db.collection(ACCOUNTS).createIndex({ email: 1 }, { unique: true }),
    db.collection(ACCOUNTS).createIndex({ tenantId: 1 }, { sparse: true }),
    // Jeden entitlement na účet → grant je idempotentní i při opakovaném webhooku.
    db.collection(ENTITLEMENTS).createIndex({ accountId: 1 }, { unique: true }),
    db.collection(ENTITLEMENTS).createIndex({ stripeCheckoutSessionId: 1 }, { unique: true, sparse: true }),
    db.collection(STRIPE_EVENTS).createIndex({ eventId: 1 }, { unique: true }),
    db.collection(CHECKOUT_SESSIONS).createIndex({ sessionId: 1 }, { unique: true }),
    db.collection(CHECKOUT_SESSIONS).createIndex({ accountId: 1, createdAt: -1 }),
    db.collection(AUTH_TOKENS).createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection(AUTH_TOKENS).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection(RATE_LIMITS).createIndex({ key: 1 }, { unique: true }),
    db.collection(RATE_LIMITS).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),

    db.collection(QUESTIONNAIRES).createIndex({ tenantId: 1 }, { unique: true }),
    db.collection(JOURNAL_ANALYSES).createIndex({ tenantId: 1 }),
    db.collection(REFUND_REQUESTS).createIndex({ accountId: 1, requestedAt: -1 }),
    db.collection(REFUND_REQUESTS).createIndex({ status: 1, updatedAt: 1 }),
    db.collection(WITHDRAWAL_REQUESTS).createIndex({ accountId: 1, createdAt: -1 }),
    db.collection(DRAFTS).createIndex({ draftId: 1 }, { unique: true }),
    db.collection(DRAFTS).createIndex({ accountId: 1 }, { sparse: true }),
    // Bez TTL indexu: propadlý draft se maže i s obsahem přes purgeExpiredDrafts(),
    // aby po něm nezůstaly osiřelé zašifrované odpovědi.
    db.collection(DRAFTS).createIndex({ expiresAt: 1 }),
    db.collection(TRACKERS).createIndex({ tenantId: 1, version: 1 }, { unique: true }),
    // Právě jedna aktivní definice na zákazníka – hlídá to databáze, ne aplikační kód.
    db.collection(TRACKERS).createIndex(
      { tenantId: 1, active: 1 },
      { unique: true, partialFilterExpression: { active: true } }
    ),
  ]);
}
