import "server-only";
import { MEDIA_BUCKET } from "@/features/campaigns/media/rules";
import { cancelSubscription } from "@/features/billing/razorpay";
import { billingConfigured } from "@/lib/env";
import { db } from "@/lib/supabase/server";

/** Every Storage object under `u{id}/` (two levels: client folder → files). */
async function userMedia(userId: number): Promise<string[]> {
  const bucket = db().storage.from(MEDIA_BUCKET);
  const root = `u${userId}`;
  const { data: folders } = await bucket.list(root, { limit: 1000 });
  const out: string[] = [];
  for (const f of folders ?? []) {
    if (f.id) {
      out.push(`${root}/${f.name}`);
      continue;
    }
    for (let offset = 0; ; offset += 1000) {
      const { data: files } = await bucket.list(`${root}/${f.name}`, { limit: 1000, offset });
      out.push(...(files ?? []).filter((x) => x.id).map((x) => `${root}/${f.name}/${x.name}`));
      if (!files || files.length < 1000) break;
    }
  }
  return out;
}

/**
 * Permanently delete a Shryxa account: stop billing, remove uploaded media,
 * then the user row (cascades to sessions, clients, connections, drafts…).
 * Campaigns already on Meta stay in the customer's own ad account.
 */
export async function deleteAccountData(userId: number): Promise<void> {
  const { data: sub } = await db().from("subscriptions").select("razorpay_subscription_id, status").eq("user_id", userId).maybeSingle();
  if (sub?.razorpay_subscription_id && billingConfigured() && sub.status !== "canceled" && sub.status !== "expired") {
    await cancelSubscription(sub.razorpay_subscription_id, false).catch(() => undefined);
  }
  const paths = await userMedia(userId);
  for (let i = 0; i < paths.length; i += 500) await db().storage.from(MEDIA_BUCKET).remove(paths.slice(i, i + 500));
  const { error } = await db().from("users").delete().eq("id", userId);
  if (error) throw new Error(`Couldn't delete the account: ${error.message}`);
}
