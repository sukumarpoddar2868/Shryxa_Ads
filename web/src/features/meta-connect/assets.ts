import "server-only";
import { z } from "zod";
import { saveClientAssets } from "@/features/clients/data";
import { MetaApiError } from "@/lib/meta/graph";
import { discoverAssets, listPixels } from "./discovery";
import { getConnectionToken, markConnection } from "./store";

const optionalId = z
  .string()
  .trim()
  .max(64)
  .regex(/^(act_)?\d*$/, "Invalid id")
  .transform((v) => v || null);

export const AssetFormSchema = z.object({
  adAccountId: optionalId,
  pageId: optionalId,
  instagramId: optionalId,
  pixelId: optionalId,
});

export type AssetFormState = { error?: string; saved?: boolean };

/**
 * Validates the picked ids against what the connected login can actually
 * access (never trust ids from the form), resolves display names, saves.
 */
export async function applyAssetSelection(userId: number, clientId: number, connectionId: number | null, form: FormData): Promise<AssetFormState> {
  if (!connectionId) return { error: "Connect Facebook first." };
  const parsed = AssetFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Something in the selection looks wrong. Please pick again." };
  const pick = parsed.data;

  const token = await getConnectionToken(userId, connectionId);
  if (!token) return { error: "This Facebook connection has expired. Please reconnect." };

  try {
    const found = await discoverAssets(token);
    const account = pick.adAccountId ? found.adAccounts.find((a) => a.id === pick.adAccountId || a.accountId === pick.adAccountId) : null;
    if (pick.adAccountId && !account) return { error: "That ad account isn't available to this Facebook login." };

    const page = pick.pageId ? found.pages.find((p) => p.id === pick.pageId) : null;
    if (pick.pageId && !page) return { error: "That Page isn't available to this Facebook login." };

    const ig = pick.instagramId && page?.instagram?.id === pick.instagramId ? page.instagram : null;
    if (pick.instagramId && !ig) return { error: "That Instagram account isn't linked to the selected Page." };

    let pixel: { id: string; name: string } | null = null;
    if (pick.pixelId && account) {
      pixel = (await listPixels(token, account.id)).find((p) => p.id === pick.pixelId) ?? null;
      if (!pixel) return { error: "That Pixel doesn't belong to the selected ad account." };
    }

    await saveClientAssets(userId, clientId, {
      adAccountId: account?.accountId ?? null,
      adAccountName: account?.name ?? null,
      pageId: page?.id ?? null,
      pageName: page?.name ?? null,
      instagramId: ig?.id ?? null,
      instagramUsername: ig?.username ?? null,
      pixelId: pixel?.id ?? null,
      pixelName: pixel?.name ?? null,
    });
    return { saved: true };
  } catch (e) {
    if (e instanceof MetaApiError && e.isAuthError) {
      await markConnection(userId, connectionId, "expired");
      return { error: "Facebook says this login has expired or was revoked. Please reconnect." };
    }
    return { error: e instanceof Error ? e.message : "Could not save. Please try again." };
  }
}
