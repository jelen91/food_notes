// Edge-runtime kompatibilní HMAC podpis sezónního tokenu. Žádný session storage –
// cookie nese expiraci + podpis, server jen ověří. Vhodné pro single-user app.

const enc = new TextEncoder();

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  let p = s.replace(/-/g, '+').replace(/_/g, '/');
  while (p.length % 4) p += '=';
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// "<expiryUnix>.<base64urlSig>"
export async function signToken(secret: string, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(exp)));
  return `${exp}.${toBase64Url(sig)}`;
}

export async function verifyToken(secret: string, token: string | undefined | null): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const expStr = token.slice(0, dot);
  const sigStr = token.slice(dot + 1);
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  try {
    const key = await getKey(secret);
    const sig = fromBase64Url(sigStr);
    // Kopie do čistého ArrayBuffer kvůli přísnému typu BufferSource v některých verzích TS.
    const sigBuf = sig.buffer.slice(sig.byteOffset, sig.byteOffset + sig.byteLength) as ArrayBuffer;
    return await crypto.subtle.verify('HMAC', key, sigBuf, enc.encode(expStr));
  } catch {
    return false;
  }
}

export const AUTH_COOKIE = 'fn_auth';
export const AUTH_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 dní
