"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pause, Play, Square, Wallet, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { setCampaignStatusAction, updateBudgetAction, updateSpendCapAction, type ManageResult } from "./actions";

type Props = {
  clientId: number;
  campaignId: string;
  name: string;
  configuredStatus: string | null;
  currency: string;
  budget: { amount: number; type: "daily" | "lifetime" } | null;
  spendCap: number | null;
};

type Panel = null | "budget" | "cap" | "stop";

/** Pause / resume toggle + a menu for budget, spend cap and stop. */
export function CampaignRowActions(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [result, setResult] = useState<ManageResult | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const archived = p.configuredStatus === "ARCHIVED" || p.configuredStatus === "DELETED";
  const running = p.configuredStatus === "ACTIVE";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const run = (fn: () => Promise<ManageResult>, closeAfter = true) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        router.refresh();
        if (closeAfter) {
          setPanel(null);
          dialog.current?.close();
        }
      }
    });

  const openPanel = (x: Exclude<Panel, null>) => {
    setOpen(false);
    setResult(null);
    setPanel(x);
    dialog.current?.showModal();
  };

  if (archived) return null;

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setCampaignStatusAction(p.clientId, p.campaignId, running ? "pause" : "resume"), false)}
        title={running ? "Pause" : "Turn on"}
        aria-label={running ? `Pause ${p.name}` : `Turn on ${p.name}`}
        className="inline-grid size-8 place-items-center rounded-full hover:bg-lavender-soft disabled:opacity-50"
      >
        {running ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
      </button>

      <div className="relative" ref={menu}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`More actions for ${p.name}`}
          className="inline-grid size-8 place-items-center rounded-full hover:bg-lavender-soft"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
        {open && (
          <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-card bg-paper p-1 text-left shadow-lg ring-1 ring-line">
            <MenuItem icon={Wallet} label="Edit budget" onClick={() => openPanel("budget")} disabled={!p.budget} />
            <MenuItem icon={Gauge} label="Spend cap" onClick={() => openPanel("cap")} />
            <MenuItem icon={Square} label="Stop campaign" onClick={() => openPanel("stop")} danger />
          </div>
        )}
      </div>

      {result && !panel && (
        <span role="status" className={result.ok ? "sr-only" : "max-w-[220px] text-[12px] text-tomato-700"}>
          {result.ok ? result.message : result.error}
        </span>
      )}

      <dialog
        ref={dialog}
        onClose={() => setPanel(null)}
        className="m-auto w-[min(420px,calc(100vw-32px))] rounded-card bg-paper p-0 text-ink backdrop:bg-ink/40"
      >
        {panel && (
          <div className="flex flex-col gap-4 p-6 text-left">
            <h2 className="text-[19px] font-extrabold">
              {panel === "budget" ? "Edit budget" : panel === "cap" ? "Spend cap" : "Stop this campaign?"}
            </h2>
            <p className="truncate text-[13px] text-ink-muted">{p.name}</p>
            {panel === "budget" && p.budget && (
              <AmountForm
                id={`budget-${p.campaignId}`}
                label={`${p.budget.type === "daily" ? "Daily" : "Total"} budget (${p.currency})`}
                initial={p.budget.amount}
                hint="Takes effect right away. Big changes can restart Meta's learning phase."
                submit="Save budget"
                pending={pending}
                onSubmit={(n) => run(() => updateBudgetAction(p.clientId, p.campaignId, n))}
              />
            )}
            {panel === "cap" && (
              <>
                <AmountForm
                  id={`cap-${p.campaignId}`}
                  label={`Stop after spending in total (${p.currency})`}
                  initial={p.spendCap ?? undefined}
                  hint="The campaign stops delivering once it has spent this much since it started."
                  submit="Save spend cap"
                  pending={pending}
                  onSubmit={(n) => run(() => updateSpendCapAction(p.clientId, p.campaignId, n))}
                />
                {p.spendCap !== null && (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => updateSpendCapAction(p.clientId, p.campaignId, null))}>
                    Remove spend cap
                  </Button>
                )}
              </>
            )}
            {panel === "stop" && (
              <>
                <p className="text-[15px]">Stopping archives the campaign on Meta. It stops spending for good and can&apos;t be turned back on. Its results stay in your reports.</p>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => dialog.current?.close()}>
                    Keep it
                  </Button>
                  <Button variant="danger" disabled={pending} onClick={() => run(() => setCampaignStatusAction(p.clientId, p.campaignId, "stop"))}>
                    {pending ? "Stopping…" : "Stop campaign"}
                  </Button>
                </div>
              </>
            )}
            {result && !result.ok && <Callout tone="error">{result.error}</Callout>}
            {panel !== "stop" && (
              <Button variant="ghost" size="sm" className="self-end" onClick={() => dialog.current?.close()}>
                Cancel
              </Button>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick, disabled, danger }: { icon: typeof Pause; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-[14px] font-bold hover:bg-lavender-soft disabled:opacity-40 ${danger ? "text-tomato-700" : ""}`}
    >
      <Icon className="size-4" aria-hidden /> {label}
    </button>
  );
}

function AmountForm(props: { id: string; label: string; initial?: number; hint: string; submit: string; pending: boolean; onSubmit: (n: number) => void }) {
  const [value, setValue] = useState(props.initial ? String(props.initial) : "");
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n > 0;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) props.onSubmit(Math.round(n * 100) / 100);
      }}
    >
      <Field id={props.id} label={props.label} hint={props.hint}>
        <Input id={props.id} inputMode="decimal" type="number" min="1" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
      </Field>
      <Button type="submit" disabled={!valid || props.pending}>
        {props.pending ? "Saving…" : props.submit}
      </Button>
    </form>
  );
}
