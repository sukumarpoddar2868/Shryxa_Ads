import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckCircle2, Lock, ShieldCheck, Eye } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/surface";
import { AuthFrame } from "@/components/shell/auth-frame";
import { AssetPicker } from "@/features/clients/components/asset-picker";
import { saveInviteAssetsAction } from "@/features/clients/actions";
import { getClient } from "@/features/clients/data";
import { loadClientMeta, META_ERRORS } from "@/features/meta-connect/client-meta";
import { resolveInvite } from "@/features/meta-connect/store";
import { metaConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Connect Facebook", robots: { index: false, follow: false } };

export default function InvitePage(props: PageProps<"/connect/[token]">) {
  return (
    <Suspense fallback={<AuthFrame title="Connect Facebook" subtitle="Loading your invite…">{null}</AuthFrame>}>
      <Invite {...props} />
    </Suspense>
  );
}

async function Invite({ params, searchParams }: PageProps<"/connect/[token]">) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const invite = await resolveInvite(token);
  const errKey = typeof sp.meta_error === "string" ? sp.meta_error : null;

  if (!invite) {
    return (
      <AuthFrame title="This link has expired" subtitle="Invite links work for 7 days.">
        <Callout>Ask whoever sent it to create a new invite link for you.</Callout>
      </AuthFrame>
    );
  }

  if (invite.usedAt) {
    return (
      <AuthFrame title="You're all set" subtitle={`${invite.businessName} is connected.`}>
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-[15px] font-bold">
            <CheckCircle2 className="size-5 text-lavender-deep" aria-hidden /> Facebook connected and assets chosen.
          </p>
          <p className="text-[15px] text-ink-muted">
            {invite.agencyEmail} can now prepare ads for {invite.businessName}. You can remove access any time from your Facebook
            settings (Business integrations).
          </p>
        </div>
      </AuthFrame>
    );
  }

  const client = await getClient(invite.userId, invite.clientId);
  const meta = client && metaConfigured() ? await loadClientMeta(invite.userId, client) : null;
  const connected = meta?.connection?.connection_status === "connected";

  return (
    <AuthFrame
      title={connected ? "Pick your ad account & Page" : `Connect Facebook for ${invite.businessName}`}
      subtitle={connected ? "Last step — choose what the ads should run from." : `${invite.agencyEmail} invited you to connect.`}
    >
      <div className="flex flex-col gap-5">
        {errKey && <Callout tone="error">{META_ERRORS[errKey] ?? "Something went wrong with Facebook login."}</Callout>}
        {!metaConfigured() && <Callout tone="error">{META_ERRORS.not_configured}</Callout>}
        {meta?.error && connected === false && meta.connection && <Callout tone="error">{meta.error}</Callout>}

        {connected && meta?.discovery && client ? (
          <AssetPicker
            action={saveInviteAssetsAction.bind(null, token)}
            adAccounts={meta.discovery.adAccounts}
            pages={meta.discovery.pages}
            pixels={meta.pixels}
            current={{
              adAccountId: client.ad_account_id,
              pageId: client.page_id,
              instagramId: client.instagram_actor_id,
              pixelId: client.pixel_id,
            }}
            submitLabel="Finish"
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3 text-[15px]">
              <li className="flex gap-3">
                <Eye className="mt-0.5 size-5 shrink-0 text-lavender-deep" aria-hidden />
                You choose which Page and ad account to share — nothing else.
              </li>
              <li className="flex gap-3">
                <Lock className="mt-0.5 size-5 shrink-0 text-lavender-deep" aria-hidden />
                We never see your Facebook password.
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-lavender-deep" aria-hidden />
                Ads are created paused — nothing spends without approval.
              </li>
            </ul>
            <ButtonLink href={`/api/meta/oauth/start?invite=${encodeURIComponent(token)}`} size="lg" prefetch={false}>
              Continue with Facebook
            </ButtonLink>
          </>
        )}
      </div>
    </AuthFrame>
  );
}
