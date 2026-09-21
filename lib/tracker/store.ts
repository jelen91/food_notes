// Uložení dotazníku a vygenerovaných definic. Stejná pravidla jako ve zbytku aplikace:
// každý dotaz filtruje podle tenantId a citlivý obsah je šifrovaný datovým klíčem zákazníka.

import { QUESTIONNAIRES, TRACKERS, getDb } from '../db';
import { decryptJson, encryptJson } from '../crypto';
import { Answers } from '../questionnaire';
import { FailureCategory, GenerationMeta } from './generate';
import { TrackerDefinition } from './schema';
import { QUESTIONNAIRE_CONSENT_TEXT, QUESTIONNAIRE_CONSENT_VERSION, QuestionnaireConsent } from '../consent';

export type GenerationStatus = 'not_started' | 'queued' | 'generating' | 'completed' | 'failed';

export interface QuestionnaireRecord {
  tenantId: string;
  version: number;
  answers: Answers;
  consent: QuestionnaireConsent | null;
  submittedAt: Date | null;
  generationStatus: GenerationStatus;
  generationError: FailureCategory | null;
  retryCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  answersDeletedAt?: Date | null;
}

const EMPTY: Omit<QuestionnaireRecord, 'tenantId'> = {
  version: 0,
  answers: {},
  consent: null,
  submittedAt: null,
  generationStatus: 'not_started',
  generationError: null,
  retryCount: 0,
  startedAt: null,
  completedAt: null,
};

/** Zámek se po této době považuje za opuštěný (spadlá instance uprostřed generování). */
const STALE_LOCK_MS = 10 * 60 * 1000;

function readRecord(dek: Buffer, doc: any, tenantId: string): QuestionnaireRecord {
  if (!doc) return { tenantId, ...EMPTY };
  const payload = decryptJson<{ answers?: Answers; consent?: QuestionnaireConsent }>(dek, doc.enc, {});
  return {
    tenantId,
    version: doc.version ?? 0,
    answers: payload.answers ?? {},
    consent: payload.consent ?? null,
    submittedAt: doc.submittedAt ?? null,
    generationStatus: doc.generationStatus ?? 'not_started',
    generationError: doc.generationError ?? null,
    retryCount: doc.retryCount ?? 0,
    startedAt: doc.startedAt ?? null,
    completedAt: doc.completedAt ?? null,
    answersDeletedAt: doc.answersDeletedAt ?? null,
  };
}

export async function getQuestionnaire(tenantId: string, dek: Buffer): Promise<QuestionnaireRecord> {
  const db = await getDb();
  const doc = await db.collection(QUESTIONNAIRES).findOne({ tenantId });
  return readRecord(dek, doc, tenantId);
}

export async function saveQuestionnaire(
  tenantId: string,
  dek: Buffer,
  input: { version: number; answers: Answers; submitted: boolean; consentVersion: string }
): Promise<void> {
  // Enforce this at the storage boundary too, before any database access. The
  // timestamp and text come from this server, never from client-provided fields.
  if (input.consentVersion !== QUESTIONNAIRE_CONSENT_VERSION) throw new Error('Neplatná verze souhlasu.');
  const now = new Date();
  const consent: QuestionnaireConsent = {
    version: QUESTIONNAIRE_CONSENT_VERSION,
    text: QUESTIONNAIRE_CONSENT_TEXT,
    acceptedAt: now.toISOString(),
  };
  const db = await getDb();
  const set: Record<string, unknown> = {
    version: input.version,
    // Consent and its corresponding answers form one atomic encrypted revision.
    // Existing questionnaire/account deletion removes the entire payload together.
    enc: encryptJson(dek, { answers: input.answers, consent }),
    updatedAt: now,
  };
  if (input.submitted) set.submittedAt = now;
  await db.collection(QUESTIONNAIRES).updateOne(
    { tenantId },
    { $set: set, $setOnInsert: { tenantId, generationStatus: 'not_started', retryCount: 0, createdAt: new Date() } },
    { upsert: true }
  );
}

export type ClaimResult = 'claimed' | 'busy' | 'not_submitted';

/**
 * Atomicky si vyhradí generování. Druhé souběžné volání dostane 'busy', takže
 * z jednoho odeslaného dotazníku nikdy nevzniknou dva trackery.
 */
