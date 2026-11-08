"use client";

import { useState, type ReactNode } from "react";
import { ChevronUp, Heart, Phone, Image as ImageIcon, MessageCircle, MoreHorizontal, Send, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MediaRef } from "../media/rules";
import { itemMessage } from "../whatsapp/links";
import { CONTACT_FIELDS, type Draft } from "./blueprint";
import type { ClientOption } from "./create-campaign";

/**
 * Live, approximate mock of how the ad will look in each placement, built
 * from the draft (text) and the local blob previews of uploaded media.
 * Neutral styling — no platform logos.
 */

type Placement = "fb" | "ig" | "story" | "form" | "whatsapp" | "call";
const TABS: { id: Placement; label: string }[] = [
  { id: "fb", label: "Facebook" },
  { id: "ig", label: "Instagram" },
  { id: "story", label: "Stories" },
];

const CTA_TEXT: Record<string, string> = {
  WHATSAPP_MESSAGE: "Send WhatsApp message",
  MESSAGE_PAGE: "Send message",
  INSTAGRAM_MESSAGE: "Send message",
  CALL_NOW: "Call now",
};
export const ctaLabel = (c: string) => CTA_TEXT[c] ?? c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, " ");

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter((w) => /[a-z0-9]/i.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "AD"
  );
}

/** Image/video fill for a frame, or a neutral placeholder. */
function Media({ media, label, fit = "cover", className }: { media?: MediaRef; label: string; fit?: "cover" | "contain"; className?: string }) {
  if (!media) {
    return (
      <div className={cn("grid place-items-center bg-lavender text-ink/60", className)}>
        <span className="flex flex-col items-center gap-1 text-[12px] font-bold">
          <ImageIcon className="size-5" aria-hidden />
          {label}
        </span>
      </div>
    );
  }
  const cls = cn("size-full", fit === "cover" ? "object-cover" : "object-contain");
  return (
    <div className={cn("overflow-hidden bg-ink", className)}>
      {media.kind === "video" ? (
        <video src={media.previewUrl} poster={media.thumbnail?.previewUrl} className={cls} muted loop autoPlay playsInline aria-label="Ad video" />
      ) : (
        // Local blob preview — next/image can't optimise blob: URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.previewUrl} alt="Ad image" className={cls} />
      )}
    </div>
  );
}

/** Primary text, clipped like the feeds do. */
function Caption({ text, clip = 125 }: { text: string; clip?: number }) {
  if (!text.trim()) return <span className="opacity-70">Your primary text appears here.</span>;
  const cp = Array.from(text);
  return cp.length > clip ? (
    <>
      {cp.slice(0, clip).join("").trimEnd()}… <span className="opacity-70">See more</span>
    </>
  ) : (
    <>{text}</>
  );
}

function Header({ name, sub, dark }: { name: string; sub: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-extrabold text-chartreuse ring-2 ring-paper/70">{initials(name)}</span>
      <div className="min-w-0 leading-tight">
        <p className={cn("truncate text-[13px] font-bold", dark ? "text-paper" : "text-ink")}>{name}</p>
        <p className={cn("text-[11px]", dark ? "text-paper/75" : "text-ink-muted")}>{sub}</p>
      </div>
    </div>
  );
}

function CtaRow({ domain, headline, description, cta }: { domain: string; headline: string; description?: string; cta: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-lavender-soft px-3 py-2.5">
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[11px] uppercase text-ink-muted">{domain}</p>
        <p className="truncate text-[13px] font-bold">{headline || "Your headline"}</p>
        {description && <p className="truncate text-[12px] text-ink-muted">{description}</p>}
      </div>
      <span className="shrink-0 rounded-[6px] bg-ink/10 px-3 py-1.5 text-[12px] font-bold text-ink">{cta}</span>
    </div>
  );
}

/** Swipeable cards (feeds). */
function CarouselStrip({ draft, cta }: { draft: Draft; cta: string }) {
  const cards = draft.ad.carousel.cards;
  return (
    <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-3" aria-label="Carousel cards">
      {cards.map((c, i) => (
        <div key={c.id} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-[8px] ring-1 ring-line">
          <Media media={c.image} label={`Card ${i + 1}`} className="aspect-square" />
          <div className="flex items-center justify-between gap-2 bg-lavender-soft px-2.5 py-2">
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[12px] font-bold">{c.headline || `Card ${i + 1} headline`}</p>
              {c.description && <p className="truncate text-[11px] text-ink-muted">{c.description}</p>}
            </div>
            <span className="max-w-[48%] truncate rounded-[6px] bg-ink/10 px-2 py-1 text-[11px] font-bold">{cta}</span>
          </div>
        </div>
      ))}
      {draft.ad.carousel.endCard && (
        <div className="grid w-[60%] shrink-0 snap-start place-items-center rounded-[8px] bg-lavender-soft p-4 text-center ring-1 ring-line">
          <span className="text-[12px] font-bold text-ink-muted">End card · your Page</span>
        </div>
      )}
    </div>
  );
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[320px] overflow-hidden rounded-[14px] bg-paper shadow-[0_18px_44px_-20px_rgb(42_39_51/0.45)]", className)}>{children}</div>;
}

