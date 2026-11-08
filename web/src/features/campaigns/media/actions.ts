"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { getClient } from "@/features/clients/data";
import { db } from "@/lib/supabase/server";
import { MEDIA_BUCKET, MEDIA_RULES, checkFile } from "./rules";

const UploadInput = z.object({
  clientId: z.number().int().positive(),
  kind: z.enum(["image", "video"]),
  contentType: z.string().max(100),
  size: z.number().int().positive(),
});

/**
 * Step 1 of an upload: a short-lived signed URL the browser PUTs the file to
 * directly (so large files never pass through our server). Files live under
 * u{user}/c{client}/ in a private bucket.
 */
export async function createUploadAction(
  input: z.input<typeof UploadInput>,
): Promise<{ ok: true; path: string; signedUrl: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = UploadInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid upload." };
  const { clientId, kind, contentType, size } = parsed.data;

  const problem = checkFile(kind, contentType, size);
  if (problem) return { ok: false, error: problem };
  if (!(await getClient(user.id, clientId))) return { ok: false, error: "Client not found." };

  const path = `u${user.id}/c${clientId}/${randomUUID()}.${MEDIA_RULES[kind].types[contentType]}`;
  const { data, error } = await db().storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Couldn't start the upload. Please try again." };
  return { ok: true, path, signedUrl: data.signedUrl };
}

/** Remove a file the user replaced or deleted. Only their own files. */
export async function deleteMediaAction(path: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (typeof path !== "string" || !path.startsWith(`u${user.id}/`) || path.includes("..")) return { ok: false };
  const { error } = await db().storage.from(MEDIA_BUCKET).remove([path]);
  return { ok: !error };
}
