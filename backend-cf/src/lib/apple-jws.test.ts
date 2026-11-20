import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { APPLE_ROOT_CA_G3_B64, AppleJwsError, verifyAppleJws } from './apple-jws';
import { makeCert, makeChain, signJws, OID_LEAF } from '../test-utils/apple-fixtures';

const payload = { hello: 'world', signedDate: Date.now() };

function opts(chain: ReturnType<typeof makeChain>) {
  return { rootCertsDer: [chain.root.der] };
}

describe('pinned Apple Root CA - G3', () => {
  it('matches the published SHA-256 fingerprint', async () => {
    const der = Uint8Array.from(Buffer.from(APPLE_ROOT_CA_G3_B64, 'base64'));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', der));
    const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179');
  });

  it('rejects a chain that does not terminate in the real Apple root', async () => {
    const chain = makeChain();
    await expect(verifyAppleJws(signJws(payload, chain))).rejects.toThrow(AppleJwsError);
    await expect(verifyAppleJws(signJws(payload, chain, { includeRoot: true }))).rejects.toThrow(
      /pinned Apple root/,
    );
  });
});

describe('verifyAppleJws', () => {
  it('accepts a valid chain (2 certs, root pinned)', async () => {
    const chain = makeChain();
    expect(await verifyAppleJws(signJws(payload, chain), opts(chain))).toMatchObject({
      hello: 'world',
    });
  });

  it('accepts a valid chain that includes the root (3 certs)', async () => {
    const chain = makeChain();
    const out = await verifyAppleJws(signJws(payload, chain, { includeRoot: true }), opts(chain));
    expect(out).toMatchObject({ hello: 'world' });
  });

  it('rejects a tampered payload', async () => {
    const chain = makeChain();
    const jws = signJws(payload, chain);
    const [h, , s] = jws.split('.');
    const forged = Buffer.from(JSON.stringify({ hello: 'evil' })).toString('base64url');
    await expect(verifyAppleJws(`${h}.${forged}.${s}`, opts(chain))).rejects.toThrow(
      /signature invalid/,
    );
  });

  it('rejects a JWS signed by a key that is not the leaf key', async () => {
    const chain = makeChain();
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    await expect(
      verifyAppleJws(signJws(payload, chain, { signer: privateKey }), opts(chain)),
    ).rejects.toThrow(/signature invalid/);
  });

  it('rejects a leaf issued by a different intermediate', async () => {
    const a = makeChain();
    const b = makeChain();
    // x5c = a.leaf + b.intermediate under a's root
    const mixed = { ...a, intermediate: b.intermediate };
    await expect(verifyAppleJws(signJws(payload, mixed), opts(a))).rejects.toThrow();
  });

  it('rejects an intermediate not issued by the pinned root', async () => {
    const a = makeChain();
    const b = makeChain();
    await expect(verifyAppleJws(signJws(payload, a), { rootCertsDer: [b.root.der] })).rejects.toThrow(
      /not issued by the pinned/,
    );
  });

  it('rejects certificates that are expired at signing time', async () => {
    const chain = makeChain({ leafNotAfter: Date.now() - 60_000 });
    await expect(verifyAppleJws(signJws(payload, chain), opts(chain))).rejects.toThrow(
      /not valid at signing time/,
    );
  });

  it('accepts a now-expired leaf when the payload was signed while it was valid', async () => {
    const day = 86400_000;
    const root = makeCert({ subjectCn: 'R', curve: 'P-384', notBefore: Date.now() - 400 * day });
    const intermediate = makeCert({
      subjectCn: 'I',
      curve: 'P-384',
      issuer: root,
      markerOid: '1.2.840.113635.100.6.2.1',
      notBefore: Date.now() - 400 * day,
    });
    const leaf = makeCert({
      subjectCn: 'L',
      curve: 'P-256',
      issuer: intermediate,
      markerOid: OID_LEAF,
      notBefore: Date.now() - 400 * day,
      notAfter: Date.now() - 10 * day,
    });
    const chain = { root, intermediate, leaf };
    const signedDate = Date.now() - 100 * day;
    const out = await verifyAppleJws(signJws({ signedDate, a: 1 }, chain), opts(chain));
    expect(out).toMatchObject({ a: 1 });
  });

  it('rejects a leaf without the Apple receipt-signing OID', async () => {
    const chain = makeChain({ leafMarker: null });
    await expect(verifyAppleJws(signJws(payload, chain), opts(chain))).rejects.toThrow(
      /receipt-signing OID/,
    );
  });

  it('rejects wrong algorithm, missing x5c, malformed input and future signedDate', async () => {
    const chain = makeChain();
    await expect(
      verifyAppleJws(signJws(payload, chain, { alg: 'HS256' }), opts(chain)),
    ).rejects.toThrow(/algorithm/);
    await expect(
      verifyAppleJws(signJws(payload, chain, { omitX5c: true }), opts(chain)),
    ).rejects.toThrow(/x5c/);
    await expect(verifyAppleJws('not-a-jws', opts(chain))).rejects.toThrow(/Malformed/);
    await expect(
      verifyAppleJws(signJws({ signedDate: Date.now() + 3600_000 }, chain), opts(chain)),
    ).rejects.toThrow(/future/);
  });
});
