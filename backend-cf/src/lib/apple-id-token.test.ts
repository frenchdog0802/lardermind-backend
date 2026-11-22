import { describe, expect, it } from 'vitest';
import { verifyAppleIdentityToken, APPLE_ISSUER } from './apple-id-token';
import { makeIdTokenIssuer } from '../test-utils/id-token-fixtures';

const BUNDLE = 'com.lardermind.app';

describe('verifyAppleIdentityToken', () => {
  it('accepts a valid token and returns sub/email flags', async () => {
    const { keys, sign } = await makeIdTokenIssuer();
    const t = await sign(
      { sub: 'apple-1', email: 'x@privaterelay.appleid.com', email_verified: 'true', is_private_email: 'true' },
      { iss: APPLE_ISSUER, aud: BUNDLE },
    );
    await expect(verifyAppleIdentityToken(t, BUNDLE, keys)).resolves.toEqual({
      sub: 'apple-1',
      email: 'x@privaterelay.appleid.com',
      email_verified: true,
      is_private_email: true,
    });
  });

  it('allows a token without email', async () => {
    const { keys, sign } = await makeIdTokenIssuer();
    const t = await sign({ sub: 'apple-2' }, { iss: APPLE_ISSUER, aud: BUNDLE });
    const p = await verifyAppleIdentityToken(t, BUNDLE, keys);
    expect(p.email).toBeUndefined();
    expect(p.email_verified).toBe(false);
  });

  it('rejects wrong audience, issuer, expiry, signature and malformed input', async () => {
    const { keys, sign } = await makeIdTokenIssuer();
    const bad = [
      await sign({ sub: 'a' }, { iss: APPLE_ISSUER, aud: 'com.other.app' }),
      await sign({ sub: 'a' }, { iss: 'https://evil.example.com', aud: BUNDLE }),
      await sign({ sub: 'a' }, { iss: APPLE_ISSUER, aud: BUNDLE, expSeconds: -60 }),
      await sign({ sub: 'a' }, { iss: APPLE_ISSUER, aud: BUNDLE, wrongKey: true }),
      await sign({}, { iss: APPLE_ISSUER, aud: BUNDLE }),
      'not-a-jwt',
    ];
    for (const t of bad) {
      await expect(verifyAppleIdentityToken(t, BUNDLE, keys)).rejects.toThrow();
    }
  });
});
