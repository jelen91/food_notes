// Envelope šifrování zdravotních dat.
//
// Master klíč (MASTER_KEY v env) nikdy nešifruje data přímo – šifruje jen datové klíče (DEK).
// Každý zákazník má vlastní DEK, uložený v DB zabalený master klíčem. Únik dumpu databáze
// tedy sám o sobě data neodhalí a smazáním DEK jdou data zákazníka nevratně znečitelnit
// (crypto-shredding), aniž bychom museli procházet všechny kolekce.
//
// Běží jen v Node runtime (API routy, skripty) – ne v Edge middleware, ten data nečte.

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHash } from 'crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;

/** Zašifrovaný balík: verze klíče, IV a ciphertext s auth tagem. */
export interface Sealed {
  v: number;
  iv: string;
  ct: string;
}

let masterKeyCache: Buffer | null = null;

/** Master klíč z env. Očekává 32 bajtů v base64 (`openssl rand -base64 32`). */
export function getMasterKey(): Buffer {
  if (masterKeyCache) return masterKeyCache;
  const raw = process.env.MASTER_KEY;
  if (!raw) throw new Error('Chybí MASTER_KEY (32 bajtů v base64).');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LEN) {
    throw new Error(`MASTER_KEY musí mít po dekódování 32 bajtů, má ${key.length}.`);
  }
  masterKeyCache = key;
  return key;
}

function seal(key: Buffer, plain: Buffer, version = 1): Sealed {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  return { v: version, iv: iv.toString('base64'), ct: ct.toString('base64') };
}

function open(key: Buffer, sealed: Sealed): Buffer {
  const iv = Buffer.from(sealed.iv, 'base64');
  const raw = Buffer.from(sealed.ct, 'base64');
  const tag = raw.subarray(raw.length - 16);
  const body = raw.subarray(0, raw.length - 16);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function generateDek(): Buffer {
  return randomBytes(KEY_LEN);
}

/** DEK zabalený master klíčem – v této podobě leží v DB. */
export function wrapDek(dek: Buffer): Sealed {
  return seal(getMasterKey(), dek);
}

export function unwrapDek(wrapped: Sealed): Buffer {
  return open(getMasterKey(), wrapped);
}

export function encryptJson(dek: Buffer, value: unknown): Sealed {
  return seal(dek, Buffer.from(JSON.stringify(value ?? null), 'utf8'));
}

export function decryptJson<T>(dek: Buffer, sealed: Sealed | null | undefined, fallback: T): T {
  if (!sealed?.ct) return fallback;
  try {
    return JSON.parse(open(dek, sealed).toString('utf8')) as T;
  } catch (err) {
    // Nečitelný záznam nesmí shodit celou stránku – radši prázdno a hlášku v logu.
    console.error('Nepodařilo se dešifrovat záznam:', (err as Error).message);
    return fallback;
  }
}

export function encryptBytes(dek: Buffer, data: Buffer): Sealed {
  return seal(dek, data);
}

export function decryptBytes(dek: Buffer, sealed: Sealed): Buffer {
  return open(dek, sealed);
}

/** Otisk bearer tokenu (klíč pro Health Auto Export) – v DB držíme jen hash. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Náhodný token pro URL slug nebo API klíč (bez zaměnitelných znaků). */
export function randomToken(length = 12): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
