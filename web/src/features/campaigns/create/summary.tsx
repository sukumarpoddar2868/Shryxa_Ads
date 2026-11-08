import { Card } from "@/components/ui/surface";
import { CURRENCY } from "../engine/presets.ts";
import { DEVICE_LABELS, OBJECTIVE_OPTIONS, type Draft } from "./blueprint";
import type { ClientOption } from "./create-campaign";

/** Live outline of the campaign tree as the user fills it in. */
export function Summary({ draft: d, clients }: { draft: Draft; clients: ClientOption[] }) {
  const client = clients.find((c) => c.id === d.clientId);
  const objective = OBJECTIVE_OPTIONS.find((o) => o.id === d.objective)?.label;
  const amount = Number(d.campaign.amount);
  const sym = CURRENCY[d.campaign.currency].symbol;
  const gender = { any: "All genders", female: "Women", male: "Men" }[d.audience.gender];

  const rows: { level: string; items: [string, string | undefined][] }[] = [
    { level: "Start", items: [["Objective", objective], ["Client", client?.name], ["AI draft", d.generated ? "Ready to review" : undefined]] },
    {
      level: "Campaign",
      items: [
        ["Name", d.campaign.name || undefined],
        ["Budget", amount > 0 ? `${sym}${amount.toLocaleString("en-IN")} ${d.campaign.budgetType === "daily" ? "/ day" : "total"}` : undefined],
      ],
    },
    {
      level: "Ad set",
      items: [
        [
          "Audience",
          d.audience.type === "core"
            ? `Core${d.audience.exclude.length ? ` · ${d.audience.exclude.length} excluded` : ""}`
            : `${d.audience.type === "custom" ? "Custom" : "Lookalike"} · ${d.audience.include.length} picked`,
        ],
        ["Areas", d.audience.locations.length ? `${d.audience.locations.length} area${d.audience.locations.length === 1 ? "" : "s"}` : undefined],
        ["People", `${d.audience.ageMin}–${d.audience.ageMax} · ${gender}${d.audience.device === "all" ? "" : ` · ${DEVICE_LABELS[d.audience.device]}`}`],
        ["Placements", d.placements.mode === "advantage" ? "Advantage+ (automatic)" : [d.placements.facebook && "Facebook", d.placements.instagram && "Instagram"].filter(Boolean).join(" + ") || undefined],
      ],
    },
    {
      level: "Ad",
      items: [
        ["Goes to", d.ad.destination === "website" ? d.ad.url || "Website" : "Instant form"],
        ["Format", d.ad.format === "carousel" ? `Carousel · ${d.ad.carousel.cards.length} cards` : d.ad.format === "video" ? "Video" : "Single image"],
        ["Headline", d.ad.format === "carousel" ? d.ad.carousel.cards[0]?.headline || undefined : d.ad.headline || undefined],
      ],
    },
  ];

  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-extrabold">Summary</h2>
      <div className="mt-4 flex flex-col gap-4">
        {rows.map((r) => (
          <section key={r.level}>
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">{r.level}</p>
            <dl className="mt-1.5 space-y-1 text-[13px]">
              {r.items.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className={v ? "truncate text-right font-bold" : "text-ink-muted"}>{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="mt-5 rounded-input bg-lavender-soft px-3 py-2 text-[12px] text-ink-muted">Launches paused — nothing spends until you turn it on.</p>
    </Card>
  );
}
