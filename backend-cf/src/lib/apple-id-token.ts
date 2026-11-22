import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export const APPLE_ISSUER = 'https://appleid.apple.com';

export type AppleIdTokenProfile = {
  /** Stable, per-app Apple user id. */
  sub: string;
  email?: string;
  email_verified: boolean;
  is_private_email: boolean;
};

function asBool(value: unknown): boolean {
  return value === true || value === 'true';
}

/**
 * Verify a Sign in with Apple identity token: signature (Apple JWKS), iss, aud (= iOS bundle id), exp.
 * `keys` is injectable for tests.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  bundleId: string,
  keys: JWTVerifyGetKey = APPLE_JWKS,
): Promise<AppleIdTokenProfile> {
  const parts = (identityToken ?? '').split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new Error('Invalid Apple identity token');
  }
  if (!bundleId) throw new Error('APPLE_BUNDLE_ID not configured');

  const { payload } = await jwtVerify(identityToken, keys, {
    issuer: APPLE_ISSUER,
    audience: bundleId,
  });
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Invalid Apple identity token');
  }
  const email =
    typeof payload.email === 'string' && payload.email.trim() ? payload.email.trim() : undefined;
  return {
    sub: payload.sub,
    email,
    email_verified: asBool(payload.email_verified),
    is_private_email: asBool(payload.is_private_email),
  };
}
