import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { requireUser } from "@/features/auth/dal";

export const metadata: Metadata = { title: "Campaigns" };

// Campaign list arrives in Phase 5 (Dashboard + Manage).
export default async function CampaignsPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Workspace</p>
          <h1 className="mt-1 text-[32px] font-extrabold leading-tight">campaigns</h1>
        </div>
        <ButtonLink href="/campaigns/new">New campaign</ButtonLink>
      </header>
      <Card className="flex flex-col items-start gap-3 p-8">
        <Megaphone className="size-6" aria-hidden strokeWidth={1.75} />
        <p className="text-[19px] font-extrabold">No campaigns yet</p>
        <p className="max-w-md text-[15px] text-ink-muted">Create your first campaign — it launches paused, so nothing spends until you turn it on.</p>
      </Card>
    </div>
  );
}
