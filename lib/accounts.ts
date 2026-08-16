// Samoobslužné účty: registrace, přihlášení, ověření e-mailu, změna hesla.
//
// Staví na tom, co v projektu už je – scrypt hashe (lib/password.ts), workspace se šifrovacím
// klíčem (lib/store.ts) a stavový automat (lib/onboarding.ts). Stávající tenant přihlášení
// heslem k `/t/<slug>` běží dál vedle toho a nic z toho se ho nedotýká.

import { ACCOUNTS, getDb } from './db';
import { hashPassword, verifyPassword } from './password';
import { randomToken } from './crypto';
import { createTenantSecrets } from './store';
import type { AccountStatus, OnboardingState } from './onboarding';

export interface Account {
  accountId: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  status: AccountStatus;
  onboarding: OnboardingState;
  /** Workspace s daty a šifrovacím klíčem; zakládá se hned při registraci. */
  tenantId: string | null;
  slug: string | null;
  createdAt: Date;
  updatedAt: Date;
  failedAttempts?: number;
  lockedUntil?: Date | null;
  lastLoginAt?: Date | null;
  deletionRequestedAt?: Date | null;
}

const MAX_FAILED_ATTEMPTS = 10;
const LOCK_MINUTES = 15;

export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

/** Minimální požadavky na heslo – délka dělá víc než vynucené znakové třídy. */
export function passwordProblem(password: string): string | null {
  if (typeof password !== 'string' || password.length < 10) return 'Heslo musí mít aspoň 10 znaků.';
  if (password.length > 200) return 'Heslo je příliš dlouhé.';
  return null;
}

export async function findAccountByEmail(email: string): Promise<Account | null> {
  const db = await getDb();
  return (await db.collection(ACCOUNTS).findOne({ email: normalizeEmail(email) })) as unknown as Account | null;
}

export async function findAccountById(accountId: string): Promise<Account | null> {
  const db = await getDb();
  return (await db.collection(ACCOUNTS).findOne({ accountId })) as unknown as Account | null;
}

export interface RegisterResult {
  account: Account;
  created: boolean;
}

/**
 * Založí účet i jeho workspace (kvůli šifrovacímu klíči pro pozdější odpovědi z dotazníku).
 * Když e-mail existuje, vrací created=false – volající nesmí prozradit, který e-mail je zabraný.
 */
export async function registerAccount(email: string, password: string): Promise<RegisterResult> {
  const db = await getDb();
  const normalized = normalizeEmail(email);
  const existing = await findAccountByEmail(normalized);
  if (existing) return { account: existing, created: false };

  const accountId = `acc_${randomToken(16)}`;
  const tenantId = `u_${randomToken(10)}`;
  const slug = randomToken(8);

  const account: Account = {
    accountId,
    email: normalized,
    passwordHash: await hashPassword(password),
    emailVerifiedAt: null,
    status: 'active',
    onboarding: 'unpaid',
    tenantId,
    slug,
    createdAt: new Date(),
    updatedAt: new Date(),
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
  };

  try {
    await db.collection(ACCOUNTS).insertOne(account as any);
  } catch (err: any) {
    // Souběžná registrace stejného e-mailu – unikátní index rozhodl za nás.
    if (err?.code === 11000) {
      const winner = await findAccountByEmail(normalized);
      if (winner) return { account: winner, created: false };
    }
    throw err;
  }

  // Datový klíč workspace. Kdyby tenhle krok selhal, účet zůstane bez workspace –
  // proto se zakládá hned a případný neúspěch se pozná při prvním zápisu dat.
  await createTenantSecrets(tenantId);
  return { account, created: true };
}

/**
 * Účet vzniklý zaplacením: e-mail známe od Stripe, heslo si zákazník nastaví odkazem
 * z e-mailu. Do té doby má nepoužitelný hash – přihlásit se jím nejde.
 *
 * Workspace se přebírá z draftu, takže odpovědi z dotazníku zůstanou tam, kde jsou.
 * Když účet s tímhle e-mailem už existuje, vrací se beze změny (`created: false`) –
 * o tom, jestli si vezme workspace draftu, rozhoduje volající.
 */