export function AdPreview({ draft, client }: { draft: Draft; client?: ClientOption }) {
  const [picked, setTab] = useState<Placement>("fb");
  const ad = draft.ad;
  const tabs =
    ad.destination === "lead_form"
      ? [...TABS, { id: "form" as const, label: "Form" }]
      : ad.destination === "whatsapp"
        ? [...TABS, { id: "whatsapp" as const, label: "WhatsApp" }]
        : ad.destination === "call"
          ? [...TABS, { id: "call" as const, label: "Call" }]
          : TABS;
  const tab = tabs.some((t) => t.id === picked) ? picked : "fb";
  const page = client?.pageName || draft.setup.businessName || "Your Page";
  const igName = client?.instagramUsername || page.toLowerCase().replace(/[^a-z0-9]+/g, "");
  // Per-item WhatsApp links run as plain links with a "Contact us" button.
  const cta = ad.destination === "whatsapp" && ad.format === "carousel" && ad.whatsapp.perItem ? "Contact us" : ctaLabel(ad.cta);
  const domain = {
    website: host(ad.url) || "your-website.com",
    lead_form: "Instant form",
    whatsapp: "WhatsApp",
    call: ad.phone.trim() || "Phone call",
    messenger: "Messenger",
    instagram_dm: "Instagram",
    none: host(draft.setup.website) || "Facebook Page",
  }[ad.destination];
  const headline = ad.format === "carousel" ? ad.carousel.cards[0]?.headline ?? "" : ad.headline;

  const feedMedia = ad.format === "video" ? ad.media.video : ad.media.feed;
  const igMedia = ad.format === "video" ? ad.media.video : ad.media.portrait ?? ad.media.feed;
  const storyMedia = ad.format === "video" ? ad.media.video : ad.format === "carousel" ? ad.carousel.cards[0]?.image : ad.media.story ?? ad.media.feed;

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Preview placement" className="flex gap-1 rounded-pill bg-paper p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            title={t.id === "story" ? "Stories & Reels" : t.id === "form" ? "Instant form" : t.id === "whatsapp" ? "WhatsApp chat" : `${t.label} feed`}
            onClick={() => setTab(t.id)}
            className={cn("flex-1 rounded-pill px-2 py-1.5 text-[12px] font-bold whitespace-nowrap", tab === t.id ? "bg-chartreuse text-ink" : "text-ink-muted hover:text-ink")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "fb" && (
        <Frame>
          <div className="flex items-center justify-between p-3">
            <Header name={page} sub="Sponsored" />
            <MoreHorizontal className="size-4 text-ink-muted" aria-hidden />
          </div>
          <p className="px-3 pb-3 text-[13px] leading-snug whitespace-pre-line">
            <Caption text={ad.primaryText} />
          </p>
          {ad.format === "carousel" ? (
            <CarouselStrip draft={draft} cta={cta} />
          ) : (
            <>
              <Media media={feedMedia} label={ad.format === "video" ? "Your video" : "Square image 1:1"} className="aspect-square" />
              <CtaRow domain={domain} headline={headline} description={ad.description} cta={cta} />
            </>
          )}
          <div className="flex justify-around border-t border-line px-3 py-2 text-[12px] font-bold text-ink-muted" aria-hidden>
            <span className="flex items-center gap-1">
              <ThumbsUp className="size-3.5" /> Like
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3.5" /> Comment
            </span>
            <span className="flex items-center gap-1">
              <Send className="size-3.5" /> Share
            </span>
          </div>
        </Frame>
      )}

      {tab === "ig" && (
        <Frame>
          <div className="flex items-center justify-between p-3">
            <Header name={igName} sub="Sponsored" />
            <MoreHorizontal className="size-4 text-ink-muted" aria-hidden />
          </div>
          {ad.format === "carousel" ? (
            <CarouselStrip draft={draft} cta={cta} />
          ) : (
            <>
              <Media
                media={igMedia}
                label={ad.format === "video" ? "Your video" : "Portrait 4:5 (or square)"}
                className={ad.media.portrait || ad.format === "video" ? "aspect-[4/5]" : "aspect-square"}
              />
              <div className="flex items-center justify-between bg-lavender-soft px-3 py-2.5 text-[13px] font-bold">
                {cta}
                <ChevronUp className="size-4 rotate-90" aria-hidden />
              </div>
            </>
          )}
          <div className="flex gap-4 px-3 pt-2.5 text-ink" aria-hidden>
            <Heart className="size-4" />
            <MessageCircle className="size-4" />
            <Send className="size-4" />
          </div>
          <p className="px-3 pt-2 pb-3 text-[13px] leading-snug">
            <strong>{igName}</strong> <Caption text={ad.primaryText} clip={90} />
          </p>
        </Frame>
      )}

      {tab === "story" && (
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-[22px] bg-ink shadow-[0_18px_44px_-20px_rgb(42_39_51/0.5)]">
          <Media
            media={storyMedia}
            label={ad.format === "video" ? "Your video" : "Vertical image 9:16"}
            fit={storyMedia && storyMedia.kind === "image" && Math.abs(storyMedia.width / storyMedia.height - 9 / 16) > 0.05 ? "contain" : "cover"}
            className="absolute inset-0"
          />
          <div className="absolute inset-x-3 top-3 h-1 rounded-pill bg-paper/40" aria-hidden>
            <div className="h-full w-1/3 rounded-pill bg-paper" />
          </div>
          <div className="absolute inset-x-3 top-6">
            <Header name={page} sub="Sponsored" dark />
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent px-4 pt-16 pb-4 text-paper">
            <p className="text-[12px] leading-snug">
              <Caption text={ad.primaryText} clip={80} />
            </p>
            <span className="mx-auto mt-3 flex w-fit flex-col items-center text-[12px] font-bold">
              <ChevronUp className="size-4" aria-hidden />
              <span className="rounded-pill bg-paper px-4 py-1.5 text-ink">{cta}</span>
            </span>
          </div>
        </div>
      )}

      {tab === "form" && <FormMock draft={draft} page={page} />}
      {tab === "whatsapp" && <WhatsAppMock draft={draft} page={page} />}
      {tab === "call" && <CallMock phone={ad.phone} page={page} />}

      <p className="text-center text-[12px] text-ink-muted">
        Approximate preview. Meta may crop or rearrange slightly per device.
        {ad.destination === "lead_form" && " Tapping opens the instant form."}
      </p>
    </div>
  );
}

