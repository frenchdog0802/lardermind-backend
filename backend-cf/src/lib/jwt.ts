import { SignJWT, jwtVerify } from 'jose';

export type JwtPayload = {
  user_id: string;
  guest?: boolean;
  iat: number;
  exp?: number;
};

export type SignJwtOptions = {
  guest?: boolean;
};

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signJwt(
  userId: string,
  secret: string,
  expiresInSeconds: number,
  options: SignJwtOptions = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { user_id: userId, iat: now };
  if (options.guest) {
    claims.guest = true;
  }
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(secretKey(secret));
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<{ userId: string; isGuest: boolean }> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    algorithms: ['HS256'],
  });
  const userId = payload.user_id;
  if (typeof userId !== 'string' || !userId) {
    throw new Error('Invalid token');
  }
  return { userId, isGuest: payload.guest === true };
}
