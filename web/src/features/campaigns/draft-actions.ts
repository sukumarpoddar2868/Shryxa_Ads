"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/dal";
import { deleteDraft, saveDraft } from "./store";

/** Autosave from the create page. Returns the draft id to keep in the URL. */
export async function saveDraftAction(id: number | null, draft: unknown): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const r = await saveDraft(user.id, id && Number.isSafeInteger(id) ? id : null, draft);
  return "error" in r ? { ok: false, error: r.error } : { ok: true, id: r.id };
}

export async function deleteDraftAction(id: number): Promise<void> {
  const user = await requireUser();
  if (!Number.isSafeInteger(id)) return;
  await deleteDraft(user.id, id);
  revalidatePath("/campaigns");
}
