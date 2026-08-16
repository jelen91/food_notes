// Jediné místo, kudy se sahá na data zákazníků.
//
// Dvě pravidla, která tu drží izolaci a soukromí:
//  1) Každý dotaz má v filtru tenantId – funkce ho berou jako první parametr, takže na něj nejde zapomenout.
//  2) Citlivý obsah (záznamy, škály, zdravotní metriky, laborky, PDF) se ukládá jen zašifrovaný
//     datovým klíčem zákazníka. V čistém zůstává jen to, podle čeho se dotazujeme: tenantId a datum.

import { Binary } from 'mongodb';
import { AUDIT, DAYS, LABS, TENANTS, USERS, getDb } from './db';
import { Sealed, decryptBytes, decryptJson, encryptBytes, encryptJson, generateDek, hashToken, unwrapDek, wrapDek } from './crypto';
import { DayData, LabDoc, LabMeta, LabValue, Workout, emptyDay } from './schema';
import type { TrackerDay } from './tracker/entry';

export interface TenantSecrets {
  tenantId: string;
  dek: Buffer;
  healthKeyHash?: string;
}

export interface TenantUser {
  tenantId: string;
  userId: string;
  label?: string;
  role: 'owner' | 'editor' | 'viewer';
  passwordHash?: string;
  failedAttempts?: number;
  lockedUntil?: Date | null;
  lastLoginAt?: Date | null;
}

// Rozbalený DEK držíme jen v paměti instance a jen chvíli – šetří to KMS/CPU,
// ale neudržuje klíče "navěky" v dlouho žijícím procesu.
const dekCache = new Map<string, { dek: Buffer; at: number }>();
const DEK_CACHE_MS = 5 * 60 * 1000;

export async function getTenantSecrets(tenantId: string): Promise<TenantSecrets | null> {
  const cached = dekCache.get(tenantId);
  const db = await getDb();
  const doc = await db.collection(TENANTS).findOne({ tenantId });
  if (!doc?.dekWrapped) return null;
  if (cached && Date.now() - cached.at < DEK_CACHE_MS) {
    return { tenantId, dek: cached.dek, healthKeyHash: doc.healthKeyHash };
  }
  const dek = unwrapDek(doc.dekWrapped as Sealed);
  dekCache.set(tenantId, { dek, at: Date.now() });
  return { tenantId, dek, healthKeyHash: doc.healthKeyHash };
}

/** Založí tajemství zákazníka (datový klíč). Voláno z CLI při zakládání. */
export async function createTenantSecrets(tenantId: string): Promise<void> {
  const db = await getDb();
  const existing = await db.collection(TENANTS).findOne({ tenantId });
  if (existing) throw new Error(`Zákazník ${tenantId} už v DB existuje.`);
  await db.collection(TENANTS).insertOne({
    tenantId,
    dekWrapped: wrapDek(generateDek()),
    createdAt: new Date(),
  });
}

export async function setHealthKey(tenantId: string, key: string): Promise<void> {
  const db = await getDb();
  await db.collection(TENANTS).updateOne({ tenantId }, { $set: { healthKeyHash: hashToken(key) } });
}

/** Najde zákazníka podle klíče z hlavičky x-health-key (hash, ne samotný klíč). */
export async function findTenantByHealthKey(key: string): Promise<string | null> {
  const db = await getDb();
  const doc = await db.collection(TENANTS).findOne({ healthKeyHash: hashToken(key) }, { projection: { tenantId: 1 } });
  return doc?.tenantId ?? null;
}

// ---------- uživatelé ----------

export async function getUser(tenantId: string, userId: string): Promise<TenantUser | null> {
  const db = await getDb();
  return (await db.collection(USERS).findOne({ tenantId, userId })) as unknown as TenantUser | null;
}

export async function listUsers(tenantId: string): Promise<TenantUser[]> {
  const db = await getDb();
  return (await db.collection(USERS).find({ tenantId }).toArray()) as unknown as TenantUser[];
}

export async function upsertUser(user: Omit<TenantUser, 'failedAttempts' | 'lockedUntil' | 'lastLoginAt'>): Promise<void> {
  const db = await getDb();
  const { tenantId, userId, ...rest } = user;
  await db.collection(USERS).updateOne(
    { tenantId, userId },
    { $set: { ...rest, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date(), failedAttempts: 0 } },
    { upsert: true }
  );
}

