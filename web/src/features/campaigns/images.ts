import "server-only";
import { createHash } from "node:crypto";
import { graphPost } from "@/lib/meta/graph";
import { actId } from "@/features/meta-connect/discovery";

/**
 * Upload an ad image → `image_hash`. Port of `payload_pipeline/upload_image.py`.
 * Mock returns md5 of the bytes (same shape as a real hash, deterministic).
 */

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024; // Meta's limit
export const IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

export type UploadedImage = { mode: "mock" | "live"; hash: string; url: string | null; sizeBytes: number };

export function uploadImageMock(bytes: Uint8Array): UploadedImage {
  return { mode: "mock", hash: createHash("md5").update(bytes).digest("hex"), url: null, sizeBytes: bytes.byteLength };
}

export async function uploadImageLive(token: string, adAccountId: string, bytes: Uint8Array): Promise<UploadedImage> {
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image is larger than Meta's 30 MB limit.");
  const res = await graphPost<{ images?: Record<string, { hash?: string; url?: string }> }>(
    `${actId(adAccountId)}/adimages`,
    token,
    { bytes: Buffer.from(bytes).toString("base64") },
  );
  const info = Object.values(res.images ?? {})[0];
  if (!info?.hash) throw new Error("Meta accepted the upload but returned no image hash.");
  return { mode: "live", hash: info.hash, url: info.url ?? null, sizeBytes: bytes.byteLength };
}
