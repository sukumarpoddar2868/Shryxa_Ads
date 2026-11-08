import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { buttonClass } from "@/components/ui/button";
import { readItemToken, itemUrl } from "@/features/campaigns/whatsapp/item-link";

/**
 * Carousel item page behind the link in a per-item WhatsApp message.
 * Mostly read by WhatsApp's link preview (og tags); humans who open it can
 * jump straight into the chat.
 */
export async function generateMetadata({ params }: PageProps<"/w/[token]">): Promise<Metadata> {
  const { token } = await params;
  const item = readItemToken(token);
  if (!item) return { title: "Item not found", robots: { index: false } };
  const image = `${itemUrl(token)}/image`;
  return {
    title: item.headline || item.business,
    description: `From ${item.business}'s ad`,
    robots: { index: false },
    openGraph: { title: item.headline || item.business, description: `From ${item.business}'s ad`, images: [{ url: image, width: 1080, height: 1080 }] },
  };
}

export default function ItemPage({ params }: PageProps<"/w/[token]">) {
  return (
    <main className="grid min-h-dvh place-items-center bg-lavender-soft px-4 py-10">
      <Suspense fallback={<div className="h-96 w-full max-w-sm animate-pulse rounded-card bg-paper" />}>
        <Item params={params} />
      </Suspense>
    </main>
  );
}

async function Item({ params }: { params: PageProps<"/w/[token]">["params"] }) {
  const { token } = await params;
  const item = readItemToken(token);
  if (!item) notFound();
  const chat = `https://wa.me/${item.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi! I'm interested in "${item.headline}" from your ad.`)}`;
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-card bg-paper">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed, streamed from private storage */}
      <img src={`/w/${token}/image`} alt={item.headline} className="aspect-square w-full object-cover" />
      <div className="flex flex-col gap-3 p-5">
        <p className="text-[13px] font-bold text-ink-muted">{item.business}</p>
        <h1 className="text-[22px] leading-tight font-extrabold">{item.headline}</h1>
        {item.whatsapp && (
          <a href={chat} className={buttonClass({}, "w-full")}>
            <MessageCircle className="size-4" aria-hidden /> Chat on WhatsApp
          </a>
        )}
        <p className="pt-2 text-center text-[12px] text-ink-muted">
          Ad by {item.business} · made with <Wordmark className="text-[12px]" />
        </p>
      </div>
    </div>
  );
}
