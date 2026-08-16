// Jednorázové tokeny pro ověření e-mailu a reset hesla.
//
// V databázi je jen SHA-256 otisk – únik dumpu tedy nedovolí tokeny použít. Platnost hlídá
// TTL index, opakované použití brání `usedAt`.

import { AUTH_TOKENS, getDb } from './db';
import { hashToken } from './crypto';
import { randomBytes } from 'crypto';

export type TokenPurpose = 'verify_email' | 'reset_password' | 'set_password';

const TTL_SECONDS: Record<TokenPurpose, number> = {
  verify_email: 60 * 60 * 24 * 3, // 3 dny
  reset_password: 60 * 60, // 1 hodina
  // První heslo po zaplacení: odkaz z e-mailu je jediná cesta do deníku z jiného
  // zařízení, takže krátká platnost by zákazníka jen zbytečně zavřela venku.
  set_password: 60 * 60 * 24 * 7, // 7 dní
};

/** Vrátí token v čitelné podobě – ukládá se jen jeho otisk, takže tohle je jediná příležitost ho poslat. */
export async function issueToken(accountId: string, purpose: TokenPurpose): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const db = await getDb();
  await db.collection(AUTH_TOKENS).insertOne({
    tokenHash: hashToken(token),
    accountId,
    purpose,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + TTL_SECONDS[purpose] * 1000),
    usedAt: null,
  });
  return token;
}

/**
 * Ověří a rovnou spotřebuje token. Atomický findOneAndUpdate zajistí, že souběžné
 * použití stejného tokenu uspěje nejvýš jednou.
 */
export async function consumeToken(token: string, purpose: TokenPurpose): Promise<string | null> {
  if (!token) return null;
  const db = await getDb();
  const doc = await db.collection(AUTH_TOKENS).findOneAndUpdate(
    { tokenHash: hashToken(token), purpose, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { returnDocument: 'after' }
  );
  const value = (doc as any)?.accountId ?? (doc as any)?.value?.accountId ?? null;
  return value;
}

/** Po změně hesla zneplatní všechny ostatní resetovací tokeny účtu. */
export async function invalidateTokens(accountId: string, purpose: TokenPurpose): Promise<void> {
  const db = await getDb();
  await db
    .collection(AUTH_TOKENS)
    .updateMany({ accountId, purpose, usedAt: null }, { $set: { usedAt: new Date() } });
}
