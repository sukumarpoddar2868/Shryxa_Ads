"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/dal";
import { metaEnv } from "@/lib/env";
import { applyAssetSelection, type AssetFormState } from "@/features/meta-connect/assets";
import { createInvite, disconnectClient, markInviteUsed, resolveInvite } from "@/features/meta-connect/store";
import {
  BILLING_ARRANGEMENTS,
  ClientLimitError,
  SERVICE_MODELS,
  createClientRecord,
  deleteClientRecord,
  getClient,
  renameClient,
} from "./data";

/* ----------------------------------------------------------- Add client */

const AddClientSchema = z.object({
  businessName: z.string().trim().min(2, "Enter the business name.").max(120),
  serviceModel: z.enum(Object.keys(SERVICE_MODELS) as [keyof typeof SERVICE_MODELS]),
  billingArrangement: z
    .enum(Object.keys(BILLING_ARRANGEMENTS) as [keyof typeof BILLING_ARRANGEMENTS])
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type AddClientState = { error?: string; fieldErrors?: { businessName?: string }; values?: { businessName?: string } };

export async function addClientAction(_prev: AddClientState, form: FormData): Promise<AddClientState> {
  const user = await requireUser();
  const parsed = AddClientSchema.safeParse(Object.fromEntries(form));
  const values = { businessName: String(form.get("businessName") ?? "") };
  if (!parsed.success) {
    const fe = parsed.error.issues.find((i) => i.path[0] === "businessName");
    return { fieldErrors: { businessName: fe?.message }, error: fe ? undefined : "Please check the form.", values };
  }
  let id: number;
  try {
    id = await createClientRecord(user, {
      businessName: parsed.data.businessName,
      serviceModel: parsed.data.serviceModel,
      billingArrangement: parsed.data.billingArrangement ?? null,
    });
  } catch (e) {
    if (e instanceof ClientLimitError) return { error: `${e.message} Upgrade on the Account page to add more.`, values };
    return { error: "Could not add the client. Please try again.", values };
  }
  revalidatePath("/clients");
  redirect(`/clients/${id}`);
}

/* --------------------------------------------------- Per-client actions */

async function ownedClient(clientId: number) {
  const user = await requireUser();
  const client = await getClient(user.id, clientId);
  if (!client) redirect("/clients");
  return { user, client };
}

export async function renameClientAction(clientId: number, form: FormData) {
  const { user } = await ownedClient(clientId);
  const name = z.string().trim().min(2).max(120).safeParse(form.get("businessName"));
  if (name.success) await renameClient(user.id, clientId, name.data);
  revalidatePath(`/clients/${clientId}`);
}

export async function saveAssetsAction(clientId: number, _prev: AssetFormState, form: FormData): Promise<AssetFormState> {
  const { user, client } = await ownedClient(clientId);
  const res = await applyAssetSelection(user.id, client.id, client.meta_connection_id, form);
  if (res.saved) revalidatePath(`/clients/${clientId}`);
  return res;
}

export async function disconnectAction(clientId: number) {
  const { user, client } = await ownedClient(clientId);
  await disconnectClient(user.id, client.id, client.meta_connection_id);
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteClientAction(clientId: number) {
  const { user, client } = await ownedClient(clientId);
  if (client.is_self) return;
  await disconnectClient(user.id, client.id, client.meta_connection_id);
  await deleteClientRecord(user.id, client.id);
  revalidatePath("/clients");
  redirect("/clients");
}

export type InviteState = { url?: string; expiresAt?: string; error?: string };

export async function createInviteAction(clientId: number): Promise<InviteState> {
  const { user, client } = await ownedClient(clientId);
  try {
    const { token, expiresAt } = await createInvite(user.id, client.id);
    return { url: `${metaEnv().APP_URL}/connect/${token}`, expiresAt: expiresAt.toISOString() };
  } catch {
    return { error: "Could not create the invite link. Please try again." };
  }
}

/* ------------------------------------------- Invite (no Shryxa login) */

export async function saveInviteAssetsAction(token: string, _prev: AssetFormState, form: FormData): Promise<AssetFormState> {
  const invite = await resolveInvite(token);
  if (!invite) return { error: "This invite link has expired. Ask for a new one." };
  if (invite.usedAt) return { error: "This invite was already completed. Ask for a new link to make changes." };
  const res = await applyAssetSelection(invite.userId, invite.clientId, invite.connectionId, form);
  if (res.saved) {
    await markInviteUsed(invite.inviteId);
    revalidatePath(`/connect/${token}`);
    revalidatePath(`/clients/${invite.clientId}`);
  }
  return res;
}
