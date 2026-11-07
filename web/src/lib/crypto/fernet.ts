import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Fernet (spec: github.com/fernet/spec) — byte-compatible with Python's
 * `cryptography.fernet.Fernet`, so tokens encrypted by the legacy Streamlit
 * app (META_TOKEN_ENCRYPTION_KEY) decrypt here and vice versa.
 *
 * token = base64url( 0x80 | ts(8, BE) | iv(16) | AES-128-CBC(ct) | HMAC-SHA256(32) )
 */

const VERSION = 0x80;

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function b64urlEncode(b: Buffer): string {
  // Python's urlsafe_b64encode keeps "=" padding; keep it for compatibility.
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function splitKey(key: string): { signing: Buffer; encryption: Buffer } {
  const raw = b64urlDecode(key.trim());
  if (raw.length !== 32) throw new Error("Fernet key must be 32 url-safe base64-encoded bytes.");
  return { signing: raw.subarray(0, 16), encryption: raw.subarray(16) };
}

export function fernetEncrypt(plaintext: string, key: string): string {
  const { signing, encryption } = splitKey(key);
  const iv = randomBytes(16);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));

  const cipher = createCipheriv("aes-128-cbc", encryption, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const body = Buffer.concat([Buffer.from([VERSION]), ts, iv, ct]);
  const mac = createHmac("sha256", signing).update(body).digest();
  return b64urlEncode(Buffer.concat([body, mac]));
}

export function fernetDecrypt(token: string, key: string): string {
  const { signing, encryption } = splitKey(key);
  const data = b64urlDecode(token.trim());
  if (data.length < 1 + 8 + 16 + 16 + 32 || data[0] !== VERSION) throw new Error("Invalid Fernet token.");

  const body = data.subarray(0, data.length - 32);
  const mac = data.subarray(data.length - 32);
  const expected = createHmac("sha256", signing).update(body).digest();
  if (!timingSafeEqual(mac, expected)) throw new Error("Invalid Fernet token signature.");

  const iv = body.subarray(9, 25);
  const ct = body.subarray(25);
  const decipher = createDecipheriv("aes-128-cbc", encryption, iv);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
