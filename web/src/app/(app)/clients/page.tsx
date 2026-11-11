import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Callout, Card, Chip } from "@/components/ui/surface";
import { listBusinessConnections } from "@/features/meta-connect/store";
import { META_ERRORS } from "@/features/meta-connect/client-meta";
import { requireUser } from "@/features/auth/dal";
import { ensureSelfClient, listClients, type Client } from "@/features/clients/data";
import { AddClientForm } from "@/features/clients/components/add-client-form";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const sp = await searchParams;
  const user = await requireUser();
  // Business owners have exactly one client — go straight to it.
  if (user.accountType === "business") redirect(`/clients/${await ensureSelfClient(user)}`);

  const [clients, businesses] = await Promise.all([listClients(user.id), listBusinessConnections(user.id)]);
  const errKey = typeof sp.meta_error === "string" ? sp.meta_error : null;
  const atLimit = clients.length >= user.clientLimit;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Workspace</p>
          <h1 className="mt-1 text-[32px] font-extrabold leading-tight">clients</h1>
        </div>
        <Chip tone={atLimit ? "stopped" : "neutral"}>
          {clients.length} / {user.clientLimit} clients on your plan
        </Chip>
      </header>

      {errKey && <Callout tone="error">{META_ERRORS[errKey] ?? "Something went wrong with Facebook login."}</Callout>}

      <Card className="relative overflow-hidden">
        <div aria-hidden className="pattern-dots absolute inset-y-0 right-0 w-1/3 text-lavender-deep/[0.12] [mask-image:linear-gradient(90deg,transparent,black)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2 text-[19px] font-extrabold">
              <Building2 className="size-5" aria-hidden /> Business Manager
            </h2>
            <p className="mt-1 text-[15px] text-ink-muted">
              Already have partner access to your clients&apos; ad accounts? Connect your Business Manager once and import them
              as clients — no invite links needed.
            </p>
          </div>
          <ButtonLink href="/api/meta/oauth/start?business=1" variant={businesses.length ? "secondary" : "primary"} prefetch={false}>
            {businesses.length ? "Connect another" : "Connect Business Manager"}
          </ButtonLink>
        </div>
        {businesses.length > 0 && (
          <ul className="relative mt-5 flex flex-wrap gap-3">
            {businesses.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/clients/business/${b.id}`}
                  className="flex items-center gap-3 rounded-pill bg-lavender-soft py-2 pl-4 pr-2 text-[14px] font-bold hover:bg-lavender"
                >
                  {b.meta_user_name}
                  <span className="text-[13px] font-normal text-ink-muted">
                    {b.clientCount} client{b.clientCount === 1 ? "" : "s"}
                  </span>
                  <Chip tone={b.connection_status === "connected" ? "active" : "stopped"}>
                    {b.connection_status === "connected" ? "Import →" : "Expired"}
                  </Chip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section aria-label="Your clients">
          {clients.length === 0 ? (
            <Card className="flex flex-col items-start gap-3 p-8">
              <p className="text-[19px] font-extrabold">No clients yet</p>
              <p className="max-w-md text-[15px] text-ink-muted">
                Add your first client, then connect their Facebook yourself — or send them an invite link so they connect it
                in a minute without an account.
              </p>
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {clients.map((c) => (
                <li key={c.id}>
                  <ClientCard client={c} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <Card className="h-fit">
          <h2 className="flex items-center gap-2 text-[19px] font-extrabold">
            <Plus className="size-5" aria-hidden /> Add a client
          </h2>
          <div className="mt-5">
            {atLimit ? (
              <p className="text-[15px] text-ink-muted">
                You&apos;ve reached your plan&apos;s client limit.{" "}
                <Link href="/account" className="font-bold text-tomato-700 hover:underline">
                  Upgrade
                </Link>{" "}
                to add more.
              </p>
            ) : (
              <AddClientForm />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ClientCard({ client: c }: { client: Client }) {
  const connected = Boolean(c.meta_connection_id);
  const ready = connected && c.ad_account_id && c.page_id;
  return (
    <Link
      href={`/clients/${c.id}`}
      className="group flex h-full flex-col rounded-card bg-paper p-6 transition-shadow hover:shadow-[0_8px_30px_-12px_rgb(42_39_51/0.3)]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[19px] font-extrabold leading-tight">{c.business_name ?? "Untitled client"}</p>
        <Chip tone={ready ? "active" : connected ? "paused" : "neutral"}>{ready ? "Ready" : connected ? "Setup needed" : "Not connected"}</Chip>
      </div>
      <dl className="mt-4 space-y-1 text-[14px] text-ink-muted">
        <div className="flex gap-2">
          <dt className="sr-only">Ad account</dt>
          <dd className="truncate">{c.ad_account_name ?? "No ad account yet"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="sr-only">Page</dt>
          <dd className="truncate">{c.page_name ? `Page · ${c.page_name}` : "No Page yet"}</dd>
        </div>
      </dl>
      <span className="mt-auto flex items-center gap-1 pt-5 text-[14px] font-bold text-tomato-700">
        Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
