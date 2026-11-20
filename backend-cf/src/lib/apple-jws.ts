/**
 * Verification of Apple-signed JWS payloads (StoreKit 2 signed transactions and
 * App Store Server Notifications V2).
 *
 * The JWS header carries an `x5c` chain (leaf, intermediate[, root]). We:
 *   1. require the chain to terminate in a pinned Apple Root CA - G3 certificate,
 *   2. verify every certificate signature and validity window (ECDSA, P-256/P-384),
 *   3. require Apple's marker OIDs on the leaf / intermediate,
 *   4. verify the JWS signature (ES256) with the leaf public key.
 *
 * Implemented on WebCrypto + a tiny DER reader so it runs in Cloudflare Workers
 * (no Node X.509 dependency).
 */

/**
 * Apple Root CA - G3 (DER, base64). SHA-256 fingerprint:
 * 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
 * Source: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 */
export const APPLE_ROOT_CA_G3_B64 =
  'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==';

/** Apple marker extension OIDs (DER-encoded OID values, without tag/length). */
const OID_LEAF_MARKER = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01]; // 1.2.840.113635.100.6.11.1
const OID_INTERMEDIATE_MARKER = [0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01]; // 1.2.840.113635.100.6.2.1

const OID_ECDSA_SHA256 = '1.2.840.10045.4.3.2';
const OID_ECDSA_SHA384 = '1.2.840.10045.4.3.3';
const OID_P256 = '1.2.840.10045.3.1.7';
const OID_P384 = '1.3.132.0.34';

export class AppleJwsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppleJwsError';
  }
}

export type VerifyAppleJwsOptions = {
  /** Trusted root certificates (DER). Defaults to Apple Root CA - G3. Tests inject their own. */
  rootCertsDer?: Uint8Array[];
  /** Instant (unix ms) at which certificate validity is evaluated. Defaults to the JWS payload `signedDate`, else now. */
  effectiveTimeMs?: number;
  /** Override "now" (unix ms) — used to bound `signedDate` and as the fallback validity instant. */
  nowMs?: number;
  /** Skip Apple marker-OID checks (tests with synthetic chains only). */
  skipMarkerOids?: boolean;
};

// ---------------------------------------------------------------- DER helpers

type Tlv = { tag: number; start: number; end: number; next: number };

function readTlv(buf: Uint8Array, offset: number): Tlv {
  if (offset + 2 > buf.length) throw new AppleJwsError('Malformed DER');
  const tag = buf[offset]!;
  let len = buf[offset + 1]!;
  let pos = offset + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || pos + n > buf.length) throw new AppleJwsError('Malformed DER length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[pos + i]!;
    pos += n;
  }
  const end = pos + len;
  if (end > buf.length) throw new AppleJwsError('DER length overflow');
  return { tag, start: pos, end, next: end };
}

function children(buf: Uint8Array, tlv: Tlv): Tlv[] {
  const out: Tlv[] = [];
  let pos = tlv.start;
  while (pos < tlv.end) {
    const child = readTlv(buf, pos);
    out.push({ ...child, start: child.start });
    pos = child.next;
  }
  return out;
}

/** Offset where a TLV's header begins is not stored; recompute raw slice [headerStart, end). */
function rawSlice(buf: Uint8Array, headerStart: number, tlv: Tlv): Uint8Array {
  return buf.subarray(headerStart, tlv.end);
}

function childrenWithHeader(
  buf: Uint8Array,
  tlv: Tlv,
): Array<Tlv & { headerStart: number }> {
  const out: Array<Tlv & { headerStart: number }> = [];
  let pos = tlv.start;
  while (pos < tlv.end) {
    const child = readTlv(buf, pos);
    out.push({ ...child, headerStart: pos });
    pos = child.next;
  }
  return out;
}

function decodeOid(bytes: Uint8Array): string {
  const parts: number[] = [];
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    value = value * 128 + (b & 0x7f);
    if (!(b & 0x80)) {
      if (parts.length === 0) {
        const first = value < 80 ? Math.floor(value / 40) : 2;
        parts.push(first, value - first * 40);
      } else {
        parts.push(value);
      }
      value = 0;
    }
  }
  return parts.join('.');
}

