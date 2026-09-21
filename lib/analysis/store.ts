import { randomUUID } from 'crypto';
import { JOURNAL_ANALYSES, getDb } from '../db';
import { encryptJson, decryptJson, type Sealed } from '../crypto';
import { ANALYSIS_CONSENT_VERSION, ANALYSIS_CONSENT_TEXT, type AnalysisConsent } from './consent';
import type { AnalysisReport, AnalysisCoverage } from './types';
import type { AnalysisFailure, AnalysisMeta } from './generate';

// Longer than provider timeout and the route execution limit. An abandoned job
// becomes reclaimable; only its current request ID may finish the reservation.
export const ANALYSIS_LEASE_MS = 6 * 60 * 1000;
interface AnalysisPayload { consent: AnalysisConsent; coverage: AnalysisCoverage; report?: AnalysisReport }
interface AnalysisDoc {
  _id: string; accountId: string; tenantId: string; status: 'generating' | 'completed' | 'failed';
  requestId: string; leaseUntil: Date; startedAt: Date; completedAt?: Date; updatedAt: Date;
  enc: Sealed; failure?: AnalysisFailure; meta?: AnalysisMeta;
}
interface DeletedAnalysisDoc {
  _id: string; accountId: string; tenantId: string; status: 'deleted'; deletedAt: Date;
}
type AnalysisDocument = AnalysisDoc | DeletedAnalysisDoc;
export interface StoredAnalysis {
  status: AnalysisDoc['status']; requestId: string; leaseUntil: Date; completedAt?: Date;
  failure?: AnalysisFailure; payload: AnalysisPayload;
}

export async function getAnalysis(accountId: string, tenantId: string, dek: Buffer): Promise<StoredAnalysis | null> {
  const db = await getDb();
  const doc = await db.collection<AnalysisDocument>(JOURNAL_ANALYSES).findOne({ _id: accountId, tenantId });
  if (!doc || doc.status === 'deleted') return null;
  const payload = decryptJson<AnalysisPayload | null>(dek, doc.enc, null);
  // Never interpret corrupt ciphertext as an unused entitlement.
  if (!payload?.consent || !payload.coverage || (doc.status === 'completed' && !payload.report)) throw new Error('analysis_unreadable');
  return { status: doc.status, requestId: doc.requestId, leaseUntil: doc.leaseUntil, completedAt: doc.completedAt, failure: doc.failure, payload };
}

export async function claimAnalysis(
  accountId: string, tenantId: string, dek: Buffer, consent: AnalysisConsent, coverage: AnalysisCoverage, now: Date
): Promise<string | null> {
  if (consent.version !== ANALYSIS_CONSENT_VERSION || consent.text !== ANALYSIS_CONSENT_TEXT) throw new Error('invalid_analysis_consent');
  const db = await getDb();
  const collection = db.collection<AnalysisDocument>(JOURNAL_ANALYSES);
  const requestId = randomUUID();
  const state = {
    status: 'generating' as const, requestId, leaseUntil: new Date(now.getTime() + ANALYSIS_LEASE_MS),
    startedAt: now, updatedAt: now, enc: encryptJson(dek, { consent, coverage }),
  };
  try {
    // Mongo's mandatory unique _id index is enough even before ensureIndexes runs.
    await collection.insertOne({ _id: accountId, accountId, tenantId, ...state });
    return requestId;
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
  }
  const result = await collection.updateOne({
    _id: accountId, tenantId,
    $or: [{ status: 'failed' }, { status: 'generating', leaseUntil: { $lte: now } }],
  }, { $set: state, $unset: { failure: '', completedAt: '', meta: '' } });
  return result.modifiedCount === 1 ? requestId : null;
}

export async function completeAnalysis(
  accountId: string, tenantId: string, dek: Buffer, requestId: string,
  payload: AnalysisPayload & { report: AnalysisReport }, meta: AnalysisMeta, now: Date
): Promise<boolean> {
  const db = await getDb();
  const result = await db.collection<AnalysisDoc>(JOURNAL_ANALYSES).updateOne({
    _id: accountId, tenantId, requestId, status: 'generating', leaseUntil: { $gt: now },
  }, {
    $set: { status: 'completed', enc: encryptJson(dek, payload), meta, completedAt: now, updatedAt: now },
    $unset: { failure: '' },
  });
  // No upsert: deletion and stale workers cannot recreate/overwrite a report.
  return result.modifiedCount === 1;
}

export async function failAnalysis(accountId: string, tenantId: string, requestId: string, failure: AnalysisFailure, now: Date): Promise<void> {
  const db = await getDb();
  await db.collection<AnalysisDoc>(JOURNAL_ANALYSES).updateOne({
    _id: accountId, tenantId, requestId, status: 'generating', leaseUntil: { $gt: now },
  }, { $set: { status: 'failed', failure, updatedAt: now } });
}

/**
 * Destroy all content and consent, retaining only an account deletion marker.
 * Removing the row outright would allow a request authorized before deletion to
 * insert its delayed claim afterwards and resurrect health data. The tombstone
 * reserves the mandatory unique _id forever; claim's allowlist cannot take it.
 */
export async function deleteAnalysisData(accountId: string, tenantId: string): Promise<number> {
  const db = await getDb();
  const collection = db.collection<AnalysisDocument>(JOURNAL_ANALYSES);
  const previous = await collection.findOne({ _id: accountId }, { projection: { status: 1 } });
  const tombstone: DeletedAnalysisDoc = { _id: accountId, accountId, tenantId, status: 'deleted', deletedAt: new Date() };
  try {
    await collection.replaceOne({ _id: accountId }, tombstone, { upsert: true });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    // A delayed first claim won an insert race. Its row now exists and is
    // atomically replaced; no insertion can win once this marker is present.
    await collection.replaceOne({ _id: accountId }, tombstone);
  }
  return previous && previous.status !== 'deleted' ? 1 : 0;
}
