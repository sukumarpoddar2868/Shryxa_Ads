import Link from "next/link";
import { Sparkles, MapPin, Eye, Users } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { ButtonLink } from "@/components/ui/button";
import { Band, Card } from "@/components/ui/surface";

const features = [
  { icon: Sparkles, title: "AI ad copy", body: "Headlines and primary text written for your offer, ready in seconds." },
  { icon: MapPin, title: "Hyper-local reach", body: "Type a city. We map neighborhoods and radii — from 1.5 km to metro-wide." },
  { icon: Eye, title: "See it before it runs", body: "Feed, Stories, Reels and Instant Form previews, side by side." },
  { icon: Users, title: "Every client, one place", body: "Each client connects their own Meta account. Switch in a click." },
];

export default function Home() {
  return (
    <>
      <header className="absolute inset-x-0 top-0 z-10">
        <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-5 sm:px-6">
          <Link href="/" aria-label="shryxa home">
            <Wordmark className="text-[24px]" />
          </Link>
          <div className="flex items-center gap-2">
            <ButtonLink href="/login" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/signup" size="sm" className="shadow-cta-sm">
              Start free
            </ButtonLink>
          </div>
        </nav>
      </header>

      <Band tone="mesh" className="pt-16">
        <div className="flex flex-col items-start gap-8 py-12 md:py-20">
          <Wordmark className="text-[72px] sm:text-[120px] md:text-[168px]" />
          <p className="max-w-[640px] text-[24px] font-bold leading-snug sm:text-[34px]">
            Launch Meta ads for every client — without opening Ads Manager.
          </p>
          <ButtonLink href="/signup" size="lg">
            Start your 2-day trial
          </ButtonLink>
        </div>
      </Band>

      <Band tone="chartreuse">
        <h2 className="max-w-[640px] text-[34px] font-extrabold leading-tight md:text-[51px]">
          from brief to live campaign in one flow.
        </h2>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="flex flex-col gap-3">
              <Icon aria-hidden className="size-6 text-lavender-deep" strokeWidth={1.75} />
              <h3 className="text-[19px] font-bold">{title}</h3>
              <p className="text-[15px] leading-relaxed text-ink-muted">{body}</p>
            </Card>
          ))}
        </div>
      </Band>

      <Band tone="paper">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-[34px] font-extrabold leading-tight md:text-[40px]">safe by default.</h2>
            <p className="mt-4 max-w-[560px] text-[19px] leading-relaxed text-ink-muted">
              Campaigns are created paused, so nothing spends until you say so. If a subscription lapses, running
              campaigns pause automatically — and resume when you&apos;re back.
            </p>
          </div>
          <div className="rounded-[10px] bg-lavender-soft p-6">
            <p className="text-[19px]">
              <strong>Psst —</strong> every token you connect is encrypted at rest. We never see your Meta password.
            </p>
          </div>
        </div>
      </Band>

      <footer className="bg-ink text-paper">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
          <Wordmark className="text-[29px] text-chartreuse" />
          <p className="text-sm text-paper/70">© Shryxa. Built for agencies and local businesses.</p>
        </div>
      </footer>
    </>
  );
}
