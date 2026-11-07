import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Building2, RefreshCw, Unplug } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout, Card, Chip } from "@/components/ui/surface";
import { requireUser } from "@/features/auth/dal";
import { importClientsAction, removeBusinessAction } from "@/features/clients/actions";
import { ImportForm } from "@/features/clients/components/import-form";
import { loadBusinessImport } from "@/features/clients/import";
import { META_ERRORS } from "@/features/meta-connect/client-meta";

export const metadata: Metadata = { title: "Business Manager" };

export default async function BusinessPage({ params, searchParams }: PageProps<"/clients/business/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  if (user.accountType !== "agency") redirect("/clients");

  const data = await loadBusinessImport(user.id, Number(id));
  if (!data) notFound();
  const { conn, discovery, claimed, clientCount, error } = data;
  const errKey = typeof sp.meta_error === "string" ? sp.meta_error : null;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/clients" className="flex w-fit items-center gap-1.5 text-[14px] font-bold text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> All clients
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-ink-muted">
            <Building2 className="size-4" aria-hidden /> Business Manager
          </p>
          <h1 className="mt-1 text-[32px] font-extrabold leading-tight">{conn.meta_user_name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={conn.connection_status === "connected" ? "active" : "stopped"}>
            {conn.connection_status === "connected" ? "Connected" : "Expired"}
          </Chip>
          {conn.connection_status === "connected" && (
            <Chip tone="neutral">{conn.token_type === "system_user" ? "Never expires" : "Renews every ~60 days"}</Chip>
          )}
        </div>
      </header>

      {sp.connected === "1" && !error && (
        <Callout tone="success">Business Manager connected. Tick the ad accounts you want as clients and pick a Page for each.</Callout>
      )}
      {errKey && <Callout tone="error">{META_ERRORS[errKey] ?? "Something went wrong with Facebook login."}</Callout>}
      {error && <Callout tone="error">{error}</Callout>}

      {discovery && (
        <section aria-labelledby="import-h">
          <h2 id="import-h" className="mb-1 text-[19px] font-extrabold">
            Import clients
          </h2>
          <p className="mb-5 text-[15px] text-ink-muted">
            {discovery.adAccounts.length} ad account{discovery.adAccounts.length === 1 ? "" : "s"} and {discovery.pages.length} Page
            {discovery.pages.length === 1 ? "" : "s"} shared with Shryxa Ads. Missing one? Reconnect and tick it in Facebook&apos;s
            &quot;choose what to share&quot; step. A Page shown greyed out there needs your business portfolio to have{" "}
            <strong>full control</strong> of it (Meta Business Settings → Accounts → Pages).
          </p>
          {discovery.adAccounts.length === 0 ? (
            <Callout>No ad accounts were shared. Reconnect and select the client ad accounts this Business Manager can access.</Callout>
          ) : (
            <ImportForm
              action={importClientsAction.bind(null, conn.id)}
              adAccounts={discovery.adAccounts}
              pages={discovery.pages}
              claimed={Object.fromEntries(claimed)}
              slotsLeft={Math.max(0, user.clientLimit - clientCount)}
            />
          )}
        </section>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-extrabold">Manage connection</h2>
          <p className="text-[14px] text-ink-muted">
            Reconnect to share more assets. Removing it unlinks every client that uses it (their ads on Meta are untouched).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/api/meta/oauth/start?business=1" variant="secondary" size="sm" prefetch={false}>
            <RefreshCw className="size-4" aria-hidden /> Reconnect
          </ButtonLink>
          <form action={removeBusinessAction.bind(null, conn.id)}>
            <Button variant="danger" size="sm" type="submit">
              <Unplug className="size-4" aria-hidden /> Remove
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
