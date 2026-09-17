import { SignJWT, jwtVerify } from 'jose';

export type JwtPayload = {
  user_id: string;
  iat: number;
  exp?: number;
};

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signJwt(
  userId: string,
  secret: string,
  expiresInSeconds: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ user_id: userId, iat: now })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(secretKey(secret));
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    algorithms: ['HS256'],
  });
  const userId = payload.user_id;
  if (typeof userId !== 'string' || !userId) {
    throw new Error('Invalid token');
  }
  return { userId };
}
