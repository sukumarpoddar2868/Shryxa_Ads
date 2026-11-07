import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { fernetDecrypt, fernetEncrypt } from "@/lib/crypto/fernet";
import { metaEnv } from "@/lib/env";

/** Random URL-safe secret (OAuth state, invite tokens). Only its hash is stored. */
export function newSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function encryptToken(token: string): string {
  return fernetEncrypt(token, metaEnv().META_TOKEN_ENCRYPTION_KEY);
}

export function decryptToken(encrypted: string): string {
  return fernetDecrypt(encrypted, metaEnv().META_TOKEN_ENCRYPTION_KEY);
}
