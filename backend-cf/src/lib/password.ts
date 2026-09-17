/** Matches Nest backend-node auth/password.util.ts (HMAC-SHA1 with salt key). */

export function makeSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
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
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function encryptPassword(
  password: string,
  salt: string,
): Promise<string> {
  if (!password || !salt) return '';
  return hmacSha1Hex(salt, password);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function authenticate(
  plainPassword: string,
  salt: string,
  hashedPassword: string,
): Promise<boolean> {
  if (!plainPassword || !salt || !hashedPassword) return false;
  const candidate = await encryptPassword(plainPassword, salt);
  return timingSafeEqual(candidate, hashedPassword);
}