/** What the instant form looks like after tapping the button. */
function FormMock({ draft, page }: { draft: Draft; page: string }) {
  const f = draft.ad.leadForm;
  const field = "rounded-[6px] bg-lavender-soft px-3 py-2 text-[12px] text-ink-muted";
  return (
    <Frame>
      <div className="flex flex-col items-center gap-1 bg-lavender px-4 pt-5 pb-4 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-ink text-[12px] font-extrabold text-chartreuse">{initials(page)}</span>
        <p className="text-[13px] font-bold">{page}</p>
        <p className="text-[14px] leading-snug font-extrabold">{draft.ad.headline || "Your headline"}</p>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <p className="text-[12px] font-bold">Contact information</p>
        {f.fields.map((k) => (
          <div key={k} className={field}>
            {CONTACT_FIELDS[k]}
          </div>
        ))}
        {f.questions.filter((q) => q.trim()).length > 0 && <p className="pt-2 text-[12px] font-bold">A few questions</p>}
        {f.questions
          .filter((q) => q.trim())
          .map((q, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="text-[12px]">{q}</span>
              <div className={field}>Your answer</div>
            </div>
          ))}
        <p className="pt-2 text-[11px] leading-snug text-ink-muted">
          By submitting, you agree to share your info with {page}, who will use it as described in their{" "}
          <span className="font-bold text-ink underline">privacy policy</span>.
        </p>
        <span className="mt-1 rounded-[6px] bg-ink py-2 text-center text-[13px] font-bold text-paper">Submit</span>
        <p className="mt-2 rounded-[6px] bg-chartreuse-soft px-3 py-2 text-[12px]">
          <strong>After sending:</strong> {f.thankYou || "Thanks! We'll be in touch."}
        </p>
      </div>
    </Frame>
  );
}