export async function createAccountForPurchase(
  email: string,
  workspace: { tenantId: string; slug: string }
): Promise<RegisterResult> {
  const db = await getDb();
  const normalized = normalizeEmail(email);
  const existing = await findAccountByEmail(normalized);
  if (existing) return { account: existing, created: false };

  const account: Account = {
    accountId: `acc_${randomToken(16)}`,
    email: normalized,
    // Náhodné, nikomu neznámé heslo. Přístup dává až odkaz na nastavení hesla.
    passwordHash: await hashPassword(randomToken(40)),
    emailVerifiedAt: null,
    status: 'active',
    // Dotazník je vyplněný ještě před platbou, takže onboarding začíná až u generování.
    onboarding: 'questionnaire_completed',
    tenantId: workspace.tenantId,
    slug: workspace.slug,
    createdAt: new Date(),
    updatedAt: new Date(),
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
  };

  try {
    await db.collection(ACCOUNTS).insertOne(account as any);
  } catch (err: any) {
    if (err?.code === 11000) {
      const winner = await findAccountByEmail(normalized);
      if (winner) return { account: winner, created: false };
    }
    throw err;
  }
  return { account, created: true };
}

/**
 * Přepne účet na workspace draftu. Volá se jen tehdy, když je dosavadní workspace prázdný
 * (viz `workspaceHasContent`) – hotová data se nikdy nepřepisují.
 */
export async function setWorkspace(
  accountId: string,
  workspace: { tenantId: string; slug: string },
  onboarding?: OnboardingState
): Promise<void> {
  const db = await getDb();
  const patch: Record<string, unknown> = {
    tenantId: workspace.tenantId,
    slug: workspace.slug,
    updatedAt: new Date(),
  };
  if (onboarding) patch.onboarding = onboarding;
  await db.collection(ACCOUNTS).updateOne({ accountId }, { $set: patch });
}

// Projekt běží s `strict: false`, kde se rozlišené sjednocení podle boolean literálu
// nezužuje spolehlivě – proto jeden tvar s volitelnými poli.
export interface LoginResult {
  ok: boolean;
  account?: Account;
  reason?: 'invalid' | 'locked' | 'deleted';
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const account = await findAccountByEmail(email);
  // Ověření hesla proběhne i u neexistujícího účtu, aby odpověď netrvala nápadně jinak.
  if (!account) {
    await verifyPassword(password, 'scrypt$AAAA$AAAA');
    return { ok: false, reason: 'invalid' };
  }
  if (account.status === 'deleted') return { ok: false, reason: 'deleted' };
  if (account.lockedUntil && new Date(account.lockedUntil) > new Date()) return { ok: false, reason: 'locked' };

  const ok = await verifyPassword(password, account.passwordHash);
  await noteLoginAttempt(account.accountId, ok);
  return ok ? { ok: true, account } : { ok: false, reason: 'invalid' };
}

async function noteLoginAttempt(accountId: string, ok: boolean): Promise<void> {
  const db = await getDb();
  if (ok) {
    await db
      .collection(ACCOUNTS)
      .updateOne({ accountId }, { $set: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
    return;
  }
  const doc = await db
    .collection(ACCOUNTS)
    .findOneAndUpdate({ accountId }, { $inc: { failedAttempts: 1 } }, { returnDocument: 'after' });
  const attempts = (doc as any)?.failedAttempts ?? (doc as any)?.value?.failedAttempts ?? 0;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    await db.collection(ACCOUNTS).updateOne(
      { accountId },
      { $set: { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000) } }
    );
  }
}

export async function markEmailVerified(accountId: string): Promise<void> {
  const db = await getDb();
  await db
    .collection(ACCOUNTS)
    .updateOne({ accountId }, { $set: { emailVerifiedAt: new Date(), updatedAt: new Date() } });
}

export async function changePassword(accountId: string, password: string): Promise<void> {
  const db = await getDb();
  await db.collection(ACCOUNTS).updateOne(
    { accountId },
    { $set: { passwordHash: await hashPassword(password), failedAttempts: 0, lockedUntil: null, updatedAt: new Date() } }
  );
}

/** Data pro frontend – jen to, co obrazovka potřebuje. Žádný hash, žádné interní příznaky. */
export function toPublicAccount(account: Account) {
  return {
    email: account.email,
    emailVerified: Boolean(account.emailVerifiedAt),
    status: account.status,
    onboarding: account.onboarding,
    slug: account.slug,
    createdAt: account.createdAt,
  };
}
