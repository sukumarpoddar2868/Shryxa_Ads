"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Callout } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { GREETING_MAX, ITEM_MESSAGE_TEMPLATE, MAX_QUESTIONS, PREFILL_MAX, QUESTION_MAX, itemMessage } from "../whatsapp/links";
import type { DraftCard, DraftWhatsApp } from "./blueprint";
import type { SectionProps } from "./create-campaign";
import { Segmented, TextArea } from "./sections";

/** Creative → WhatsApp: greeting, what the customer sends, per-item messages for carousels. */
export function WhatsAppEditor({ draft, update }: Pick<SectionProps, "draft" | "update">) {
  const w = draft.ad.whatsapp;
  const carousel = draft.ad.format === "carousel";
  const set = (patch: Partial<DraftWhatsApp>) => update((d) => ({ ...d, ad: { ...d.ad, whatsapp: { ...d.ad.whatsapp, ...patch } } }));
  const setCard = (id: string, patch: Partial<DraftCard>) =>
    update((d) => ({ ...d, ad: { ...d.ad, carousel: { ...d.ad.carousel, cards: d.ad.carousel.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) } } }));
  const perItem = carousel && w.perItem;

  return (
    <div className="flex flex-col gap-5 rounded-card bg-lavender-soft p-4 sm:p-5">
      <div>
        <p className="text-[15px] font-extrabold">WhatsApp chat</p>
        <p className="text-[13px] text-ink-muted">
          What people see when WhatsApp opens. Messages land on <strong>{draft.ad.whatsappNumber || "your number"}</strong>. Check it in the <strong>WhatsApp</strong> preview tab.
        </p>
      </div>

      {carousel && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-bold">When someone taps a carousel item…</p>
          <div role="radiogroup" aria-label="Carousel WhatsApp mode" className="grid gap-2 sm:grid-cols-2">
            {(
              [
                [false, "Same chat for all items", "Meta chat ad — optimised for conversations. One greeting and message for the whole ad."],
                [true, "Message about that item", "Each item opens WhatsApp with its own message + the item's picture. Runs as a Traffic campaign (optimised for taps)."],
              ] as const
            ).map(([value, title, blurb]) => (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={w.perItem === value}
                onClick={() => set({ perItem: value })}
                className={cn("rounded-card p-4 text-left ring-1 ring-inset", w.perItem === value ? "bg-chartreuse-soft ring-2 ring-ink" : "bg-paper ring-line hover:ring-ink/40")}
              >
                <span className="block text-[14px] font-extrabold">{title}</span>
                <span className="block text-[13px] text-ink-muted">{blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {perItem ? (
        <div className="flex flex-col gap-3">
          <Callout>
            Tapping item 2 opens WhatsApp with e.g. <em>“{itemMessage("", draft.ad.carousel.cards[1]?.headline ?? "Item")}”</em> plus a link that shows the item&apos;s picture — so you know exactly
            what they want. Use <code className="rounded bg-paper px-1">{"{item}"}</code> for the card headline.
          </Callout>
          {draft.ad.carousel.cards.map((c, i) => (
            <Field key={c.id} id={`wa-${c.id}`} label={`Item ${i + 1} · ${c.headline || "untitled"}`}>
              <Input
                id={`wa-${c.id}`}
                className="bg-paper"
                maxLength={PREFILL_MAX}
                placeholder={ITEM_MESSAGE_TEMPLATE}
                value={c.waMessage ?? ""}
                onChange={(e) => setCard(c.id, { waMessage: e.target.value })}
              />
            </Field>
          ))}
        </div>
      ) : (
        <>
          <Field id="wa-greeting" label="Greeting from the business" hint="Shown at the top of the chat. Friendly, with your business name.">
            <TextArea id="wa-greeting" className="bg-paper" rows={2} max={GREETING_MAX} value={w.greeting} onChange={(v) => set({ greeting: v })} />
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold">What the customer sends</span>
            <Segmented
              label="Customer action"
              value={w.style}
              onChange={(v) => set({ style: v })}
              options={[
                { value: "prefill", label: "Pre-filled message" },
                { value: "questions", label: "Quick questions" },
              ]}
            />
            {w.style === "prefill" ? (
              <TextArea
                id="wa-prefill"
                className="bg-paper"
                rows={2}
                max={PREFILL_MAX}
                value={w.prefill}
                placeholder="Hi! I'd like a quote for ITR filing."
                onChange={(v) => set({ prefill: v })}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] text-ink-muted">Up to {MAX_QUESTIONS} buttons the customer can tap to send.</p>
                {w.questions.map((q, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      aria-label={`Quick question ${i + 1}`}
                      className="bg-paper"
                      maxLength={QUESTION_MAX}
                      value={q}
                      onChange={(e) => set({ questions: w.questions.map((x, j) => (j === i ? e.target.value : x)) })}
                    />
                    <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => set({ questions: w.questions.filter((_, j) => j !== i) })} className="grid size-9 shrink-0 place-items-center rounded-full text-tomato-700 hover:bg-paper">
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                ))}
                <Button type="button" variant="ghost" className="self-start" disabled={w.questions.length >= MAX_QUESTIONS} onClick={() => set({ questions: [...w.questions, ""] })}>
                  <Plus className="size-4" aria-hidden /> Add question
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
