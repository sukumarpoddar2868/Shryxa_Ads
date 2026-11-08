import "server-only";
import { createHash } from "node:crypto";
import { actId } from "@/features/meta-connect/discovery";
import { graphPost } from "@/lib/meta/graph";
import { db } from "@/lib/supabase/server";
import { uploadImageLive, uploadImageMock } from "../images";
import { MEDIA_BUCKET } from "./rules";

/**
 * Launch-time hand-off: files in our Storage → Meta ids.
 *   image → /adimages → image_hash
 *   video → /advideos (Meta downloads it from a signed URL) → video_id
 * Mock mode never calls Meta (deterministic fake ids).
 */

function ownPath(userId: number, path: string) {
  if (!path.startsWith(`u${userId}/`) || path.includes("..")) throw new Error("Media file not found.");
}

export async function pushImage(userId: number, path: string, target: { mode: "mock" } | { mode: "live"; token: string; adAccountId: string }): Promise<string> {
  ownPath(userId, path);
  const { data, error } = await db().storage.from(MEDIA_BUCKET).download(path);
  if (error || !data) throw new Error("Couldn't read an uploaded image. Please upload it again.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  return target.mode === "mock" ? uploadImageMock(bytes).hash : (await uploadImageLive(target.token, target.adAccountId, bytes)).hash;
}

export async function pushVideo(userId: number, path: string, target: { mode: "mock" } | { mode: "live"; token: string; adAccountId: string }): Promise<string> {
  ownPath(userId, path);
  if (target.mode === "mock") return `v_${createHash("md5").update(path).digest("hex").slice(0, 15)}`;
  const { data, error } = await db().storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data) throw new Error("Couldn't read the uploaded video. Please upload it again.");
  const res = await graphPost<{ id?: string }>(`${actId(target.adAccountId)}/advideos`, target.token, { file_url: data.signedUrl });
  if (!res.id) throw new Error("Meta accepted the video but returned no id.");
  return res.id;
}
