"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { LEVELS, SECTION_ORDER, initialDraft, sectionComplete, type Draft, type SectionId } from "./blueprint";
import { AdPreview } from "./ad-preview";
import { Summary } from "./summary";
import { AudienceSection } from "./audience-section";
import { CreativeSection, NameBudgetSection, PlacementsSection, ReviewSection } from "./sections";
import { StartSection } from "./start-section";

export type ClientOption = {
  id: number;
  name: string;
  ready: boolean;
  adAccountName: string | null;
  pageName: string | null;
  instagramUsername: string | null;
  /** Connected Pixel (needed for Sales / website leads). */
  hasPixel: boolean;
  pixelName: string | null;
  hasInstagram: boolean;
};

export type SectionProps = {
  draft: Draft;
  update: (fn: (d: Draft) => Draft) => void;
  clients: ClientOption[];
  goTo: (id: SectionId) => void;
};

export function CreateCampaign({ clients, isAgency }: { clients: ClientOption[]; isAgency: boolean }) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(clients.length === 1 ? clients[0] : null));
  const [active, setActive] = useState<SectionId>("start");
  const update = (fn: (d: Draft) => Draft) => setDraft(fn);

  const idx = SECTION_ORDER.indexOf(active);
  const prev = SECTION_ORDER[idx - 1];
  const next = SECTION_ORDER[idx + 1];
  const props: SectionProps = { draft, update, clients, goTo: setActive };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_340px]">
      {/* Meta-style structure rail */}
      <nav aria-label="Campaign steps" className="min-w-0 lg:sticky lg:top-10 lg:self-start">
        <ol className="flex gap-4 overflow-x-auto pb-2 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0">
          {LEVELS.map((level) => (
            <li key={level.id} className="shrink-0">
              <p className="px-3 text-[12px] font-bold uppercase tracking-wide text-ink-muted">{level.label}</p>
              <ul className="mt-1.5 flex gap-1 lg:flex-col">
                {level.sections.map((s) => {
                  const done = sectionComplete(s.id, draft);
                  const current = s.id === active;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setActive(s.id)}
                        aria-current={current ? "step" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-pill px-3 py-2 text-left text-[14px] font-bold whitespace-nowrap transition-colors",
                          current ? "bg-ink text-paper" : "text-ink hover:bg-paper",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-full",
                            done ? "bg-chartreuse text-ink" : current ? "ring-1 ring-paper/50" : "ring-1 ring-line",
                          )}
                        >
                          {done && <Check className="size-3.5" strokeWidth={2.5} />}
                        </span>
                        {s.label}
                        {done && <span className="sr-only">(done)</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex min-w-0 flex-col gap-4">
        <Card className="p-6 sm:p-8">
          {active === "start" && <StartSection {...props} isAgency={isAgency} />}
          {active === "name-budget" && <NameBudgetSection {...props} />}
          {active === "audience" && <AudienceSection {...props} />}
          {active === "placements" && <PlacementsSection {...props} />}
          {active === "creative" && <CreativeSection {...props} />}
          {active === "review" && <ReviewSection {...props} />}
        </Card>

        {/* No right panel below xl → show the preview under the form. */}
        {active === "creative" && (
          <Card className="xl:hidden">
            <h2 className="mb-3 text-[17px] font-extrabold">Ad preview</h2>
            <AdPreview draft={draft} client={clients.find((c) => c.id === draft.clientId)} />
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          {prev ? (
            <Button type="button" variant="ghost" onClick={() => setActive(prev)}>
              <ArrowLeft className="size-4" aria-hidden /> Back
            </Button>
          ) : (
            <span />
          )}
          {next && (
            <Button type="button" variant="secondary" onClick={() => setActive(next)}>
              Next <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <aside className="hidden xl:block xl:sticky xl:top-10 xl:self-start" aria-label={active === "creative" ? "Ad preview" : "Campaign summary"}>
        {active === "creative" ? (
          <div className="rounded-card bg-paper/60 p-4">
            <h2 className="mb-3 text-[15px] font-extrabold">Ad preview</h2>
            <AdPreview draft={draft} client={clients.find((c) => c.id === draft.clientId)} />
          </div>
        ) : (
          <Summary draft={draft} clients={clients} />
        )}
      </aside>
    </div>
  );
}