function parseDerTime(tag: number, bytes: Uint8Array): number {
  const s = new TextDecoder().decode(bytes);
  let m: RegExpMatchArray | null;
  let year: number;
  if (tag === 0x17) {
    m = s.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
    if (!m) throw new AppleJwsError('Bad UTCTime');
    const yy = Number(m[1]);
    year = yy >= 50 ? 1900 + yy : 2000 + yy;
  } else if (tag === 0x18) {
    m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/);
    if (!m) throw new AppleJwsError('Bad GeneralizedTime');
    year = Number(m[1]);
  } else {
    throw new AppleJwsError('Unsupported time type');
  }
  return Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function containsSubsequence(hay: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- X.509

type ParsedCert = {
  der: Uint8Array;
  tbs: Uint8Array;
  issuer: Uint8Array;
  subject: Uint8Array;
  notBefore: number;
  notAfter: number;
  spki: Uint8Array;
  curve: 'P-256' | 'P-384';
  sigHash: 'SHA-256' | 'SHA-384';
  signature: Uint8Array; // DER ECDSA-Sig-Value
  extensions: Uint8Array;
};

function parseCertificate(der: Uint8Array): ParsedCert {
  const cert = readTlv(der, 0);
  if (cert.tag !== 0x30) throw new AppleJwsError('Certificate is not a SEQUENCE');
  const [tbsT, sigAlgT, sigValT] = childrenWithHeader(der, cert);
  if (!tbsT || !sigAlgT || !sigValT) throw new AppleJwsError('Malformed certificate');

  const sigAlgOid = decodeOid(
    der.subarray(
      readTlv(der, sigAlgT.start).start,
      readTlv(der, sigAlgT.start).end,
    ),
  );
  const sigHash =
    sigAlgOid === OID_ECDSA_SHA256 ? 'SHA-256' : sigAlgOid === OID_ECDSA_SHA384 ? 'SHA-384' : null;
  if (!sigHash) throw new AppleJwsError(`Unsupported certificate signature algorithm ${sigAlgOid}`);

  if (sigValT.tag !== 0x03) throw new AppleJwsError('Bad signature BIT STRING');
  const signature = der.subarray(sigValT.start + 1, sigValT.end); // skip unused-bits byte

  const tbsFields = childrenWithHeader(der, tbsT);
  let idx = 0;
  if (tbsFields[idx]?.tag === 0xa0) idx++; // version
  idx++; // serial
  idx++; // signature alg
  const issuerT = tbsFields[idx++];
  const validityT = tbsFields[idx++];
  const subjectT = tbsFields[idx++];
  const spkiT = tbsFields[idx++];
  if (!issuerT || !validityT || !subjectT || !spkiT) throw new AppleJwsError('Malformed TBSCertificate');

  const [nb, na] = children(der, validityT);
  if (!nb || !na) throw new AppleJwsError('Malformed validity');
  const notBefore = parseDerTime(nb.tag, der.subarray(nb.start, nb.end));
  const notAfter = parseDerTime(na.tag, der.subarray(na.start, na.end));

  // SPKI -> curve
  const [algIdT] = childrenWithHeader(der, spkiT);
  if (!algIdT) throw new AppleJwsError('Malformed SPKI');
  const algParts = childrenWithHeader(der, algIdT);
  const curveOid = algParts[1] ? decodeOid(der.subarray(algParts[1].start, algParts[1].end)) : '';
  const curve = curveOid === OID_P256 ? 'P-256' : curveOid === OID_P384 ? 'P-384' : null;
  if (!curve) throw new AppleJwsError(`Unsupported public key curve ${curveOid}`);

  const extT = tbsFields.slice(idx).find((f) => f.tag === 0xa3);
  const extensions = extT ? der.subarray(extT.start, extT.end) : new Uint8Array(0);

  return {
    der,
    tbs: rawSlice(der, tbsT.headerStart, tbsT),
    issuer: rawSlice(der, issuerT.headerStart, issuerT),
    subject: rawSlice(der, subjectT.headerStart, subjectT),
    notBefore,
    notAfter,
    spki: rawSlice(der, spkiT.headerStart, spkiT),
    curve,
    sigHash,
    signature,
    extensions,
  };
}

/** DER ECDSA-Sig-Value -> raw r||s (fixed width) for WebCrypto. */
function derSignatureToRaw(sig: Uint8Array, size: number): Uint8Array {
  const seq = readTlv(sig, 0);
  if (seq.tag !== 0x30) throw new AppleJwsError('Bad ECDSA signature');
  const [r, s] = childrenWithHeader(sig, seq);
  if (!r || !s) throw new AppleJwsError('Bad ECDSA signature');
  const out = new Uint8Array(size * 2);
  for (const [t, off] of [
    [r, 0],
    [s, size],
  ] as const) {
    let v = sig.subarray(t.start, t.end);
    while (v.length > 0 && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new AppleJwsError('ECDSA integer too large');
    out.set(v, off + size - v.length);
  }
  return out;
}

async function importCertKey(cert: ParsedCert, usage: 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    cert.spki,
    { name: 'ECDSA', namedCurve: cert.curve },
    false,
    [usage],
  );
}

async function certSignedBy(cert: ParsedCert, issuer: ParsedCert): Promise<boolean> {
  if (!bytesEqual(cert.issuer, issuer.subject)) return false;
  const key = await importCertKey(issuer, 'verify');
  const size = issuer.curve === 'P-384' ? 48 : 32;
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: cert.sigHash },
    key,
    derSignatureToRaw(cert.signature, size),
    cert.tbs,
  );
}

