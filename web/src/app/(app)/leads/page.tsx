import type { Metadata } from "next";
import Link from "next/link";
import { Download, Inbox } from "lucide-react";
import { Callout, Card, Chip } from "@/components/ui/surface";
import { buttonClass } from "@/components/ui/button";
import { requireUser } from "@/features/auth/dal";
import { ensureSelfClient } from "@/features/clients/data";
import { LeadClientPicker } from "@/features/leads/components/client-picker";
import { clientsWithPages, fieldLabel, leadColumns, leadError, listLeadForms, listLeads, type Lead, type LeadForm } from "@/features/leads/load";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Leads" };

const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "—";

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const sp = await searchParams;
  const user = await requireUser();
  if (user.accountType === "business") await ensureSelfClient(user);
  const clients = await clientsWithPages(user.id);
  const isAgency = user.accountType === "agency";

  const header = (
    <header>
      <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Inbox</p>
      <h1 className="mt-1 text-[32px] font-extrabold leading-tight">leads</h1>
      <p className="mt-1 max-w-2xl text-[15px] text-ink-muted">People who filled in your instant forms, straight from Meta. Meta keeps leads for 90 days — download the CSV to keep them.</p>
    </header>
  );

  if (!clients.length) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Callout>
          Connect Facebook and pick a Page first.{" "}
          <Link href="/clients" className="font-bold text-tomato-700 hover:underline">
            {isAgency ? "Go to clients" : "Connect Facebook"} →
          </Link>
        </Callout>
      </div>
    );
  }

  const wanted = Number(sp.client);
  const client = clients.find((c) => c.id === wanted) ?? clients[0];
  const formParam = typeof sp.form === "string" ? sp.form : "";

  let forms: LeadForm[] = [];
  let error: string | null = null;
  try {
    forms = await listLeadForms(user.id, client.id);
  } catch (e) {
    error = leadError(e);
  }
  const form = forms.find((f) => f.id === formParam) ?? forms[0] ?? null;

  let leads: Lead[] = [];
  if (form && !error) {
    try {
      leads = (await listLeads(user.id, client.id, form.id)).leads;
    } catch (e) {
      error = leadError(e);
    }
  }
  const cols = leadColumns(leads);

  return (
    <div className="flex flex-col gap-6">
      {header}

      {isAgency && clients.length > 1 && <LeadClientPicker clients={clients} value={client.id} />}
      {error && <Callout tone="error">{error}</Callout>}

      {!error && forms.length === 0 && (
        <Card className="flex flex-col items-start gap-3 p-8">
          <Inbox className="size-6" aria-hidden strokeWidth={1.75} />
          <p className="text-[19px] font-extrabold">No instant forms yet</p>
          <p className="max-w-md text-[15px] text-ink-muted">Launch a Leads → Instant form campaign and its form shows up here with every lead.</p>
          <Link href="/campaigns/new" className="text-[14px] font-bold text-tomato-700 hover:underline">
            Create a lead campaign →
          </Link>
        </Card>
      )}

      {forms.length > 0 && (
        <nav aria-label="Forms" className="flex flex-wrap gap-2">
          {forms.map((f) => (
            <Link
              key={f.id}
              href={`/leads?client=${client.id}&form=${f.id}`}
              aria-current={f.id === form?.id ? "page" : undefined}
              className={cn("rounded-pill px-4 py-2 text-[14px] font-bold", f.id === form?.id ? "bg-chartreuse text-ink" : "bg-paper text-ink hover:bg-lavender")}
            >
              {f.name}
              {f.leadsCount !== null && <span className="ml-2 text-ink-muted tabular-nums">{f.leadsCount}</span>}
            </Link>
          ))}
        </nav>
      )}

      {form && !error && (
        <section aria-label={`Leads for ${form.name}`} className="overflow-hidden rounded-card bg-paper">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-extrabold">{form.name}</h2>
              <Chip tone={form.status === "ACTIVE" ? "active" : "neutral"}>{form.status.toLowerCase() || "form"}</Chip>
              <span className="text-[13px] text-ink-muted tabular-nums">
                {leads.length} lead{leads.length === 1 ? "" : "s"}
              </span>
            </div>
            {leads.length > 0 && (
              <a href={`/api/leads/csv?client=${client.id}&form=${form.id}`} className={buttonClass({ variant: "secondary", size: "sm" })} download>
                <Download className="size-4" aria-hidden /> Download CSV
              </a>
            )}
          </div>
          {leads.length === 0 ? (
            <p className="px-4 py-8 text-[15px] text-ink-muted">No leads on this form yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <thead className="bg-lavender-soft text-[12px] font-bold uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-4 py-3">Received</th>
                    {cols.map((c) => (
                      <th key={c} className="px-4 py-3">
                        {fieldLabel(c)}
                      </th>
                    ))}
                    <th className="px-4 py-3">Campaign</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {leads.map((l) => (
                    <tr key={l.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">{when(l.created)}</td>
                      {cols.map((c) => (
                        <td key={c} className="max-w-[260px] px-4 py-3 break-words">
                          {c === "phone_number" && l.fields[c] ? (
                            <a className="font-bold hover:underline" href={`tel:${l.fields[c].replace(/[^\d+]/g, "")}`}>
                              {l.fields[c]}
                            </a>
                          ) : c === "email" && l.fields[c] ? (
                            <a className="font-bold hover:underline" href={`mailto:${l.fields[c]}`}>
                              {l.fields[c]}
                            </a>
                          ) : (
                            (l.fields[c] ?? "—")
                          )}
                        </td>
                      ))}
                      <td className="max-w-[220px] truncate px-4 py-3 text-ink-muted" title={l.campaignName ?? ""}>
                        {l.isOrganic ? "Organic" : (l.campaignName ?? "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
