import type { Metadata } from "next";
import { requireUser } from "@/features/auth/dal";
import { ensureSelfClient, listClients } from "@/features/clients/data";
import { Callout } from "@/components/ui/surface";
import { CreateCampaign, type ClientOption } from "@/features/campaigns/create/create-campaign";
import type { Draft } from "@/features/campaigns/create/blueprint";
import { loadDraft } from "@/features/campaigns/store";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage({ searchParams }: PageProps<"/campaigns/new">) {
  const sp = await searchParams;
  const user = await requireUser();
  const wanted = typeof sp.draft === "string" ? Number(sp.draft) : null;
  const saved = wanted ? await loadDraft(user.id, wanted) : null;
  if (user.accountType === "business") await ensureSelfClient(user);

  const clients: ClientOption[] = (await listClients(user.id))
    .filter((c) => c.meta_connection_id)
    .map((c) => ({
      id: c.id,
      name: c.business_name ?? "Untitled client",
      ready: Boolean(c.ad_account_id && c.page_id),
      adAccountName: c.ad_account_name,
      pageName: c.page_name,
      instagramUsername: c.instagram_username,
      pageId: c.page_id,
      hasPixel: Boolean(c.pixel_id),
      pixelId: c.pixel_id,
      pixelName: c.pixel_name,
      hasInstagram: Boolean(c.instagram_actor_id),
    }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Campaigns</p>
        <h1 className="mt-1 text-[32px] font-extrabold leading-tight">{saved ? "edit draft" : "new campaign"}</h1>
      </header>
      {wanted && !saved && <Callout tone="error">That draft wasn&apos;t found (it may have been launched or deleted). Starting a new campaign.</Callout>}
      <CreateCampaign
        key={saved?.id ?? "new"}
        clients={clients}
        isAgency={user.accountType === "agency"}
        initial={(saved?.draft as Draft | undefined) ?? null}
        draftId={saved?.id ?? null}
      />
    </div>
  );
}
