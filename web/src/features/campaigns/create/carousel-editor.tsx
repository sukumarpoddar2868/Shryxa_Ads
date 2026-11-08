"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { generateCardsAction } from "../ai/actions";
import { deleteMediaAction } from "../media/actions";
import { MediaSlot } from "../media/media-slot";
import { CAROUSEL_MAX, CAROUSEL_MIN, type Draft, type DraftCard } from "./blueprint";
import type { SectionProps } from "./create-campaign";

const newCard = (headline = "", description = ""): DraftCard => ({
  id: `c${Date.now()}${Math.floor(Math.random() * 1e4)}`,
  headline,
  description,
  link: "",
});

/** Starter cards when switching to carousel: AI ideas from Start, else 3 blanks (first = ad headline). */
export function starterCards(ideas: { headline: string; description: string }[], headline: string): DraftCard[] {
  if (ideas.length >= CAROUSEL_MIN) return ideas.slice(0, 4).map((i) => newCard(i.headline, i.description));
  return [newCard(headline), newCard(), newCard()];
}

/** 2–10 cards, each with image, headline, optional description and link. */
export function CarouselEditor({ draft, update }: Pick<SectionProps, "draft" | "update">) {
  const { cards, optimizeOrder, endCard } = draft.ad.carousel;
  const website = draft.ad.destination === "website";
  const [writing, startWriting] = useTransition();
  const [aiError, setAiError] = useState<string | null>(null);

  const writeWithAi = () => {
    if (!draft.clientId) return setAiError("Choose a client in Start first.");
    setAiError(null);
    startWriting(async () => {
      const r = await generateCardsAction({
        clientId: draft.clientId!,
        businessName: draft.setup.businessName,
        about: draft.setup.about,
        offer: draft.setup.offer,
        destination: draft.ad.destination,
        objective: draft.objective ?? undefined,
        count: cards.length,
      });
      if (!r.ok) return setAiError(r.error);
      // Keep images, links and order; replace the text.
      update((d) => ({
        ...d,
        ad: {
          ...d.ad,
          carousel: {
            ...d.ad.carousel,
            cards: d.ad.carousel.cards.map((c, i) => (r.cards[i] ? { ...c, headline: r.cards[i].headline, description: r.cards[i].description } : c)),
          },
        },
      }));
    });
  };

  const setCarousel = (patch: Partial<Draft["ad"]["carousel"]>) =>
    update((d) => ({ ...d, ad: { ...d.ad, carousel: { ...d.ad.carousel, ...patch } } }));
  const setCard = (id: string, patch: Partial<DraftCard>) => setCarousel({ cards: cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const move = (i: number, by: -1 | 1) => {
    const next = [...cards];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setCarousel({ cards: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" onClick={writeWithAi} disabled={writing} aria-busy={writing}>
          <Sparkles className="size-4" aria-hidden />
          {writing ? "Writing cards…" : "Write cards with AI"}
        </Button>
        <span className="text-[13px] text-ink-muted">Fills a different service or benefit on each card. Images stay.</span>
      </div>
      {aiError && <Callout tone="error">{aiError}</Callout>}
      <ol className="flex flex-col gap-3">
        {cards.map((c, i) => {
          const over = c.headline.length > 40;
          return (
            <li key={c.id} className="flex flex-col gap-3 rounded-card bg-lavender-soft p-4 sm:flex-row">
              <div className="flex items-start gap-3 sm:flex-col">
                <span className="grid size-6 place-items-center rounded-full bg-ink text-[12px] font-bold text-paper">{i + 1}</span>
                <MediaSlot
                  compact
                  clientId={draft.clientId}
                  kind="image"
                  aspect="1:1"
                  label={`card ${i + 1} image`}
                  value={c.image}
                  onChange={(image) => setCard(c.id, { image })}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${c.id}-h`} className="text-[13px] font-bold">
                    Card {i + 1} headline
                  </label>
                  <Input
                    id={`${c.id}-h`}
                    className="bg-paper"
                    value={c.headline}
                    aria-invalid={over || undefined}
                    placeholder={i === 0 ? "e.g. Salaried ITR from ₹999" : "e.g. GST filing for shops"}
                    onChange={(e) => setCard(c.id, { headline: e.target.value })}
                  />
                  <p className={cn("self-end text-[12px] tabular-nums", over ? "text-tomato-700" : "text-ink-muted")}>{c.headline.length} / 40</p>
                </div>
                <div className={cn("grid gap-2", website && "sm:grid-cols-2")}>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${c.id}-d`} className="text-[13px] font-bold">
                      Description (optional)
                    </label>
                    <Input id={`${c.id}-d`} className="bg-paper" value={c.description} maxLength={125} onChange={(e) => setCard(c.id, { description: e.target.value })} />
                  </div>
                  {website && (
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${c.id}-l`} className="text-[13px] font-bold">
                        Link (optional)
                      </label>
                      <Input id={`${c.id}-l`} className="bg-paper" type="url" value={c.link} placeholder={draft.ad.url || "https://"} onChange={(e) => setCard(c.id, { link: e.target.value })} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-1 sm:flex-col">
                <IconButton label={`Move card ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" aria-hidden />
                </IconButton>
                <IconButton label={`Move card ${i + 1} down`} disabled={i === cards.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" aria-hidden />
                </IconButton>
                <IconButton label={`Remove card ${i + 1}`} disabled={cards.length <= CAROUSEL_MIN} onClick={() => {
                    if (c.image) {
                      URL.revokeObjectURL(c.image.previewUrl);
                      void deleteMediaAction(c.image.path);
                    }
                    setCarousel({ cards: cards.filter((x) => x.id !== c.id) });
                  }}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={() => setCarousel({ cards: [...cards, newCard()] })} disabled={cards.length >= CAROUSEL_MAX}>
          <Plus className="size-4" aria-hidden /> Add card
        </Button>
        <p className="text-[13px] text-ink-muted">
          {cards.length} of {CAROUSEL_MAX} cards · each image 1080×1080 (1:1)
        </p>
      </div>

      <div className="flex flex-col gap-2 text-[14px]">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1 size-4 accent-lavender-deep" checked={optimizeOrder} onChange={(e) => setCarousel({ optimizeOrder: e.target.checked })} />
          <span>
            <strong>Show best-performing cards first</strong>
            <span className="block text-[13px] text-ink-muted">Meta reorders cards automatically. Turn off if the order tells a story.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1 size-4 accent-lavender-deep" checked={endCard} onChange={(e) => setCarousel({ endCard: e.target.checked })} />
          <span>
            <strong>Add an end card with your Page profile</strong>
            <span className="block text-[13px] text-ink-muted">A last card showing the Page picture and name.</span>
          </span>
        </label>
      </div>
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-full text-ink hover:bg-paper disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
