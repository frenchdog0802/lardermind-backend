import { describe, expect, it } from 'vitest';
import { assertGoogleIdTokenShape } from './google-id-token';

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
