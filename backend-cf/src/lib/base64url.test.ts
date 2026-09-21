import { describe, expect, it } from 'vitest';
import { encodeBase64UrlJson } from './base64url';

describe('encodeBase64UrlJson', () => {
  it('encodes ASCII JSON without padding', () => {
    const encoded = encodeBase64UrlJson({ token: 'abc', user: { id: '1' } });
    expect(encoded).not.toMatch(/[+/=]/);
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64);
    expect(JSON.parse(json)).toEqual({ token: 'abc', user: { id: '1' } });
  });

  it('round-trips non-ASCII names (UTF-8)', () => {
    const value = { token: 't', user: { name: '王小明', first_name: '小明' } };
    const encoded = encodeBase64UrlJson(value);
    const padded = encoded + '='.repeat((4 - (encoded.length % 4)) % 4);
    const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder('utf-8').decode(bytes);
    expect(JSON.parse(json)).toEqual(value);
  });
});
