import { Heart, MessageCircle, Send, MoreHorizontal, Play } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Stylised, illustrative ad placements (fictional advertiser "Bloom Café").
 * Pure markup + patterns — no stock imagery, no platform logos.
 */

function Creative({ className, variant = "a", fill = false }: { className?: string; variant?: "a" | "b" | "c"; fill?: boolean }) {
  const v = {
    a: { bg: "bg-chartreuse", pat: "pattern-dots text-ink/15", blob: "bg-tomato", ring: "bg-lavender" },
    b: { bg: "bg-lavender", pat: "pattern-stripes text-paper/35", blob: "bg-chartreuse", ring: "bg-tomato" },
    c: { bg: "bg-tomato", pat: "pattern-checker text-ink/10", blob: "bg-lavender", ring: "bg-chartreuse" },
  }[variant];
  return (
    <div className={cn(fill ? "absolute inset-0" : "relative", "overflow-hidden", v.bg, className)} aria-hidden>
      <div className={cn("absolute inset-0", v.pat)} />
      <div className={cn("absolute -right-6 -bottom-8 size-32 rounded-full", v.blob)} />
      <div className={cn("absolute right-6 top-1/4 size-14 rounded-full ring-8 ring-paper/60", v.ring)} />
      <p className="absolute bottom-4 left-4 max-w-[70%] text-[22px] font-extrabold leading-[1.05] text-ink">
        weekend brunch, 20% off.
      </p>
    </div>
  );
}

function Advertiser({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-full bg-ink text-[11px] font-extrabold text-chartreuse">BC</span>
      <div className="leading-tight">
        <p className={cn("text-[13px] font-bold", dark ? "text-paper" : "text-ink")}>Bloom Café</p>
        <p className={cn("text-[11px]", dark ? "text-paper/70" : "text-ink-muted")}>Sponsored</p>
      </div>
    </div>
  );
}

export function FeedMockup({ className }: { className?: string }) {
  return (
    <div className={cn("w-[300px] overflow-hidden rounded-[14px] bg-paper shadow-[0_24px_60px_-20px_rgb(42_39_51/0.45)]", className)}>
      <div className="flex items-center justify-between p-3">
        <Advertiser />
        <MoreHorizontal className="size-4 text-ink-muted" aria-hidden />
      </div>
      <p className="px-3 pb-3 text-[13px] leading-snug text-ink">
        Fresh sourdough, slow coffee, sunny tables. Book your weekend spot ☕
      </p>
      <Creative className="aspect-square" />
      <div className="flex items-center justify-between bg-lavender-soft px-3 py-2.5">
        <div className="leading-tight">
          <p className="text-[11px] uppercase text-ink-muted">bloomcafe.in</p>
          <p className="text-[13px] font-bold">Reserve a table</p>
        </div>
        <span className="rounded-[6px] bg-ink px-3 py-1.5 text-[12px] font-bold text-paper">Book now</span>
      </div>
      <div className="flex gap-4 px-3 py-2.5 text-ink" aria-hidden>
        <Heart className="size-4" />
        <MessageCircle className="size-4" />
        <Send className="size-4" />
      </div>
    </div>
  );
}

export function StoryMockup({ className, variant = "b" }: { className?: string; variant?: "a" | "b" | "c" }) {
  return (
    <div className={cn("relative h-[440px] w-[248px] overflow-hidden rounded-[22px] bg-ink shadow-[0_24px_60px_-20px_rgb(42_39_51/0.5)]", className)}>
      <Creative fill variant={variant} />
      <div className="absolute inset-x-3 top-3 h-1 rounded-pill bg-paper/40">
        <div className="h-full w-2/3 rounded-pill bg-paper" />
      </div>
      <div className="absolute left-3 top-7">
        <Advertiser />
      </div>
      <div className="absolute inset-x-6 bottom-5 rounded-pill bg-paper py-2.5 text-center text-[13px] font-bold text-ink">
        Book now ↑
      </div>
    </div>
  );
}

export function ReelsMockup({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-[440px] w-[248px] overflow-hidden rounded-[22px] bg-ink shadow-[0_24px_60px_-20px_rgb(42_39_51/0.5)]", className)}>
      <Creative fill variant="c" />
      <div className="absolute inset-0 grid place-items-center">
        <span className="grid size-16 place-items-center rounded-full bg-paper/85">
          <Play className="ml-1 size-7 fill-ink text-ink" aria-hidden />
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-4 pt-16">
        <Advertiser dark />
        <p className="mt-2 text-[12px] text-paper/90">Our weekend brunch in 15 seconds.</p>
        <div className="mt-3 rounded-[6px] bg-paper/95 py-2 text-center text-[12px] font-bold text-ink">Book now</div>
      </div>
    </div>
  );
}

export function RightColumnMockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-[300px] flex-col gap-3 rounded-[14px] bg-paper p-3 shadow-[0_24px_60px_-20px_rgb(42_39_51/0.45)]", className)}>
      <p className="text-[12px] font-bold text-ink-muted">Sponsored</p>
      {(["a", "b"] as const).map((v, i) => (
        <div key={v} className="flex gap-3">
          <Creative className="size-24 shrink-0 rounded-[8px] [&_p]:hidden" variant={v} />
          <div className="leading-snug">
            <p className="text-[13px] font-bold">{i ? "Bloom Café — catering" : "Weekend brunch, 20% off"}</p>
            <p className="text-[11px] text-ink-muted">bloomcafe.in</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LeadFormMockup({ className }: { className?: string }) {
  return (
    <div className={cn("w-[260px] overflow-hidden rounded-[22px] bg-paper shadow-[0_24px_60px_-20px_rgb(42_39_51/0.5)]", className)}>
      <Creative className="h-28 [&_p]:hidden" variant="a" />
      <div className="flex flex-col gap-3 p-4">
        <Advertiser />
        <p className="text-[15px] font-extrabold leading-tight">Get a table for your group</p>
        {["Full name", "Phone number", "Party size"].map((f) => (
          <div key={f} className="rounded-[6px] bg-lavender-soft px-3 py-2 text-[12px] text-ink-muted">
            {f}
          </div>
        ))}
        <div className="rounded-pill bg-ink py-2.5 text-center text-[13px] font-bold text-paper">Submit</div>
      </div>
    </div>
  );
}