// ---------------------------------------------------------------- base64

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  return b64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

// ---------------------------------------------------------------- public API

export async function verifyCertChain(
  certsDer: Uint8Array[],
  effectiveTimeMs: number,
  options: Pick<VerifyAppleJwsOptions, 'rootCertsDer' | 'skipMarkerOids'> = {},
): Promise<ParsedCert> {
  if (certsDer.length < 2 || certsDer.length > 3) {
    throw new AppleJwsError('x5c must contain a leaf and an intermediate certificate');
  }
  const roots = (options.rootCertsDer ?? [b64ToBytes(APPLE_ROOT_CA_G3_B64)]).map(parseCertificate);
  const [leafDer, intermediateDer, presentedRootDer] = certsDer as [
    Uint8Array,
    Uint8Array,
    Uint8Array | undefined,
  ];
  const leaf = parseCertificate(leafDer);
  const intermediate = parseCertificate(intermediateDer);

  // Pick the trust anchor: a presented root must be byte-identical to a pinned root.
  let anchor: ParsedCert | undefined;
  if (presentedRootDer) {
    anchor = roots.find((r) => bytesEqual(r.der, presentedRootDer));
    if (!anchor) throw new AppleJwsError('x5c root is not the pinned Apple root');
  } else {
    for (const r of roots) {
      if (await certSignedBy(intermediate, r).catch(() => false)) {
        anchor = r;
        break;
      }
    }
    if (!anchor) throw new AppleJwsError('Intermediate certificate not issued by the pinned Apple root');
  }

  if (!(await certSignedBy(intermediate, anchor))) {
    throw new AppleJwsError('Intermediate certificate signature invalid');
  }
  if (!(await certSignedBy(leaf, intermediate))) {
    throw new AppleJwsError('Leaf certificate signature invalid');
  }

  for (const cert of [leaf, intermediate, anchor]) {
    if (effectiveTimeMs < cert.notBefore || effectiveTimeMs > cert.notAfter) {
      throw new AppleJwsError('Certificate not valid at signing time');
    }
  }

  if (!options.skipMarkerOids) {
    if (!containsSubsequence(leaf.extensions, OID_LEAF_MARKER)) {
      throw new AppleJwsError('Leaf certificate missing Apple receipt-signing OID');
    }
    if (!containsSubsequence(intermediate.extensions, OID_INTERMEDIATE_MARKER)) {
      throw new AppleJwsError('Intermediate certificate missing Apple WWDR OID');
    }
  }
  return leaf;
}

/**
 * Verify an Apple JWS and return its decoded payload. Throws AppleJwsError on any failure.
 */
export async function verifyAppleJws<T = Record<string, unknown>>(
  jws: string,
  options: VerifyAppleJwsOptions = {},
): Promise<T> {
  const parts = jws.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) throw new AppleJwsError('Malformed JWS');
  const [h, p, s] = parts as [string, string, string];

  let header: { alg?: string; x5c?: unknown };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  } catch {
    throw new AppleJwsError('Malformed JWS encoding');
  }
  if (header.alg !== 'ES256') throw new AppleJwsError('Unsupported JWS algorithm');
  if (!Array.isArray(header.x5c) || header.x5c.some((c) => typeof c !== 'string')) {
    throw new AppleJwsError('JWS header missing x5c');
  }

  const nowMs = options.nowMs ?? Date.now();
  const signedDate = typeof payload.signedDate === 'number' ? payload.signedDate : undefined;
  if (signedDate !== undefined && signedDate > nowMs + 10 * 60 * 1000) {
    throw new AppleJwsError('signedDate is in the future');
  }
  const effective = options.effectiveTimeMs ?? signedDate ?? nowMs;

  let leaf: ParsedCert;
  try {
    leaf = await verifyCertChain((header.x5c as string[]).map(b64ToBytes), effective, options);
  } catch (e) {
    if (e instanceof AppleJwsError) throw e;
    throw new AppleJwsError('Certificate chain verification failed');
  }

  if (leaf.curve !== 'P-256') throw new AppleJwsError('Leaf key must be P-256 for ES256');
  const key = await importCertKey(leaf, 'verify');
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) throw new AppleJwsError('JWS signature invalid');

  return payload as T;
}
