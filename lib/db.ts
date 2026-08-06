import { MongoClient, Db } from 'mongodb';

// Jeden sdílený klient pro všechny API routy. V serverless (Vercel) se modul mezi
// invokacemi recykluje, takže connection promise cachujeme na globálním objektu.
const uri = process.env.MONGODB_URI;
const DB_NAME = 'food_notes'; // ponecháno kvůli existujícím datům

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

export function hasDb(): boolean {
  return Boolean(uri);
}

export async function getDb(): Promise<Db> {
  if (!uri) throw new Error('Missing MONGODB_URI');
  if (!global.__mongoClientPromise) {
    global.__mongoClientPromise = new MongoClient(uri).connect();
  }
  const client = await global.__mongoClientPromise;
  return client.db(DB_NAME);
}

/** Denní dokument: události, denní škály a metriky z Apple Health. */
export const DAYS = 'daily_notes';
/** Laboratorní odběry: metadata, naměřené hodnoty a volitelné PDF. */
export const LABS = 'blood_tests';
