import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RefreshCw, Unplug, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout, Card, Chip } from "@/components/ui/surface";
import { requireUser } from "@/features/auth/dal";
import { getClient } from "@/features/clients/data";
import { deleteClientAction, disconnectAction, saveAssetsAction } from "@/features/clients/actions";
import { AssetPicker } from "@/features/clients/components/asset-picker";
import { InviteLink } from "@/features/clients/components/invite-link";
import { ReadinessList } from "@/features/clients/components/readiness";
import { loadClientMeta, META_ERRORS } from "@/features/meta-connect/client-meta";
import { metaConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Client" };

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;

export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const client = await getClient(user.id, Number(id));
  if (!client) notFound();

  const isAgency = user.accountType === "agency";
  const meta = metaConfigured() ? await loadClientMeta(user.id, client) : null;
  const conn = meta?.connection ?? null;
  const connected = conn?.connection_status === "connected";
  const startUrl = `/api/meta/oauth/start?client=${client.id}`;
  const errKey = typeof sp.meta_error === "string" ? sp.meta_error : null;
  const justConnected = sp.connected === "1";

  return (
    <div className="flex flex-col gap-6">
      {isAgency && (
        <Link href="/clients" className="flex w-fit items-center gap-1.5 text-[14px] font-bold text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> All clients
        </Link>
      )}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">{client.is_self ? "Your business" : "Client"}</p>
          <h1 className="mt-1 text-[32px] font-extrabold leading-tight">{client.business_name}</h1>
        </div>
        <Chip tone={connected ? "active" : conn ? "stopped" : "paused"}>
          {connected ? "Facebook connected" : conn ? "Connection expired" : "Not connected"}
        </Chip>
      </header>

      {!meta && <Callout tone="error">{META_ERRORS.not_configured} Add the Meta keys to the server environment.</Callout>}
      {errKey && <Callout tone="error">{META_ERRORS[errKey] ?? "Something went wrong with Facebook login."}</Callout>}
      {justConnected && connected && <Callout tone="success">Facebook connected. Now pick the ad account and Page below.</Callout>}
      {meta?.error && <Callout tone="error">{meta.error}</Callout>}

      {/* ------------------------------------------------ Connection */}
      <Card>
        <h2 className="text-[19px] font-extrabold">Facebook connection</h2>
        {connected && conn ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-[15px] text-ink-muted">
              Connected as <strong className="text-ink">{conn.meta_user_name}</strong>
              {conn.source === "invite" && " (via invite link)"} · since {fmtDate(conn.connected_at)}
              {conn.token_expires_at && <> · renews by {fmtDate(conn.token_expires_at)}</>}
            </p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={startUrl} variant="secondary" size="sm" prefetch={false}>
                <RefreshCw className="size-4" aria-hidden /> Reconnect
              </ButtonLink>
              <form action={disconnectAction.bind(null, client.id)}>
                <Button variant="danger" size="sm" type="submit">
                  <Unplug className="size-4" aria-hidden /> Disconnect
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <div className={`mt-4 grid gap-6 ${isAgency && !client.is_self ? "md:grid-cols-2" : ""}`}>
            <div>
              <p className="text-[15px] text-ink-muted">
                {isAgency && !client.is_self
                  ? "If you have access to this client's Facebook, connect it yourself."
                  : "Log in with the Facebook account that manages your business Page and ad account."}
              </p>
              <ButtonLink href={startUrl} className="mt-4" prefetch={false} aria-disabled={!meta}>
                Continue with Facebook
              </ButtonLink>
            </div>
            {isAgency && !client.is_self && (
              <div className="rounded-[10px] bg-lavender-soft p-5">
                <p className="text-[15px] font-bold">Or let the client connect it</p>
                <p className="mb-4 mt-1 text-[14px] text-ink-muted">
                  Send a link — they log in with Facebook and pick their Page and ad account. No Shryxa account needed.
                </p>
                <InviteLink clientId={client.id} businessName={client.business_name ?? "your business"} />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* --------------------------------------------- Asset picker */}
      {connected && meta?.discovery && (
        <Card>
          <h2 className="text-[19px] font-extrabold">Ad account &amp; Page</h2>
          <p className="mb-5 mt-1 text-[15px] text-ink-muted">Choose what this business&apos;s ads run from.</p>
          <AssetPicker
            action={saveAssetsAction.bind(null, client.id)}
            adAccounts={meta.discovery.adAccounts}
            pages={meta.discovery.pages}
            pixels={meta.pixels}
            current={{
              adAccountId: client.ad_account_id,
              pageId: client.page_id,
              instagramId: client.instagram_actor_id,
              pixelId: client.pixel_id,
            }}
          />
        </Card>
      )}

      {/* ----------------------------------------------- Readiness */}
      {meta && (
        <Card>
          <h2 className="mb-4 text-[19px] font-extrabold">Ready to advertise?</h2>
          <ReadinessList items={meta.readiness} />
          {meta.health && (
            <dl className="mt-6 grid gap-3 rounded-[10px] bg-lavender-soft p-5 text-[14px] sm:grid-cols-3">
              <Stat label="Spent (lifetime)" value={money(meta.health.amountSpent, meta.health.currency)} />
              <Stat label="Balance due" value={money(meta.health.balance, meta.health.currency)} />
              <Stat label="Spend limit" value={meta.health.spendCap === null ? "No limit" : money(meta.health.spendCap, meta.health.currency)} />
            </dl>
          )}
        </Card>
      )}

      {isAgency && !client.is_self && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-extrabold">Remove client</h2>
            <p className="text-[14px] text-ink-muted">Deletes the client and its stored Facebook token. Ads on Meta are not touched.</p>
          </div>
          <form action={deleteClientAction.bind(null, client.id)}>
            <Button variant="danger" size="sm" type="submit">
              <Trash2 className="size-4" aria-hidden /> Remove client
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}

function money(v: number | null, currency: string) {
  if (v === null) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] font-bold text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[19px] font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}
