import { ArrowUpRight, CheckCircle2, AlertTriangle, Circle, MinusCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReadinessItem } from "@/features/meta-connect/discovery";

const ICON = {
  ok: { Icon: CheckCircle2, cls: "text-ink bg-chartreuse", label: "Done" },
  warn: { Icon: AlertTriangle, cls: "text-tomato-700 bg-tomato-soft", label: "Needs attention" },
  todo: { Icon: Circle, cls: "text-ink bg-lavender", label: "To do" },
  optional: { Icon: MinusCircle, cls: "text-ink-muted bg-lavender-soft", label: "Optional" },
} as const;

export function ReadinessList({ items }: { items: ReadinessItem[] }) {
  const required = items.filter((i) => i.state !== "optional");
  const done = required.filter((i) => i.state === "ok").length;
  const ready = done === required.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] font-extrabold">{ready ? "Ready to advertise 🎉" : `${done} of ${required.length} steps done`}</p>
        <div className="h-2 w-40 overflow-hidden rounded-pill bg-lavender/40" aria-hidden>
          <div className="h-full rounded-pill bg-chartreuse transition-all" style={{ width: `${(done / required.length) * 100}%` }} />
        </div>
      </div>
      <ul className="mt-5 divide-y divide-line">
        {items.map((it) => {
          const { Icon, cls, label } = ICON[it.state];
          return (
            <li key={it.key} className="flex flex-wrap items-start gap-4 py-4 sm:flex-nowrap">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", cls)}>
                <Icon className="size-5" aria-hidden />
                <span className="sr-only">{label}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold">{it.label}</p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-ink-muted">{it.detail}</p>
              </div>
              {it.action && it.state !== "ok" && (
                <a
                  href={it.action.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-pill px-3 py-1.5 text-[13px] font-bold text-tomato-700 ring-1 ring-inset ring-line hover:bg-tomato-soft"
                >
                  {it.action.label} <ArrowUpRight className="size-4" aria-hidden />
                  <span className="sr-only">(opens Meta in a new tab)</span>
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