export async function noteLoginResult(tenantId: string, userId: string, ok: boolean): Promise<void> {
  const db = await getDb();
  if (ok) {
    await db
      .collection(USERS)
      .updateOne({ tenantId, userId }, { $set: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
    return;
  }
  // Po 10 neúspěších zamkneme na 15 minut – brzda na hádání hesla.
  const doc = await db.collection(USERS).findOneAndUpdate(
    { tenantId, userId },
    { $inc: { failedAttempts: 1 } },
    { returnDocument: 'after' }
  );
  const attempts = (doc as any)?.failedAttempts ?? (doc as any)?.value?.failedAttempts ?? 0;
  if (attempts >= 10) {
    await db
      .collection(USERS)
      .updateOne({ tenantId, userId }, { $set: { failedAttempts: 0, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } });
  }
}

export async function audit(tenantId: string, action: string, detail?: Record<string, unknown>): Promise<void> {
  const db = await getDb();
  await db.collection(AUDIT).insertOne({ tenantId, action, detail: detail ?? {}, at: new Date() });
}

// ---------- denní záznamy ----------

interface DayPayload {
  entries?: DayData['entries'];
  scales?: DayData['scales'];
  metrics?: DayData['metrics'];
  health?: DayData['health'];
  healthUnits?: DayData['healthUnits'];
  workouts?: Workout[] | null;
  /** Záznam podle vygenerované definice (samoobslužní zákazníci). */
  tracker?: TrackerDay | null;
}

/** Starší dokumenty mají data v čistém; po prvním uložení se přepíšou šifrovanou verzí. */
function readDay(dek: Buffer, doc: any): DayData {
  if (!doc) return emptyDay();
  const sealed = doc.enc ? decryptJson<DayPayload>(dek, doc.enc, {}) : null;
  const source: DayPayload = sealed ?? doc;
  return {
    entries: (source.entries as DayData['entries']) ?? [],
    scales: source.scales ?? {},
    metrics: source.metrics ?? {},
    health: source.health ?? null,
    healthUnits: source.healthUnits ?? null,
    workouts: source.workouts ?? null,
    tracker: source.tracker ?? null,
  };
}

export async function getDay(tenantId: string, dek: Buffer, date: string): Promise<DayData> {
  const db = await getDb();
  const doc = await db.collection(DAYS).findOne({ tenantId, date });
  return readDay(dek, doc);
}

export async function listDays(
  tenantId: string,
  dek: Buffer,
  range?: { from?: string; to?: string }
): Promise<Array<{ date: string } & DayData>> {
  const db = await getDb();
  const filter: Record<string, unknown> = { tenantId };
  if (range?.from || range?.to) {
    filter.date = { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) };
  }
  const docs = await db.collection(DAYS).find(filter).sort({ date: 1 }).toArray();
  return docs.map((d) => ({ date: d.date, ...readDay(dek, d) }));
}

/**
 * Uloží změněné části dne. Vždycky se čte celý den, sloučí se a zapíše zpátky jako jeden
 * šifrovaný balík – jednotlivá pole uvnitř šifry nejde updatovat.
 */
export async function saveDay(tenantId: string, dek: Buffer, date: string, patch: DayPayload): Promise<DayData> {
  const db = await getDb();
  const current = await getDay(tenantId, dek, date);
  const merged: DayData = {
    entries: patch.entries ?? current.entries,
    scales: patch.scales ?? current.scales,
    metrics: patch.metrics ?? current.metrics,
    health: patch.health !== undefined ? patch.health : current.health,
    healthUnits: patch.healthUnits !== undefined ? patch.healthUnits : current.healthUnits,
    workouts: patch.workouts !== undefined ? patch.workouts : current.workouts,
    tracker: patch.tracker !== undefined ? patch.tracker : current.tracker,
  };
  await db.collection(DAYS).updateOne(
    { tenantId, date },
    {
      $set: { enc: encryptJson(dek, merged), updatedAt: new Date() },
      // Zbytky nešifrovaných polí ze staré verze aplikace.
      $unset: { entries: '', scales: '', health: '', healthUnits: '', workouts: '' },
      $setOnInsert: { tenantId, date, createdAt: new Date() },
    },
    { upsert: true }
  );
  return merged;
}

// ---------- laboratoře ----------

interface LabPayload {
  meta?: LabMeta;
  values?: LabValue[];
  filename?: string | null;
}

function readLab(dek: Buffer, doc: any): LabDoc {
  const sealed = doc.enc ? decryptJson<LabPayload>(dek, doc.enc, {}) : null;
  const source: LabPayload = sealed ?? doc;
  return {
    date: doc.date,
    meta: source.meta ?? {},
    values: source.values ?? [],
    filename: source.filename ?? doc.filename ?? null,
    size: doc.size ?? null,
    uploadedAt: doc.uploadedAt ?? null,
    hasPdf: Boolean(doc.pdf || doc.data),
  };
}

export async function listLabs(tenantId: string, dek: Buffer): Promise<LabDoc[]> {
  const db = await getDb();
  const docs = await db
    .collection(LABS)
    .find({ tenantId }, { projection: { pdf: 0, data: 0 } })
    .sort({ date: -1 })
    .toArray();
  return docs.map((d) => readLab(dek, d));
}

export async function getLab(tenantId: string, dek: Buffer, date: string): Promise<LabDoc | null> {
  const db = await getDb();
  const doc = await db.collection(LABS).findOne({ tenantId, date }, { projection: { pdf: 0, data: 0 } });
  return doc ? readLab(dek, doc) : null;
}

export async function saveLab(
  tenantId: string,
  dek: Buffer,
  date: string,
  data: { meta: LabMeta; values: LabValue[]; pdf?: { filename: string; contentType: string; bytes: Buffer } }
): Promise<void> {
  const db = await getDb();
  const existing = await db.collection(LABS).findOne({ tenantId, date }, { projection: { pdf: 0, data: 0 } });
  const previous = existing ? readLab(dek, existing) : null;
  const filename = data.pdf?.filename ?? previous?.filename ?? null;

  const set: Record<string, unknown> = {
    enc: encryptJson(dek, { meta: data.meta, values: data.values, filename }),
    updatedAt: new Date(),
  };
  if (data.pdf) {
    const sealed = encryptBytes(dek, data.pdf.bytes);
    set.pdf = { v: sealed.v, iv: sealed.iv, ct: new Binary(Buffer.from(sealed.ct, 'base64')) };
    set.size = data.pdf.bytes.length;
    set.contentType = data.pdf.contentType;
    set.uploadedAt = new Date();
  }
  await db.collection(LABS).updateOne(
    { tenantId, date },
    {
      $set: set,
      $unset: { meta: '', values: '', filename: '', data: '' },
      $setOnInsert: { tenantId, date, createdAt: new Date() },
    },
    { upsert: true }
  );
}

export async function getLabPdf(
  tenantId: string,
  dek: Buffer,
  date: string
): Promise<{ bytes: Buffer; filename: string; contentType: string } | null> {
  const db = await getDb();
  const doc = await db.collection(LABS).findOne({ tenantId, date });
  if (!doc) return null;
  const meta = readLab(dek, doc);
  const filename = meta.filename || `lab-${date}.pdf`;
  const contentType = doc.contentType || 'application/pdf';
  if (doc.pdf?.ct) {
    const sealed: Sealed = { v: doc.pdf.v ?? 1, iv: doc.pdf.iv, ct: Buffer.from((doc.pdf.ct as Binary).buffer).toString('base64') };
    return { bytes: decryptBytes(dek, sealed), filename, contentType };
  }
  // Nešifrované PDF z původní verze.
  if (doc.data) return { bytes: Buffer.from((doc.data as Binary).buffer), filename, contentType };
  return null;
}

export async function deleteLab(tenantId: string, date: string): Promise<void> {
  const db = await getDb();
  await db.collection(LABS).deleteOne({ tenantId, date });
}

/** Smaže úplně všechna data zákazníka včetně klíče (data se stanou nečitelnými). */
export async function deleteTenantData(tenantId: string): Promise<{ days: number; labs: number }> {
  const db = await getDb();
  const days = await db.collection(DAYS).deleteMany({ tenantId });
  const labs = await db.collection(LABS).deleteMany({ tenantId });
  await db.collection(USERS).deleteMany({ tenantId });
  await db.collection(TENANTS).deleteOne({ tenantId });
  dekCache.delete(tenantId);
  return { days: days.deletedCount ?? 0, labs: labs.deletedCount ?? 0 };
}
