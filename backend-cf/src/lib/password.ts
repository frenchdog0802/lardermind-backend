/**
 * Password hashes.
 *
 * Legacy (Nest / early Workers): HMAC-SHA1 hex, key = salt, message = password.
 * Current: `pbkdf2-sha256$<iterations>$<saltHex>$<hashHex>` (WebCrypto PBKDF2).
 */

/** OWASP-scale work factor trimmed for Workers CPU. Still orders of magnitude slower than HMAC-SHA1. */
export const PBKDF2_ITERATIONS = 100_000;

const PREFIX = 'pbkdf2-sha256';
const PBKDF2_HASH_BITS = 256;

export type PasswordCheck = {
  ok: boolean;
  needsRehash: boolean;
};

export function makeSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToHex(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Constant-time string compare. Length is mixed in; the loop always runs to the longer input. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(aa.length, bb.length, 1);
  let diff = aa.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

async function hmacSha1Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/** Legacy HMAC-SHA1. Used only to verify rows that have not been rehashed. */
export async function encryptPassword(
  password: string,
  salt: string,
): Promise<string> {
  if (!password || !salt) return '';
  return hmacSha1Hex(salt, password);
}

async function pbkdf2Hex(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    PBKDF2_HASH_BITS,
  );
  return bytesToHex(new Uint8Array(bits));
}

export function isVersionedPasswordHash(stored: string): boolean {
  return stored.startsWith(`${PREFIX}$`);
}

export async function hashPassword(
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2Hex(password, salt, iterations);
  return `${PREFIX}$${iterations}$${bytesToHex(salt)}$${hash}`;
}

export async function verifyPassword(
  plain: string,
  stored: string | null | undefined,
  legacySalt: string | null | undefined,
  options?: { targetIterations?: number },
): Promise<PasswordCheck> {
  const target = options?.targetIterations ?? PBKDF2_ITERATIONS;
  if (!plain || !stored) return { ok: false, needsRehash: false };

  if (isVersionedPasswordHash(stored)) {
    const parts = stored.split('$');
    if (parts.length !== 4) return { ok: false, needsRehash: false };
    const iterations = Number(parts[1]);
    const salt = hexToBytes(parts[2] ?? '');
    const expected = (parts[3] ?? '').toLowerCase();
    if (!Number.isInteger(iterations) || iterations < 1 || !salt || !expected) {
      return { ok: false, needsRehash: false };
    }
    const actual = await pbkdf2Hex(plain, salt, iterations);
    const ok = timingSafeEqual(actual, expected);
    return { ok, needsRehash: ok && iterations < target };
  }

  if (!legacySalt) return { ok: false, needsRehash: false };
  const actual = await encryptPassword(plain, legacySalt);
  const ok = timingSafeEqual(actual, stored.toLowerCase());
  return { ok, needsRehash: ok };
}

/** @deprecated Prefer verifyPassword. Kept so older call sites keep a boolean check. */
export async function authenticate(
  plainPassword: string,
  salt: string,
  hashedPassword: string,
): Promise<boolean> {
  const result = await verifyPassword(plainPassword, hashedPassword, salt);
  return result.ok;
}
