import type { Metadata } from "next";
import { Mail, MessageCircle } from "lucide-react";
import { Callout, Card, Chip } from "@/components/ui/surface";
import { CancelPlanButton, SubscribeButton } from "@/features/account/components/billing-buttons";
import { DeleteAccountForm, PasswordForm } from "@/features/account/components/account-forms";
import { requireUser } from "@/features/auth/dal";
import { enforceBilling, getAccess } from "@/features/billing/access";
import { TIERS, tierLabel, type AccessState } from "@/features/billing/plans";
import { formatPrice, starterPrice } from "@/features/billing/pricing";
import { countClients } from "@/features/clients/data";
import { CONTACT } from "@/features/legal/content";
import { billingConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Account" };

const STATE: Record<AccessState, { label: string; tone: "active" | "paused" | "stopped" | "neutral" }> = {
  trial: { label: "Free trial", tone: "neutral" },
  active: { label: "Active", tone: "active" },
  past_due: { label: "Payment failed", tone: "stopped" },
  canceled: { label: "Cancelled", tone: "paused" },
  expired: { label: "Ended", tone: "stopped" },
};

const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(iso)) : "—");

export default async function AccountPage() {
  const user = await requireUser();
  // Lapsed → campaigns get paused; paid again → resumed. Only does Meta work on a change.
  await enforceBilling(user.id).catch(() => undefined);
  const [access, used, price] = await Promise.all([getAccess(user.id), countClients(user.id), starterPrice(user.currency)]);
  const s = STATE[access.state];
  const canSubscribe = !user.isAdmin && user.tier === "starter" && !(access.state === "active" && access.allowed && access.subscriptionId);
  const tier = TIERS[user.tier as keyof typeof TIERS];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Settings</p>
        <h1 className="mt-1 text-[32px] font-extrabold leading-tight">account</h1>
      </header>

      {!access.allowed && (
        <Callout tone="error">
          <strong>Your {access.state === "trial" || access.state === "expired" ? "trial" : "plan"} has ended.</strong> Running campaigns were paused. Choose a plan below to launch and turn campaigns back on.
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[19px] font-extrabold">{tierLabel(user.tier)} plan</h2>
            <Chip tone={s.tone}>{user.isAdmin ? "Admin" : s.label}</Chip>
          </div>
          <dl className="grid gap-4 text-[14px] sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">{user.accountType === "agency" ? "Clients" : "Businesses"}</dt>
              <dd className="mt-1 text-[22px] font-extrabold tabular-nums">
                {used} <span className="text-[15px] font-bold text-ink-muted">/ {user.clientLimit}</span>
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">{access.state === "trial" ? "Trial ends" : access.state === "active" ? "Renews" : "Access until"}</dt>
              <dd className="mt-1 text-[15px] font-bold">
                {user.isAdmin ? "—" : date(access.state === "trial" ? access.trialEndsAt : access.periodEnd)}
                {access.daysLeft !== null && access.allowed && !user.isAdmin && (
                  <span className="block text-[13px] font-normal text-ink-muted">
                    {access.daysLeft} day{access.daysLeft === 1 ? "" : "s"} left
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {canSubscribe && (
            <div className="flex flex-col gap-3 rounded-card bg-lavender-soft p-5">
              <p className="text-[15px]">
                <strong className="text-[22px] font-extrabold">{formatPrice(price.amount, price.currency)}</strong> / {price.period} · Starter: 1 {user.accountType === "agency" ? "client" : "business"}, every campaign type, dashboard and lead inbox. Ad spend is paid to Meta separately.
              </p>
              {billingConfigured() ? (
                <SubscribeButton label={access.state === "trial" ? "Subscribe now" : "Choose Starter"} />
              ) : (
                <p className="text-[14px] text-ink-muted">Online payment is being set up — message us below to upgrade.</p>
              )}
            </div>
          )}
          {access.subscriptionId && access.state === "active" && !user.isAdmin && <CancelPlanButton />}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-[19px] font-extrabold">More clients?</h2>
          <p className="text-[15px] text-ink-muted">
            Agency plans: {Object.values(TIERS).slice(1).map((t) => `${t.label} (${t.clients} clients)`).join(" · ")}. Billed by invoice — message us and we&apos;ll switch your plan within 24 hours.
          </p>
          <a href={`mailto:${CONTACT.email}?subject=${encodeURIComponent("Agency plan for " + user.email)}`} className="flex items-center gap-2 text-[14px] font-bold hover:text-tomato-700">
            <Mail className="size-4" aria-hidden /> {CONTACT.email}
          </a>
          <a href={`https://wa.me/${CONTACT.whatsapp.replace(/\D/g, "")}`} className="flex items-center gap-2 text-[14px] font-bold hover:text-tomato-700">
            <MessageCircle className="size-4" aria-hidden /> {CONTACT.whatsapp}
          </a>
          {tier && user.tier !== "starter" && <p className="text-[13px] text-ink-muted">You&apos;re on {tier.label}.</p>}
        </Card>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[19px] font-extrabold">Profile</h2>
        <dl className="grid gap-3 text-[14px] sm:grid-cols-3">
          <div>
            <dt className="text-ink-muted">Email</dt>
            <dd className="mt-1 break-all font-bold">{user.email}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Account type</dt>
            <dd className="mt-1 font-bold">{user.accountType === "agency" ? "Agency" : "Business"}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Billing currency</dt>
            <dd className="mt-1 font-bold">{user.currency}</dd>
          </div>
        </dl>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[19px] font-extrabold">Password</h2>
        <PasswordForm />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-[19px] font-extrabold">Delete account</h2>
        <p className="max-w-2xl text-[15px] text-ink-muted">Removes everything Shryxa stores about you, including Facebook tokens. You can also remove Shryxa Ads from Facebook → Settings → Apps and websites.</p>
        <DeleteAccountForm email={user.email} />
      </Card>
    </div>
  );
}
