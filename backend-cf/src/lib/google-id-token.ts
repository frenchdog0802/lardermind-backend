import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type GoogleIdTokenProfile = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

/** Reject obvious non-JWTs before hitting Google JWKS. */
export function assertGoogleIdTokenShape(idToken: string): void {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing Google ID token');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new Error('Invalid Google ID token');
  }
}

function isEmailVerified(value: unknown): boolean {
  return value === true || value === 'true';
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<GoogleIdTokenProfile> {
  assertGoogleIdTokenShape(idToken);
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID not configured');
  }

  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    audience: clientId,
    issuer: GOOGLE_ISSUERS,
  });

  const sub = payload.sub;
  const email = payload.email;
  if (typeof sub !== 'string' || !sub) {
    throw new Error('Invalid Google ID token');
  }
  if (typeof email !== 'string' || !email) {
    throw new Error('Google account email is required');
  }
  if (!isEmailVerified(payload.email_verified)) {
    throw new Error('Google email is not verified');
  }

  return {
    sub,
    email,
    email_verified: true,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    given_name: typeof payload.given_name === 'string' ? payload.given_name : undefined,
    family_name: typeof payload.family_name === 'string' ? payload.family_name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}
