import { describe, expect, it } from 'vitest';
import {
  assertGoogleIdTokenShape,
  googleAudiences,
  verifyGoogleIdToken,
} from './google-id-token';
import { makeIdTokenIssuer } from '../test-utils/id-token-fixtures';

describe('assertGoogleIdTokenShape', () => {
  it('accepts three non-empty segments', () => {
    expect(() => assertGoogleIdTokenShape('a.b.c')).not.toThrow();
  });

  it('rejects empty / non-JWT shapes without network', () => {
    expect(() => assertGoogleIdTokenShape('')).toThrow(/Missing|Invalid/);
    expect(() => assertGoogleIdTokenShape('not-a-jwt')).toThrow(/Invalid/);
    expect(() => assertGoogleIdTokenShape('a.b')).toThrow(/Invalid/);
    expect(() => assertGoogleIdTokenShape('a..c')).toThrow(/Invalid/);
  });
});

describe('googleAudiences', () => {
  it('merges web + iOS ids, splitting comma lists and dropping blanks', () => {
    expect(googleAudiences({ GOOGLE_CLIENT_ID: 'web', GOOGLE_IOS_CLIENT_ID: ' ios1, ios2 ,' })).toEqual([
      'web',
      'ios1',
      'ios2',
    ]);
    expect(googleAudiences({ GOOGLE_CLIENT_ID: 'web' })).toEqual(['web']);
    expect(googleAudiences({})).toEqual([]);
  });
});

describe('verifyGoogleIdToken', () => {
  const claims = { sub: 'g1', email: 'a@x.com', email_verified: true, given_name: 'A' };

  it('accepts the web and the iOS audience, rejects others / bad issuer / expired', async () => {
    const { keys, sign } = await makeIdTokenIssuer();
    const auds = ['web-id', 'ios-id'];
    for (const aud of auds) {
      const t = await sign(claims, { iss: 'https://accounts.google.com', aud });
      await expect(verifyGoogleIdToken(t, auds, keys)).resolves.toMatchObject({ sub: 'g1' });
    }
    const t2 = await sign(claims, { iss: 'accounts.google.com', aud: 'web-id' });
    await expect(verifyGoogleIdToken(t2, auds, keys)).resolves.toMatchObject({ email: 'a@x.com' });

    const rejects = [
      await sign(claims, { iss: 'https://accounts.google.com', aud: 'other' }),
      await sign(claims, { iss: 'https://evil.example.com', aud: 'web-id' }),
      await sign(claims, { iss: 'https://accounts.google.com', aud: 'web-id', expSeconds: -60 }),
      await sign({ ...claims, email_verified: false }, { iss: 'https://accounts.google.com', aud: 'web-id' }),
    ];
    for (const t of rejects) await expect(verifyGoogleIdToken(t, auds, keys)).rejects.toThrow();
  });

  it('fails when no audience is configured', async () => {
    await expect(verifyGoogleIdToken('a.b.c', [])).rejects.toThrow(/not configured/);
  });
});
