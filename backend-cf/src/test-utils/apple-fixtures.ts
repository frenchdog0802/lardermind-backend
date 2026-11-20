// Test-only: builds a synthetic Apple-style certificate chain (root P-384 -> intermediate P-384 ->
// leaf P-256) and signs StoreKit-style JWS payloads, so the real verifier runs end to end.
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

function der(tag: number, content: Uint8Array): Uint8Array {
  const len = content.length;
  let header: number[];
  if (len < 0x80) header = [tag, len];
  else if (len < 0x100) header = [tag, 0x81, len];
  else header = [tag, 0x82, len >> 8, len & 0xff];
  const out = new Uint8Array(header.length + len);
  out.set(header, 0);
  out.set(content, header.length);
  return out;
}
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const seq = (...p: Uint8Array[]) => der(0x30, cat(...p));
const set = (...p: Uint8Array[]) => der(0x31, cat(...p));
const oid = (s: string) => {
  const n = s.split('.').map(Number);
  const bytes: number[] = [n[0]! * 40 + n[1]!];
  for (const v of n.slice(2)) {
    const stack = [v & 0x7f];
    let x = v >> 7;
    while (x > 0) {
      stack.unshift((x & 0x7f) | 0x80);
      x >>= 7;
    }
    bytes.push(...stack);
  }
  return der(0x06, Uint8Array.from(bytes));
};
const int = (n: number) => der(0x02, Uint8Array.from([n]));
const utf8 = (s: string) => der(0x0c, new TextEncoder().encode(s));
const utcTime = (ms: number) => {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  const s = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return der(0x17, new TextEncoder().encode(s));
};
const name = (cn: string) => seq(set(seq(oid('2.5.4.3'), utf8(cn))));

export const OID_LEAF = '1.2.840.113635.100.6.11.1';
export const OID_INTERMEDIATE = '1.2.840.113635.100.6.2.1';

export type TestCert = { der: Uint8Array; key: KeyObject; subjectCn: string };

export function makeCert(opts: {
  subjectCn: string;
  curve: 'P-256' | 'P-384';
  issuer?: TestCert; // undefined => self-signed
  notBefore?: number;
  notAfter?: number;
  markerOid?: string;
}): TestCert {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: opts.curve === 'P-256' ? 'prime256v1' : 'secp384r1',
  });
  const spki = new Uint8Array(publicKey.export({ type: 'spki', format: 'der' }));
  const issuerKey = opts.issuer?.key ?? privateKey;
  const issuerCn = opts.issuer?.subjectCn ?? opts.subjectCn;
  // Signature hash follows the *issuer* key size, as in Apple's chain.
  const issuerIsP384 = (opts.issuer ? opts.issuer.key : privateKey).asymmetricKeyDetails?.namedCurve === 'secp384r1';
  const hashName = issuerIsP384 ? 'sha384' : 'sha256';
  const sigAlg = seq(oid(issuerIsP384 ? '1.2.840.10045.4.3.3' : '1.2.840.10045.4.3.2'));

  const now = Date.now();
  const exts = opts.markerOid
    ? der(0xa3, seq(seq(oid(opts.markerOid), der(0x04, Uint8Array.from([0x05, 0x00])))))
    : new Uint8Array(0);
  const tbs = seq(
    der(0xa0, int(2)),
    int(1),
    sigAlg,
    name(issuerCn),
    seq(utcTime(opts.notBefore ?? now - 86400_000), utcTime(opts.notAfter ?? now + 365 * 86400_000)),
    name(opts.subjectCn),
    spki,
    exts,
  );
  const signature = new Uint8Array(sign(hashName, tbs, { key: issuerKey, dsaEncoding: 'der' }));
  const certDer = seq(tbs, sigAlg, der(0x03, cat(Uint8Array.from([0]), signature)));
  return { der: certDer, key: privateKey, subjectCn: opts.subjectCn };
}

export type TestChain = { root: TestCert; intermediate: TestCert; leaf: TestCert };

export function makeChain(overrides: { leafNotAfter?: number; leafMarker?: string | null } = {}): TestChain {
  const root = makeCert({ subjectCn: 'Test Apple Root', curve: 'P-384' });
  const intermediate = makeCert({
    subjectCn: 'Test WWDR',
    curve: 'P-384',
    issuer: root,
    markerOid: OID_INTERMEDIATE,
  });
  const leaf = makeCert({
    subjectCn: 'Test Receipt Signer',
    curve: 'P-256',
    issuer: intermediate,
    notAfter: overrides.leafNotAfter,
    markerOid: overrides.leafMarker === null ? undefined : (overrides.leafMarker ?? OID_LEAF),
  });
  return { root, intermediate, leaf };
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const b64url = (b: Uint8Array | string) =>
  Buffer.from(b as Uint8Array).toString('base64url');

export function signJws(
  payload: Record<string, unknown>,
  chain: TestChain,
  opts: { includeRoot?: boolean; alg?: string; signer?: KeyObject; omitX5c?: boolean } = {},
): string {
  const x5c = [b64(chain.leaf.der), b64(chain.intermediate.der)];
  if (opts.includeRoot) x5c.push(b64(chain.root.der));
  const header = { alg: opts.alg ?? 'ES256', ...(opts.omitX5c ? {} : { x5c }) };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = sign('sha256', Buffer.from(`${h}.${p}`), {
    key: opts.signer ?? chain.leaf.key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${h}.${p}.${b64url(sig)}`;
}
