import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Card, Chip } from "@/components/ui/surface";
import { endAccessAction, extendAction, extendTrialAction, setTierAction } from "@/features/admin/actions";
import { requireAdmin } from "@/features/auth/dal";
import { loadAdminUsers } from "@/features/admin/load";
import { TIERS, TIER_KEYS } from "@/features/billing/plans";

export const metadata: Metadata = { title: "Admin" };

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  const list = await loadAdminUsers(q);
  const states = list.map((u) => u.access);
  const count = (st: string) => states.filter((a) => a.state === st).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide text-ink-muted">Restricted</p>
          <h1 className="mt-1 text-[32px] font-extrabold leading-tight">admin</h1>
        </div>
        <form role="search" className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Search email" aria-label="Search users by email" className="h-10 w-64 bg-paper" />
          <Button size="sm" variant="secondary" type="submit">
            Search
          </Button>
        </form>
      </header>

      <div className="flex flex-wrap gap-2 text-[13px]">
        <Chip>{list.length} users</Chip>
        <Chip tone="active">{count("active")} paying</Chip>
        <Chip>{count("trial")} in trial</Chip>
        <Chip tone="stopped">{count("expired") + count("past_due")} lapsed</Chip>
      </div>

      <ul className="flex flex-col gap-3">
        {list.map((u, i) => {
          const a = states[i];
          return (
            <li key={u.id}>
              <Card className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[15px] font-extrabold">{u.email}</p>
                    <Chip tone={a.allowed ? "active" : "stopped"}>{u.isAdmin ? "admin" : a.state}</Chip>
                    <Chip>{TIERS[u.tier as keyof typeof TIERS]?.label ?? u.tier}</Chip>
                  </div>
                  <p className="mt-1 text-[13px] text-ink-muted">
                    #{u.id} · {u.accountType} · {u.currency} · joined {day(u.createdAt)} · trial ends {day(u.trialEndsAt)} · paid until {day(u.periodEnd)}
                    {u.provider ? ` (${u.provider})` : ""}
                  </p>
                  <p className="mt-1 text-[13px] text-ink-muted tabular-nums">
                    {u.clients}/{u.clientLimit} clients · {u.connected} connected · {u.launched} launched · {u.seats} seat(s)
                  </p>
                </div>
                {!u.isAdmin && (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setTierAction} className="flex gap-1">
                      <input type="hidden" name="userId" value={u.id} />
                      <Select name="tier" defaultValue={u.tier} aria-label={`Tier for ${u.email}`} className="h-9 w-44 text-[14px]">
                        {TIER_KEYS.map((t) => (
                          <option key={t} value={t}>
                            {TIERS[t].label} ({TIERS[t].clients})
                          </option>
                        ))}
                      </Select>
                      <Button size="sm" variant="secondary" type="submit">
                        Apply
                      </Button>
                    </form>
                    <form action={extendAction} className="flex gap-1">
                      <input type="hidden" name="userId" value={u.id} />
                      <Input name="days" type="number" min={1} max={366} defaultValue={30} aria-label="Days paid" className="h-9 w-20 text-[14px]" />
                      <Button size="sm" type="submit">
                        Mark paid
                      </Button>
                    </form>
                    <form action={extendTrialAction} className="flex gap-1">
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="days" value={7} />
                      <Button size="sm" variant="ghost" type="submit">
                        Trial +7d
                      </Button>
                    </form>
                    <form action={endAccessAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <Button size="sm" variant="danger" type="submit">
                        End access
                      </Button>
                    </form>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
