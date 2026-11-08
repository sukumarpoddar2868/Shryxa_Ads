import type { Metadata } from "next";
import { requireUser } from "@/features/auth/dal";
import { ensureSelfClient, listClients } from "@/features/clients/data";
import { CreateCampaign, type ClientOption } from "@/features/campaigns/create/create-campaign";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage() {
  const user = await requireUser();
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
    }));

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Campaigns</p>
        <h1 className="mt-1 text-[32px] font-extrabold leading-tight">new campaign</h1>
      </header>
      <CreateCampaign clients={clients} isAgency={user.accountType === "agency"} />
    </div>
  );
}
