// Smazání účtu a dat.
//
// Odděluje tři věci, protože mají různý osud:
//  1) obsah deníku (dny, laborky, dotazník, definice trackeru) – maže se hned,
//  2) datový klíč zákazníka – maže se taky, takže případné kopie v zálohách zůstanou nečitelné,
//  3) doklady o platbě – zůstávají, účetnictví je má povinnost uchovávat. Vazba na osobu se
//     omezí na interní ID: e-mail se přepíše, heslo zahodí.
//
// Operace je idempotentní: opakované volání nic dalšího nezmění a nespadne.

import {
  ACCOUNTS,
  AUTH_TOKENS,
  CHECKOUT_SESSIONS,
  DAYS,
  ENTITLEMENTS,
  LABS,
  QUESTIONNAIRES,
  REFUND_REQUESTS,
  TENANTS,
  TRACKERS,
  USERS,
  WITHDRAWAL_REQUESTS,
  getDb,
} from './db';
import { audit } from './store';
import { deleteAnalysisData } from './analysis/store';

export interface DeletionSummary {
  days: number;
  labs: number;
  questionnaires: number;
  trackerVersions: number;
  analyses: number;
  keyDestroyed: boolean;
  billingRecordsKept: number;
}

export async function deleteAccountData(accountId: string): Promise<DeletionSummary> {
  const db = await getDb();
  const account = await db.collection(ACCOUNTS).findOne({ accountId });
  const tenantId: string | null = account?.tenantId ?? null;

  const summary: DeletionSummary = {
    days: 0,
    labs: 0,
    questionnaires: 0,
    trackerVersions: 0,
    analyses: 0,
    keyDestroyed: false,
    billingRecordsKept: 0,
  };

  if (tenantId) {
    summary.analyses = await deleteAnalysisData(accountId, tenantId);
    summary.days = (await db.collection(DAYS).deleteMany({ tenantId })).deletedCount ?? 0;
    summary.labs = (await db.collection(LABS).deleteMany({ tenantId })).deletedCount ?? 0;
    summary.questionnaires = (await db.collection(QUESTIONNAIRES).deleteMany({ tenantId })).deletedCount ?? 0;
    summary.trackerVersions = (await db.collection(TRACKERS).deleteMany({ tenantId })).deletedCount ?? 0;
    await db.collection(USERS).deleteMany({ tenantId });
    // Zahození klíče je poslední krok – po něm už není co dešifrovat.
    const key = await db.collection(TENANTS).deleteOne({ tenantId });
    summary.keyDestroyed = (key.deletedCount ?? 0) > 0;
  }

  await db.collection(AUTH_TOKENS).deleteMany({ accountId });

  // Doklady o platbě zůstávají; vazba na osobu se omezí na interní ID.
  summary.billingRecordsKept =
    (await db.collection(ENTITLEMENTS).countDocuments({ accountId })) +
    (await db.collection(CHECKOUT_SESSIONS).countDocuments({ accountId })) +
    (await db.collection(REFUND_REQUESTS).countDocuments({ accountId })) +
    (await db.collection(WITHDRAWAL_REQUESTS).countDocuments({ accountId }));

  if (account && account.status !== 'deleted') {
    await db.collection(ACCOUNTS).updateOne(
      { accountId },
      {
        $set: {
          email: `smazano+${accountId}@invalid`,
          passwordHash: null,
          status: 'deleted',
          onboarding: 'unpaid',
          tenantId: null,
          slug: null,
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }

  if (tenantId) {
    // Audit drží jen metadata: co a kdy, žádný obsah.
    await audit(tenantId, 'account.deleted', {
      days: summary.days,
      labs: summary.labs,
      trackerVersions: summary.trackerVersions,
    }).catch(() => undefined);
  }

  return summary;
}
