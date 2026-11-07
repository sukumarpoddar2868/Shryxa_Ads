import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Flat, borderless content tile. Separation comes from surface color. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card bg-paper p-6", className)} {...props} />;
}

type Tone = "active" | "paused" | "stopped" | "neutral";
const tones: Record<Tone, string> = {
  active: "bg-chartreuse text-ink",
  paused: "bg-lavender text-ink",
  stopped: "bg-tomato-soft text-tomato-700",
  neutral: "bg-lavender-soft text-ink",
};

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-pill px-3 py-1 text-xs font-bold", tones[tone])}>
      {children}
    </span>
  );
}

/** Callout bubble — the product's conversational voice. */
export function Callout({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const t = {
    info: "bg-lavender/40 text-ink",
    error: "bg-tomato-soft text-tomato-700",
    success: "bg-chartreuse-soft text-ink",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : undefined} className={cn("rounded-[10px] px-4 py-3 text-sm", t)}>
      {children}
    </div>
  );
}

type Band = "lavender" | "chartreuse" | "paper" | "ink" | "mesh";
const bands: Record<Band, string> = {
  lavender: "bg-lavender grain",
  chartreuse: "bg-chartreuse grain",
  paper: "bg-paper",
  ink: "bg-ink text-paper",
  mesh: "mesh-hero grain",
};

/** Full-bleed brochure section. */
export function Band({ tone, className, children }: { tone: Band; className?: string; children: ReactNode }) {
  return (
    <section className={cn("w-full", bands[tone], className)}>
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 md:py-24">{children}</div>
    </section>
  );
}