/** The WhatsApp chat that opens after tapping (approximate). */
function WhatsAppMock({ draft, page }: { draft: Draft; page: string }) {
  const ad = draft.ad;
  const w = ad.whatsapp;
  const cards = ad.carousel.cards;
  const perItem = ad.format === "carousel" && w.perItem;
  const [picked, setPicked] = useState(0);
  const card = cards[Math.min(picked, Math.max(0, cards.length - 1))];
  const adImage = ad.format === "carousel" ? card?.image : ad.format === "video" ? ad.media.video?.thumbnail && { ...ad.media.video, kind: "image" as const, previewUrl: ad.media.video.thumbnail.previewUrl } : ad.media.feed;
  const adTitle = ad.format === "carousel" ? card?.headline || "Your item" : ad.headline || "Your headline";
  const bubble = "max-w-[85%] rounded-[10px] px-3 py-2 text-[12px] leading-snug shadow-[0_1px_1px_rgb(42_39_51/0.12)]";

  return (
    <div className="flex flex-col gap-3">
      {perItem && cards.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-bold text-ink-muted">Customer taps:</span>
          {cards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setPicked(i)}
              aria-pressed={picked === i}
              className={cn("rounded-pill px-2.5 py-1 text-[11px] font-bold", picked === i ? "bg-chartreuse" : "bg-paper text-ink-muted hover:text-ink")}
            >
              Item {i + 1}
            </button>
          ))}
        </div>
      )}
      <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[18px] bg-lavender-soft shadow-[0_18px_44px_-20px_rgb(42_39_51/0.45)]">
        <div className="flex items-center gap-2.5 bg-ink px-3 py-2.5 text-paper">
          <span className="grid size-8 place-items-center rounded-full bg-chartreuse text-[11px] font-extrabold text-ink">{initials(page)}</span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-bold">{page}</p>
            <p className="text-[11px] text-paper/70">{ad.whatsappNumber || "Business account"}</p>
          </div>
        </div>

        <div className="flex min-h-[300px] flex-col gap-2 p-3">
          {perItem ? (
            <>
              <p className="mx-auto rounded-pill bg-paper/80 px-2.5 py-0.5 text-[10px] text-ink-muted">Message typed for the customer</p>
              <div className={cn(bubble, "ml-auto flex flex-col gap-1.5 bg-chartreuse-soft")}>
                <div className="overflow-hidden rounded-[6px] bg-paper">
                  <Media media={card?.image} label="Item picture" className="aspect-[1.91/1]" />
                  <p className="truncate px-2 pt-1 text-[11px] font-bold">{adTitle}</p>
                  <p className="truncate px-2 pb-1.5 text-[10px] text-ink-muted">From {page}&apos;s ad</p>
                </div>
                <span>{itemMessage(card?.waMessage ?? "", card?.headline ?? "")}</span>
              </div>
            </>
          ) : (
            <>
              <div className={cn(bubble, "ml-auto flex items-center gap-2 bg-chartreuse-soft")}>
                <Media media={adImage || undefined} label="Ad" className="size-10 shrink-0 rounded-[4px]" />
                <span className="min-w-0">
                  <span className="block text-[10px] text-ink-muted">Replying to your ad</span>
                  <span className="block truncate font-bold">{adTitle}</span>
                </span>
              </div>
              <div className={cn(bubble, "bg-paper")}>{w.greeting || <span className="text-ink-muted">Your greeting appears here.</span>}</div>
              {w.style === "questions" && (
                <div className="flex flex-col gap-1.5">
                  {w.questions.filter((q) => q.trim()).map((q, i) => (
                    <span key={i} className="rounded-[8px] bg-paper px-3 py-1.5 text-center text-[12px] font-bold text-lavender-deep">
                      {q}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line bg-paper px-3 py-2">
          <span className="min-w-0 flex-1 truncate rounded-pill bg-lavender-soft px-3 py-1.5 text-[12px]">
            {perItem ? "Tap send ➜" : w.style === "prefill" ? w.prefill || "Pre-filled message" : "Type a message"}
          </span>
          <span className="grid size-7 place-items-center rounded-full bg-ink text-paper" aria-hidden>
            <Send className="size-3.5" />
          </span>
        </div>
      </div>
      <p className="text-center text-[12px] text-ink-muted">
        {perItem ? "Each item opens WhatsApp with its own message and picture link." : "Meta shows which ad the chat came from in your WhatsApp Business inbox."}
      </p>
    </div>
  );
}

/** What happens after "Call now": the phone's dialer opens with the number. */
function CallMock({ phone, page }: { phone: string; page: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto flex aspect-[9/16] w-full max-w-[240px] flex-col items-center justify-between rounded-[22px] bg-ink px-5 py-8 text-paper shadow-[0_18px_44px_-20px_rgb(42_39_51/0.5)]">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-chartreuse text-[18px] font-extrabold text-ink">{initials(page)}</span>
          <p className="text-[15px] font-bold">{page}</p>
          <p className="text-[18px] tabular-nums tracking-wide">{phone.trim() || "+91 ••••• •••••"}</p>
          <p className="text-[11px] text-paper/60">Dialer opens — the customer taps to call</p>
        </div>
        <span className="grid size-14 place-items-center rounded-full bg-chartreuse text-ink" aria-hidden>
          <Phone className="size-6" />
        </span>
      </div>
      <p className="text-center text-[12px] text-ink-muted">Call ads show on phones only. Meta optimises for calls that last long enough to be real enquiries.</p>
    </div>
  );
}
