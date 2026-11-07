"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Callout, Chip } from "@/components/ui/surface";
import type { AdAccountOption, PageOption } from "@/features/meta-connect/discovery";
import type { ImportState } from "../import";
import { cn } from "@/lib/cn";

type Props = {
  action: (prev: ImportState, form: FormData) => Promise<ImportState>;
  adAccounts: AdAccountOption[];
  pages: PageOption[];
  /** ad_account_id (digits) → existing client */
  claimed: Record<string, { id: number; name: string }>;
  slotsLeft: number;
};

/** Pick which Business Manager ad accounts become clients, with a Page each. */
export function ImportForm({ action, adAccounts, pages, claimed, slotsLeft }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const available = adAccounts.filter((a) => !claimed[a.accountId]);
  const overLimit = ticked.size > slotsLeft;

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {state.created && state.created.length > 0 && (
        <Callout tone="success">
          Imported {state.created.length} client{state.created.length === 1 ? "" : "s"}:{" "}
          {state.created.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ", "}
              <Link href={`/clients/${c.id}`} className="font-bold underline">
                {c.name}
              </Link>
            </span>
          ))}
          .
        </Callout>
      )}
      {state.skipped && state.skipped.length > 0 && (
        <Callout tone="error">
          Skipped: {state.skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}
        </Callout>
      )}
      {state.error && <Callout tone="error">{state.error}</Callout>}

      <ul className="divide-y divide-line rounded-card bg-paper">
        {adAccounts.map((a) => {
          const existing = claimed[a.accountId];
          const on = ticked.has(a.accountId);
          return (
            <li key={a.id} className={cn("grid gap-3 p-5 md:grid-cols-[auto_1.2fr_1fr_1fr] md:items-center", on && "bg-chartreuse-soft")}>
              <input
                type="checkbox"
                name={`include:${a.accountId}`}
                checked={on}
                onChange={() => toggle(a.accountId)}
                disabled={Boolean(existing)}
                aria-label={`Import ${a.name}`}
                className="size-5 accent-[var(--color-ink)]"
              />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{a.name}</p>
                <p className="truncate text-[13px] text-ink-muted">
                  {a.currency} · ID {a.accountId}
                  {a.businessName ? ` · ${a.businessName}` : ""}
                </p>
              </div>
              {existing ? (
                <div className="md:col-span-2">
                  <Chip tone="active">Already a client</Chip>{" "}
                  <Link href={`/clients/${existing.id}`} className="text-[13px] font-bold text-tomato-700 hover:underline">
                    {existing.name}
                  </Link>
                </div>
              ) : (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-bold text-ink-muted">Client name</span>
                    <Input name={`name:${a.accountId}`} defaultValue={a.name} disabled={!on} className="h-10" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] font-bold text-ink-muted">Facebook Page</span>
                    <Select name={`page:${a.accountId}`} defaultValue={pages.length === 1 ? pages[0].id : ""} disabled={!on} className="h-10">
                      <option value="">Choose later</option>
                      {pages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.instagram ? ` · @${p.instagram.username}` : ""}
                        </option>
                      ))}
                    </Select>
                  </label>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending || ticked.size === 0 || overLimit}>
          {pending ? "Importing…" : `Import ${ticked.size || ""} client${ticked.size === 1 ? "" : "s"}`.replace("  ", " ")}
        </Button>
        <p className={cn("text-[13px]", overLimit ? "font-bold text-tomato-700" : "text-ink-muted")}>
          {available.length === 0
            ? "Every ad account here is already a client."
            : overLimit
              ? `Your plan has room for ${slotsLeft} more client${slotsLeft === 1 ? "" : "s"}. Untick some or upgrade.`
              : `${slotsLeft} client slot${slotsLeft === 1 ? "" : "s"} left on your plan.`}
        </p>
      </div>
    </form>
  );
}