export async function claimGeneration(tenantId: string): Promise<ClaimResult> {
  const db = await getDb();
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const result = await db.collection(QUESTIONNAIRES).updateOne(
    {
      tenantId,
      submittedAt: { $ne: null },
      $or: [
        { generationStatus: { $in: ['not_started', 'failed', 'completed'] } },
        // Zaseknuté generování po pádu instance jde po čase převzít.
        { generationStatus: { $in: ['queued', 'generating'] }, startedAt: { $lt: staleBefore } },
      ],
    },
    { $set: { generationStatus: 'generating', generationError: null, startedAt: new Date() } }
  );
  if (result.modifiedCount === 1) return 'claimed';

  const doc = await db.collection(QUESTIONNAIRES).findOne({ tenantId }, { projection: { submittedAt: 1 } });
  return doc?.submittedAt ? 'busy' : 'not_submitted';
}

export async function failGeneration(tenantId: string, category: FailureCategory): Promise<void> {
  const db = await getDb();
  await db.collection(QUESTIONNAIRES).updateOne(
    { tenantId },
    { $set: { generationStatus: 'failed', generationError: category, completedAt: new Date() }, $inc: { retryCount: 1 } }
  );
}

export interface StoredTracker {
  version: number;
  definition: TrackerDefinition;
  model: string;
  promptVersion: number;
  schemaVersion: number;
  createdAt: Date;
}

/**
 * Uloží novou verzi definice a přepne ji na aktivní. Předchozí verze zůstávají – staré
 * záznamy tak zůstanou interpretovatelné a je kam se vrátit.
 */
export async function saveTrackerDefinition(
  tenantId: string,
  dek: Buffer,
  definition: TrackerDefinition,
  meta: GenerationMeta
): Promise<number> {
  const db = await getDb();
  const last = await db
    .collection(TRACKERS)
    .find({ tenantId })
    .sort({ version: -1 })
    .limit(1)
    .toArray();
  const version = (last[0]?.version ?? 0) + 1;

  // Nejdřív zrušíme aktivní příznak, ať částečný unikátní index nikdy nekoliduje.
  await db.collection(TRACKERS).updateMany({ tenantId, active: true }, { $unset: { active: '' } });
  await db.collection(TRACKERS).insertOne({
    tenantId,
    version,
    active: true,
    enc: encryptJson(dek, { definition }),
    model: meta.model,
    promptVersion: meta.promptVersion,
    schemaVersion: meta.schemaVersion,
    durationMs: meta.durationMs,
    createdAt: new Date(),
  });

  await db.collection(QUESTIONNAIRES).updateOne(
    { tenantId },
    { $set: { generationStatus: 'completed', generationError: null, completedAt: new Date() } }
  );
  return version;
}

export async function getActiveTracker(tenantId: string, dek: Buffer): Promise<StoredTracker | null> {
  const db = await getDb();
  const doc = await db.collection(TRACKERS).findOne({ tenantId, active: true });
  if (!doc) return null;
  const payload = decryptJson<{ definition?: TrackerDefinition }>(dek, doc.enc, {});
  if (!payload.definition) return null;
  return {
    version: doc.version,
    definition: payload.definition,
    model: doc.model,
    promptVersion: doc.promptVersion,
    schemaVersion: doc.schemaVersion,
    createdAt: doc.createdAt,
  };
}

/** Konkrétní verze definice – kvůli dnům, které vznikly podle starší podoby deníku. */
export async function getTrackerByVersion(tenantId: string, dek: Buffer, version: number): Promise<StoredTracker | null> {
  const db = await getDb();
  const doc = await db.collection(TRACKERS).findOne({ tenantId, version });
  if (!doc) return null;
  const payload = decryptJson<{ definition?: TrackerDefinition }>(dek, doc.enc, {});
  if (!payload.definition) return null;
  return {
    version: doc.version,
    definition: payload.definition,
    model: doc.model,
    promptVersion: doc.promptVersion,
    schemaVersion: doc.schemaVersion,
    createdAt: doc.createdAt,
  };
}

/** Metadata všech verzí bez obsahu – pro přehled a případný rollback. */
export async function listTrackerVersions(tenantId: string) {
  const db = await getDb();
  const docs = await db
    .collection(TRACKERS)
    .find({ tenantId }, { projection: { enc: 0 } })
    .sort({ version: -1 })
    .toArray();
  return docs.map((d) => ({
    version: d.version,
    active: Boolean(d.active),
    model: d.model,
    promptVersion: d.promptVersion,
    schemaVersion: d.schemaVersion,
    createdAt: d.createdAt,
  }));
}

/**
 * Retence: po úspěšném vygenerování už syrové odpovědi nejsou provozně potřeba.
 * Volá se podle nastavené lhůty; smazání je idempotentní.
 */
export async function deleteQuestionnaireAnswers(tenantId: string, dek: Buffer): Promise<void> {
  const db = await getDb();
  await db.collection(QUESTIONNAIRES).updateOne(
    { tenantId },
    { $set: { enc: encryptJson(dek, { answers: {} }), answersDeletedAt: new Date() } }
  );
}
