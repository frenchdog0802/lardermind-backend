// Test-only: sign OIDC-style ID tokens with a throwaway key and a local key resolver.
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose';

export async function makeIdTokenIssuer() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const keys: JWTVerifyGetKey = async () => publicKey;
  async function sign(
    claims: Record<string, unknown>,
    opts: { iss: string; aud: string; expSeconds?: number; wrongKey?: boolean },
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(opts.iss)
      .setAudience(opts.aud)
      .setIssuedAt()
      .setExpirationTime(
        opts.expSeconds !== undefined
          ? Math.floor(Date.now() / 1000) + opts.expSeconds
          : '10m',
      )
      .sign(opts.wrongKey ? other.privateKey : privateKey);
  }
  return { keys, sign };
}
