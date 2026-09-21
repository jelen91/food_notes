// Rozpracovaný dotazník před platbou.
//
// Návštěvník vyplní dotazník bez účtu a bez placení – to je první krok, ve kterém má
// překážek co nejmíň. Aby odpovědi ležely v databázi stejně chráněné jako zbytek dat,
// zakládá se workspace i s datovým klíčem už tady a odpovědi se ukládají obvyklou cestou
// (`lib/tracker/store.ts`). Po zaplacení se ten samý workspace jen připojí k novému účtu,
// takže se nic nepřenáší ani nepřešifrovává.
//
// Draft je identifikovaný náhodným tokenem v HttpOnly cookie. Kdo cookie nemá, k odpovědím
// se nedostane; nezaplacené drafty se po expiraci mažou i s obsahem.

import { DRAFTS, QUESTIONNAIRES, TENANTS, TRACKERS, DAYS, getDb } from './db';
import { randomToken } from './crypto';
import { createTenantSecrets } from './store';

export const DRAFT_COOKIE = 'hj_draft';

/** Nezaplacený draft je po měsíci k ničemu – zmizí i s odpověďmi. */
const DRAFT_TTL_DAYS = 30;

export interface Draft {
  draftId: string;
  tenantId: string;
  slug: string;
  submittedAt: Date | null;
  /** Vyplní se až po zaplacení, když k draftu vznikne účet. */
  accountId: string | null;
  /** Jen webhook smí povolit přihlášení, a pouze k účtu nově vytvořenému tímto draftem. */
  autoSignInAccountId?: string | null;
  claimedCheckoutSessionId?: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export function draftIdFromCookie(value: unknown): string {
  const id = String(value ?? '').trim();
  return /^[a-z0-9]{16,40}$/.test(id) ? id : '';
}

export async function createDraft(): Promise<Draft> {
  const db = await getDb();
  const draft: Draft = {
    draftId: randomToken(24),
    tenantId: `u_${randomToken(10)}`,
    slug: randomToken(8),
    submittedAt: null,
    accountId: null,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + DRAFT_TTL_DAYS * 24 * 3600 * 1000),
  };
  await db.collection(DRAFTS).insertOne(draft as any);
  // Datový klíč workspace – bez něj by nešlo odpovědi zašifrovat.
  await createTenantSecrets(draft.tenantId);
  return draft;
}

export async function getDraft(draftId: string): Promise<Draft | null> {
  if (!draftIdFromCookie(draftId)) return null;
  const db = await getDb();
  return (await db.collection(DRAFTS).findOne({ draftId })) as unknown as Draft | null;
}

export async function markDraftSubmitted(draftId: string): Promise<void> {
  const db = await getDb();
  await db.collection(DRAFTS).updateOne({ draftId }, { $set: { submittedAt: new Date() } });
}

/**
 * Připojí draft k účtu. Atomické – při opakovaném doručení webhooku uspěje nejvýš jednou
 * a podruhé vrátí už zapsaný účet.
 */
export async function claimDraft(
  draftId: string,
  accountId: string,
  purchase?: { accountCreated: boolean; checkoutSessionId?: string | null }
): Promise<'claimed' | 'already' | 'missing'> {
  const db = await getDb();
  const result = await db
    .collection(DRAFTS)
    .updateOne(
      { draftId, accountId: null },
      {
        $set: {
          accountId,
          // Samotný e-mail z Checkoutu ani starší vazba draftu na účet nejsou důkaz identity.
          autoSignInAccountId: purchase?.accountCreated === true && purchase.checkoutSessionId ? accountId : null,
          claimedCheckoutSessionId: purchase?.checkoutSessionId ?? null,
          expiresAt: null,
          claimedAt: new Date(),
        },
      }
    );
  if (result.modifiedCount === 1) return 'claimed';
  const existing = await getDraft(draftId);
  return existing?.accountId ? 'already' : 'missing';
}

/** Má workspace vlastní obsah? Rozhoduje o tom, jestli se smí nahradit workspacem z draftu. */
export async function workspaceHasContent(tenantId: string | null | undefined): Promise<boolean> {
  if (!tenantId) return false;
  const db = await getDb();
  const [trackers, days] = await Promise.all([
    db.collection(TRACKERS).countDocuments({ tenantId }, { limit: 1 }),
    db.collection(DAYS).countDocuments({ tenantId }, { limit: 1 }),
  ]);
  return trackers > 0 || days > 0;
}

/** Workspace draftu, který se nepoužil (zákazník už účet měl) – ať v databázi nezůstávají odpovědi bez majitele. */
export async function discardDraftWorkspace(draft: Draft): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.collection(QUESTIONNAIRES).deleteMany({ tenantId: draft.tenantId }),
    db.collection(TENANTS).deleteMany({ tenantId: draft.tenantId }),
  ]);
}

/**
 * Úklid propadlých draftů i s obsahem. Volá se nezávazně při zakládání nového draftu,
 * takže projekt nepotřebuje plánovač úloh.
 */
export async function purgeExpiredDrafts(limit = 20): Promise<number> {
  const db = await getDb();
  const expired = (await db
    .collection(DRAFTS)
    .find({ accountId: null, expiresAt: { $lt: new Date() } })
    .limit(limit)
    .toArray()) as unknown as Draft[];

  for (const draft of expired) {
    await Promise.all([
      db.collection(QUESTIONNAIRES).deleteMany({ tenantId: draft.tenantId }),
      db.collection(TRACKERS).deleteMany({ tenantId: draft.tenantId }),
      db.collection(DAYS).deleteMany({ tenantId: draft.tenantId }),
      db.collection(TENANTS).deleteMany({ tenantId: draft.tenantId }),
    ]);
    await db.collection(DRAFTS).deleteOne({ draftId: draft.draftId });
  }
  return expired.length;
}

export function draftCookie(draftId: string, isProd: boolean): string {
  return [
    `${DRAFT_COOKIE}=${draftId}`,
    'Path=/',
    'HttpOnly',
    isProd ? 'Secure' : '',
    'SameSite=Lax',
    `Max-Age=${DRAFT_TTL_DAYS * 24 * 3600}`,
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearDraftCookie(isProd: boolean): string {
  return [`${DRAFT_COOKIE}=`, 'Path=/', 'HttpOnly', isProd ? 'Secure' : '', 'SameSite=Lax', 'Max-Age=0']
    .filter(Boolean)
    .join('; ');
}
