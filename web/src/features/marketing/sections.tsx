import Link from "next/link";
import {
  ArrowRight,
  Check,
  X,
  Sparkles,
  MapPin,
  Users,
  ShieldCheck,
  PauseCircle,
  BarChart3,
  Plus,
  Store,
  Briefcase,
  UserRound,
  Building2,
} from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LEGAL_DOCS } from "@/features/legal/content";
import { Reveal, RotatingWord, TypingLines } from "./components/motion";
import { Carousel } from "./components/carousel";
import { FeedMockup, StoryMockup, ReelsMockup, RightColumnMockup, LeadFormMockup } from "./components/ad-mockups";

const wrap = "mx-auto w-full max-w-[1200px] px-4 sm:px-6";

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 rounded-pill bg-paper/70 px-3 py-1.5 text-[13px] font-bold text-ink", className)}>
      {children}
    </p>
  );
}

function SectionTitle({ eyebrow, title, sub, dark }: { eyebrow: string; title: React.ReactNode; sub?: string; dark?: boolean }) {
  return (
    <Reveal className="max-w-[760px]">
      <p className={cn("text-[13px] font-extrabold uppercase tracking-[0.12em]", dark ? "text-chartreuse" : "text-tomato-700")}>{eyebrow}</p>
      <h2 className="mt-3 text-[36px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[51px]">{title}</h2>
      {sub && <p className={cn("mt-5 max-w-[620px] text-[19px] leading-relaxed", dark ? "text-paper/70" : "text-ink-muted")}>{sub}</p>}
    </Reveal>
  );
}

/* -------------------------------------------------------------- Hero */
export function Hero() {
  return (
    <section className="mesh-hero grain relative overflow-hidden pt-28 pb-20 md:pt-36 md:pb-28">
      {/* Pattern layer, faded out toward the bottom-right */}
      <div aria-hidden className="pattern-dots absolute inset-0 text-ink/[0.09] [mask-image:linear-gradient(160deg,black_30%,transparent_75%)]" />
      <div aria-hidden className="absolute -right-40 -top-40 size-[520px] rounded-full border-[56px] border-chartreuse/50" />

      <div className={cn(wrap, "relative grid items-center gap-14 lg:grid-cols-[1.15fr_1fr]")}>
        <div>
          <Reveal>
            <Eyebrow>
              <span className="size-2 rounded-full bg-tomato" /> Meta ads, minus the busywork
            </Eyebrow>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6">
              <Wordmark className="block text-[clamp(52px,10vw,124px)]" />
              <span className="mt-6 block max-w-[620px] text-[26px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[34px]">
                Launch Meta ads for every{" "}
                <RotatingWord
                  words={["café", "clinic", "gym", "salon", "agency client", "local shop"]}
                  className="rounded-[8px] bg-chartreuse px-2 text-ink"
                />{" "}
                — without opening Ads Manager.
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-[540px] text-[19px] leading-relaxed text-ink/75">
              AI writes the copy, we map the neighbourhoods, you preview every placement — then launch paused and go live
              when you&apos;re ready.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/signup" size="lg">
              Start your 2-day trial <ArrowRight className="size-5" aria-hidden />
            </ButtonLink>
            <ButtonLink href="#how" variant="secondary" size="lg">
              See how it works
            </ButtonLink>
          </Reveal>
          <Reveal delay={320}>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-bold text-ink/75">
              {["No card to start", "Campaigns launch paused", "INR & USD billing"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 text-lavender-deep" strokeWidth={3} aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* Visual stack */}
        <div aria-hidden className="relative mx-auto h-[520px] w-full max-w-[460px] lg:h-[580px]">
          <div className="absolute right-0 top-6 animate-float [--tilt:6deg] [animation-delay:-2s]">
            <StoryMockup className="scale-[0.9] sm:scale-100" />
          </div>
          <div className="absolute left-0 top-28 animate-float [--tilt:-4deg]">
            <FeedMockup className="scale-[0.9] sm:scale-100" />
          </div>
          <div className="absolute -left-2 top-4 animate-float rounded-pill bg-ink px-4 py-2.5 text-[13px] font-bold text-paper shadow-cta [--tilt:-3deg] [animation-delay:-1s]">
            <Sparkles className="mr-1.5 inline size-4 text-chartreuse" /> AI copy ready
          </div>
          <div className="absolute right-2 bottom-24 animate-float rounded-pill bg-chartreuse px-4 py-2.5 text-[13px] font-bold text-ink shadow-cta [--tilt:3deg] [animation-delay:-3s]">
            <MapPin className="mr-1.5 inline size-4" /> 2.5 km around you
          </div>
          <div className="absolute bottom-6 left-10 animate-float rounded-pill bg-paper px-4 py-2.5 text-[13px] font-bold text-ink shadow-cta [--tilt:-2deg] [animation-delay:-4s]">
            <PauseCircle className="mr-1.5 inline size-4 text-tomato-600" /> Launched paused
          </div>
          <SpinBadge className="absolute -bottom-6 -right-4 hidden sm:block" />
        </div>
      </div>
    </section>
  );
}

function SpinBadge({ className }: { className?: string }) {
  return (
    <div className={cn("size-28", className)}>
      <svg viewBox="0 0 100 100" className="animate-spin-slow size-full">
        <defs>
          <path id="badge-circle" d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0" />
        </defs>
        <circle cx="50" cy="50" r="50" fill="var(--color-tomato)" />
        <text fontSize="11.5" fontWeight="800" letterSpacing="2.2" fill="var(--color-ink)">
          <textPath href="#badge-circle">START FREE • 2 DAYS • START FREE • 2 DAYS •</textPath>
        </text>
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[26px] font-extrabold text-ink">↗</span>
    </div>
  );
}

/* ---------------------------------------------------------- Marquee */
const industries = ["Restaurants", "Clinics", "Gyms", "Salons", "Real estate", "Coaching", "Retail", "Agencies", "Cafés", "Dental", "Events"];

function MarqueeRow({ items, className, reverse }: { items: string[]; className?: string; reverse?: boolean }) {
  const row = (
    <ul className="flex shrink-0 items-center gap-8 pr-8">
      {items.map((t) => (
        <li key={t} className="flex items-center gap-8 whitespace-nowrap">
          {t}
          <span className="text-[0.7em]">✺</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={cn("overflow-hidden py-4", className)}>
      <div className={cn("animate-marquee flex w-max", reverse && "[animation-direction:reverse]")}>
        {row}
        <div aria-hidden>{row}</div>
      </div>
    </div>
  );
}

export function IndustryMarquee() {
  return (
    <section aria-label="Who uses Shryxa Ads" className="relative z-10 -my-6 overflow-hidden py-10">
      <MarqueeRow items={industries} className="-rotate-2 bg-chartreuse text-[28px] font-extrabold text-ink sm:text-[40px]" />
      <MarqueeRow
        items={["AI ad copy", "Hyper-local targeting", "Feed · Stories · Reels", "Instant Forms", "Multi-client", "Auto-pause"]}
        reverse
        className="-mt-3 rotate-1 bg-ink text-[22px] font-bold text-paper [--marquee-duration:44s] sm:text-[28px]"
      />
    </section>
  );
}

/* ------------------------------------------------- Problem → Solution */
export function Contrast() {
  const without = [
    "Dozens of nested settings for one simple ad",
    "Guessing radius and audiences by hand",
    "Writing copy from a blank box",
    "No idea how it looks until it's live",
    "Ads keep spending when you forget them",
  ];
  const withUs = [
    "One guided flow: brief → preview → launch",
    "Type a city, get neighbourhoods + radii",
    "AI drafts headlines and primary text",
    "Preview Feed, Stories, Reels and forms",
    "Everything launches paused — you press go",
  ];
  return (
    <section className="bg-paper py-24 md:py-32">
      <div className={wrap}>
        <SectionTitle
          eyebrow="Why Shryxa Ads"
          title={<>Ads Manager is built for media buyers. <span className="text-lavender-deep">you&apos;re running a business.</span></>}
        />
        <div className="mt-14 grid gap-5 md:grid-cols-2">
          <Reveal className="relative overflow-hidden rounded-card bg-lavender-soft p-8">
            <div aria-hidden className="pattern-stripes absolute -right-10 -top-10 size-40 rotate-12 rounded-full text-lavender/60" />
            <p className="relative text-[15px] font-extrabold uppercase tracking-wide text-ink-muted">The usual way</p>
            <ul className="relative mt-6 space-y-4">
              {without.map((t) => (
                <li key={t} className="flex gap-3 text-[17px] text-ink/80">
                  <X className="mt-0.5 size-5 shrink-0 text-tomato-700" strokeWidth={2.5} aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120} className="relative overflow-hidden rounded-card bg-chartreuse p-8">
            <div aria-hidden className="pattern-dots absolute inset-0 text-ink/[0.07]" />
            <p className="relative text-[15px] font-extrabold uppercase tracking-wide">With Shryxa Ads</p>
            <ul className="relative mt-6 space-y-4">
              {withUs.map((t) => (
                <li key={t} className="flex gap-3 text-[17px] font-bold">
                  <Check className="mt-0.5 size-5 shrink-0" strokeWidth={3} aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ How it works */
export function HowItWorks() {
  const steps = [
    { n: "01", title: "Add a client", body: "Create a client and let them connect their own Meta account in one secure click.", tone: "bg-paper" },
    { n: "02", title: "Brief in plain words", body: "Tell us the offer, the city and who it's for. AI drafts the copy; we map the reach.", tone: "bg-chartreuse" },
    { n: "03", title: "Preview everywhere", body: "See the ad in Feed, Stories, Reels, right column and Instant Form before anything goes out.", tone: "bg-paper" },
    { n: "04", title: "Launch or keep paused", body: "Launch it live, or create it paused and turn it on later. Pause, edit the budget or stop it anytime from Campaigns.", tone: "bg-tomato" },
  ];
  return (
    <section id="how" className="relative scroll-mt-16 overflow-hidden bg-lavender py-24 md:py-32">
      <div aria-hidden className="pattern-grid absolute inset-0 text-ink/[0.06]" />
      <div className={cn(wrap, "relative")}>
        <SectionTitle eyebrow="How it works" title="from brief to live campaign in four steps." />
        <div aria-hidden className="pattern-squiggle mt-14 hidden h-3 opacity-30 lg:block" />
        <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 110} className={cn("flex flex-col rounded-card p-7", s.tone)}>
              <span className="text-[56px] font-extrabold leading-none tracking-[-0.04em]">{s.n}</span>
              <h3 className="mt-8 text-[22px] font-extrabold leading-tight">{s.title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-ink/75">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------- Features (bento) */
export function Features() {
  return (
    <section id="features" className="relative scroll-mt-16 overflow-hidden bg-ink py-24 text-paper md:py-32">
      <div aria-hidden className="pattern-dots absolute inset-0 text-paper/[0.06]" />
      <div className={cn(wrap, "relative")}>
        <SectionTitle
          dark
          eyebrow="Features"
          title={<>everything a campaign needs. <span className="text-chartreuse">nothing it doesn&apos;t.</span></>}
          sub="Built around how small teams and agencies actually run Meta ads — fast briefs, local reach, many clients."
        />

        <div className="mt-14 grid gap-4 lg:grid-cols-6">
          {/* AI copy */}
          <Reveal className="relative overflow-hidden rounded-card bg-lavender p-7 text-ink lg:col-span-4">
            <FeatureHead icon={Sparkles} title="AI ad copy" body="Headlines and primary text written for your offer — edit, regenerate, or keep." />
            <div className="mt-7 rounded-[10px] bg-paper p-5 shadow-[0_10px_30px_-12px_rgb(42_39_51/0.35)]">
              <p className="text-[12px] font-bold uppercase tracking-wide text-ink-muted">Headline</p>
              <TypingLines
                className="mt-1 min-h-[2.6em] text-[22px] font-extrabold leading-tight sm:text-[26px]"
                lines={[
                  "Weekend brunch, 20% off — book your table",
                  "Your neighbourhood gym, first week free",
                  "Smile brighter: free dental check-up this month",
                ]}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {["Friendly", "Urgent", "Premium"].map((t, i) => (
                  <span key={t} className={cn("rounded-pill px-3 py-1 text-[12px] font-bold", i === 0 ? "bg-chartreuse" : "bg-lavender-soft")}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Hyper-local */}
          <Reveal delay={100} className="relative overflow-hidden rounded-card bg-chartreuse p-7 text-ink lg:col-span-2 lg:row-span-2">
            <FeatureHead icon={MapPin} title="Hyper-local reach" body="Type a city — get neighbourhood pins from 1.5 km up to metro-wide." />
            <div aria-hidden className="relative mx-auto mt-8 aspect-square w-full max-w-[280px]">
              <div className="pattern-rings absolute inset-0 rounded-full text-ink/15" />
              {[0, 1, 2].map((i) => (
                <span key={i} className="animate-ring absolute inset-[30%] rounded-full border-2 border-ink" style={{ animationDelay: `${i}s` }} />
              ))}
              <span className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-tomato text-paper shadow-cta">
                <MapPin className="size-5" />
              </span>
              {[
                "left-[14%] top-[22%]",
                "right-[12%] top-[34%]",
                "left-[28%] bottom-[14%]",
              ].map((pos) => (
                <span key={pos} className={cn("absolute size-4 rounded-full border-[3px] border-ink bg-paper", pos)} />
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {["Hyper-local · 1.5 km", "Local · 3–10 km", "City · 10–25 km", "Metro · 25–60 km"].map((t, i) => (
                <span key={t} className={cn("rounded-pill px-3 py-1 text-[12px] font-bold", i === 0 ? "bg-ink text-chartreuse" : "bg-paper/70")}>
                  {t}
                </span>
              ))}
            </div>
          </Reveal>

          {/* Multi-client */}
          <Reveal delay={60} className="rounded-card bg-paper p-7 text-ink lg:col-span-2">
            <FeatureHead icon={Users} title="Every client, one place" body="Each client connects their own Meta account." />
            <ul className="mt-6 space-y-2">
              {[
                { n: "Bloom Café", s: "active" },
                { n: "Northside Dental", s: "paused" },
                { n: "Iron Yard Gym", s: "pending" },
              ].map((c) => (
                <li key={c.n} className="flex items-center justify-between rounded-[8px] bg-lavender-soft px-3 py-2.5 text-[14px] font-bold">
                  {c.n}
                  <span
                    className={cn(
                      "rounded-pill px-2.5 py-0.5 text-[11px]",
                      c.s === "active" ? "bg-chartreuse" : c.s === "paused" ? "bg-lavender" : "bg-tomato-soft text-tomato-700",
                    )}
                  >
                    {c.s}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Safe launch */}
          <Reveal delay={120} className="relative overflow-hidden rounded-card bg-tomato p-7 text-ink lg:col-span-2">
            <div aria-hidden className="pattern-stripes absolute inset-0 text-ink/[0.06]" />
            <div className="relative">
              <FeatureHead icon={PauseCircle} title="Safe by default" body="Campaigns are created paused. Nothing spends until you press go." />
              <div className="mt-6 flex items-center gap-3 rounded-pill bg-paper p-1.5 text-[13px] font-extrabold">
                <span className="flex-1 rounded-pill bg-ink py-2 text-center text-paper">PAUSED</span>
                <span className="flex-1 py-2 text-center text-ink-muted">ACTIVE</span>
              </div>
            </div>
          </Reveal>

          {/* Dashboard */}
          <Reveal delay={60} className="rounded-card bg-paper p-7 text-ink lg:col-span-3">
            <FeatureHead icon={BarChart3} title="Live results dashboard" body="Spend, clicks and leads per campaign — pause, resume or stop in one tap." />
            <div aria-hidden className="mt-6 flex h-28 items-end gap-2">
              {[38, 52, 44, 70, 62, 84, 76, 92, 68, 88, 96, 80].map((h, i) => (
                <span key={i} className={cn("flex-1 rounded-t-[4px]", i % 4 === 3 ? "bg-tomato" : i % 2 ? "bg-lavender" : "bg-lavender-deep/70")} style={{ height: `${h}%` }} />
              ))}
            </div>
          </Reveal>

          {/* Security */}
          <Reveal delay={120} className="relative overflow-hidden rounded-card bg-lavender-deep p-7 text-paper lg:col-span-3">
            <div aria-hidden className="pattern-checker absolute -right-8 -bottom-8 size-48 rotate-12 rounded-[24px] text-paper/10" />
            <div className="relative">
              <ShieldCheck className="size-7 text-chartreuse" strokeWidth={1.75} aria-hidden />
              <h3 className="mt-4 text-[22px] font-extrabold">Tokens encrypted at rest</h3>
              <p className="mt-2 max-w-[440px] text-[15px] leading-relaxed text-paper/80">
                Clients sign in with Meta directly — we never see their password, and access tokens are encrypted before they
                touch the database. Lapsed plans auto-pause running ads.
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function FeatureHead({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body: string }) {
  return (
    <div>
      <Icon className="size-7" strokeWidth={1.75} aria-hidden />
      <h3 className="mt-4 text-[22px] font-extrabold leading-tight">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed opacity-75">{body}</p>
    </div>
  );
}

/* ------------------------------------------- Placements (carousel #1) */
export function Placements() {
  const slides = [
    { name: "Feed", note: "The classic square post, with headline and button.", bg: "bg-lavender", pat: "pattern-dots text-ink/10", el: <FeedMockup /> },
    { name: "Stories", note: "Full-screen vertical, swipe-up call to action.", bg: "bg-chartreuse", pat: "pattern-stripes text-ink/[0.06]", el: <StoryMockup variant="b" /> },
    { name: "Reels", note: "Short vertical video with an overlay button.", bg: "bg-tomato", pat: "pattern-checker text-ink/[0.07]", el: <ReelsMockup /> },
    { name: "Instant Form", note: "Capture leads without leaving the app.", bg: "bg-lavender-deep", pat: "pattern-rings text-paper/10", el: <LeadFormMockup /> },
    { name: "Right column", note: "Compact desktop placement beside the feed.", bg: "bg-ink", pat: "pattern-grid text-paper/[0.07]", el: <RightColumnMockup /> },
  ];
  return (
    <section id="placements" className="mesh-soft scroll-mt-16 py-24 md:py-32">
      <div className={wrap}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionTitle
            eyebrow="Preview"
            title="see it before it runs."
            sub="Every placement rendered with your copy and creative, side by side — so the first time you see your ad isn't when a customer does."
          />
        </div>
        <div className="mt-12">
          <Carousel label="Ad placement previews" autoplay={4500} slideClassName="w-[86%] sm:w-[460px]">
            {slides.map((s) => (
              <figure key={s.name} className={cn("relative flex h-[560px] flex-col overflow-hidden rounded-card", s.bg)}>
                <div aria-hidden className={cn("absolute inset-0", s.pat)} />
                <div className="relative grid flex-1 place-items-center p-6">{s.el}</div>
                <figcaption className="relative flex items-center justify-between gap-4 bg-paper px-6 py-4">
                  <span className="text-[19px] font-extrabold">{s.name}</span>
                  <span className="text-right text-[13px] text-ink-muted">{s.note}</span>
                </figcaption>
              </figure>
            ))}
          </Carousel>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ Facts strip */
export function Facts() {
  const facts = [
    { big: "5", small: "placements previewed before launch" },
    { big: "1.5 km", small: "tightest neighbourhood radius" },
    { big: "2 days", small: "free trial, no card to start" },
    { big: "0", small: "spend until you press go" },
  ];
  return (
    <section className="relative overflow-hidden bg-tomato py-16 text-ink">
      <div aria-hidden className="pattern-dots absolute inset-0 text-ink/[0.08]" />
      <dl className={cn(wrap, "relative grid gap-10 sm:grid-cols-2 lg:grid-cols-4")}>
        {facts.map((f, i) => (
          <Reveal key={f.small} delay={i * 90}>
            <dt className="sr-only">{f.small}</dt>
            <dd>
              <span className="block text-[56px] font-extrabold leading-none tracking-[-0.04em] sm:text-[68px]">{f.big}</span>
              <span className="mt-3 block max-w-[220px] text-[17px] font-bold leading-snug">{f.small}</span>
            </dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}

/* ---------------------------------------------- Who it's for (carousel #2) */
export function Audiences() {
  const items = [
    {
      icon: Store,
      who: "Local business owners",
      line: "You know your customers. You don't have time to learn Ads Manager.",
      points: ["One guided flow", "Neighbourhood targeting", "Launch in minutes"],
      bg: "bg-chartreuse",
      pat: "pattern-dots text-ink/10",
    },
    {
      icon: Briefcase,
      who: "Agencies",
      line: "Run campaigns for many clients without juggling logins.",
      points: ["Up to 25 clients", "Team seats", "Per-client Meta connection"],
      bg: "bg-lavender",
      pat: "pattern-grid text-ink/[0.07]",
    },
    {
      icon: UserRound,
      who: "Freelance marketers",
      line: "Ship polished campaigns fast and show clients exactly what they'll get.",
      points: ["AI copy drafts", "Shareable previews", "Lead forms built-in"],
      bg: "bg-tomato",
      pat: "pattern-stripes text-ink/[0.06]",
    },
    {
      icon: Building2,
      who: "Multi-location brands",
      line: "Same offer, many cities — each with its own local reach.",
      points: ["City-by-city radii", "Consistent creative", "One dashboard"],
      bg: "bg-ink text-paper",
      pat: "pattern-checker text-paper/[0.06]",
    },
  ];
  return (
    <section className="bg-paper py-24 md:py-32">
      <div className={wrap}>
        <SectionTitle eyebrow="Who it's for" title="made for people who'd rather run their business." />
        <div className="mt-12">
          <Carousel label="Who Shryxa Ads is for" slideClassName="w-[86%] sm:w-[400px]">
            {items.map(({ icon: Icon, ...a }) => (
              <article key={a.who} className={cn("relative flex h-full min-h-[380px] flex-col overflow-hidden rounded-card p-8", a.bg)}>
                <div aria-hidden className={cn("absolute inset-0", a.pat)} />
                <div className="relative flex flex-1 flex-col">
                  <span className="grid size-14 place-items-center rounded-full bg-paper text-ink">
                    <Icon className="size-6" strokeWidth={1.75} aria-hidden />
                  </span>
                  <h3 className="mt-8 text-[29px] font-extrabold leading-tight tracking-[-0.02em]">{a.who}</h3>
                  <p className="mt-3 text-[17px] leading-relaxed opacity-80">{a.line}</p>
                  <ul className="mt-auto flex flex-wrap gap-2 pt-8">
                    {a.points.map((p) => (
                      <li key={p} className="rounded-pill bg-paper px-3 py-1.5 text-[13px] font-bold text-ink">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </Carousel>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- Plans */
export function Plans() {
  const plans = [
    { name: "Starter", clients: 1, seats: 1, for: "One business, its own ads.", tone: "bg-paper", price: "₹999 / month · $21 outside India" },
    { price: "Priced on request · invoiced", name: "Agency Lite", clients: 5, seats: 1, for: "A solo marketer with a few clients.", tone: "bg-lavender" },
    { price: "Priced on request · invoiced", name: "Agency Standard", clients: 10, seats: 2, for: "A small team growing its book.", tone: "bg-chartreuse" },
    { price: "Priced on request · invoiced", name: "Agency Pro", clients: 25, seats: 5, for: "Agencies running many accounts.", tone: "bg-ink text-paper" },
  ];
  return (
    <section id="plans" className="relative scroll-mt-16 overflow-hidden bg-lavender-soft py-24 md:py-32">
      <div aria-hidden className="pattern-dots absolute inset-0 text-lavender-deep/[0.12] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className={cn(wrap, "relative")}>
        <SectionTitle
          eyebrow="Plans"
          title="pick by how many clients you run."
          sub="Every plan starts with a 2-day free trial. Ad spend is paid to Meta separately."
        />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 90} className={cn("flex flex-col rounded-card p-7", p.tone)}>
              <h3 className="text-[19px] font-extrabold">{p.name}</h3>
              <p className="mt-2 min-h-[3em] text-[15px] leading-snug opacity-75">{p.for}</p>
              <p className="mt-6 text-[56px] font-extrabold leading-none tracking-[-0.04em]">{p.clients}</p>
              <p className="mt-1 text-[15px] font-bold">{p.clients === 1 ? "client" : "clients"}</p>
              <p className="mt-4 text-[15px] font-extrabold">{p.price}</p>
              <ul className="mt-6 space-y-2 text-[15px]">
                {[`${p.seats} team ${p.seats === 1 ? "seat" : "seats"}`, "AI copy + previews", "Auto-pause protection"].map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden /> {f}
                  </li>
                ))}
              </ul>
              <ButtonLink
                href="/signup"
                variant={p.tone.includes("ink") ? "invert" : "secondary"}
                className="mt-8 w-full"
              >
                Start free trial
              </ButtonLink>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ FAQ */
export function Faq() {
  const qa = [
    {
      q: "Do I need to know Meta Ads Manager?",
      a: "No. You describe the offer and the area; Shryxa Ads builds the campaign, ad set and ad for you, with sensible defaults you can adjust.",
    },
    {
      q: "Will my campaign start spending straight away?",
      a: "Only if you choose to. Campaigns are created PAUSED, so you can review them first and turn them on from the Campaigns page.",
    },
    {
      q: "How do my clients connect their Meta account?",
      a: "Each client signs in with Meta through the official login flow and picks the ad account to use. We never see their password.",
    },
    {
      q: "Is the Meta access token stored safely?",
      a: "Yes. Tokens are encrypted before they're written to the database and are only decrypted on the server when a campaign action needs them.",
    },
    {
      q: "What happens if my subscription lapses?",
      a: "Running campaigns are paused automatically so you don't keep spending on a plan you're not using. When you renew, they're resumed.",
    },
    {
      q: "Which campaign types are supported?",
      a: "Leads (Instant Form, WhatsApp, calls or your website), Traffic (website or Instagram profile), Awareness, Engagement (WhatsApp, Messenger, Instagram DMs) and Sales — with single image, carousel or video ads. Leads from Instant Forms land in your Leads inbox with CSV export.",
    },
  ];
  return (
    <section id="faq" className="scroll-mt-16 bg-paper py-24 md:py-32">
      <div className={cn(wrap, "grid gap-12 lg:grid-cols-[1fr_1.4fr]")}>
        <div>
          <SectionTitle eyebrow="FAQ" title="questions, answered." />
          <Reveal delay={100} className="mt-8 hidden rounded-[10px] bg-lavender-soft p-6 lg:block">
            <p className="text-[17px]">
              <strong>Still unsure?</strong> Start the 2-day trial — campaigns launch paused, so you can explore everything
              without spending a rupee.
            </p>
          </Reveal>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {qa.map((item) => (
            <details key={item.q} className="group py-2 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-[6px] py-4 text-[19px] font-bold">
                {item.q}
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-lavender-soft transition-transform duration-300 group-open:rotate-45 group-open:bg-chartreuse">
                  <Plus className="size-5" aria-hidden />
                </span>
              </summary>
              <p className="pb-5 pr-14 text-[17px] leading-relaxed text-ink-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------- Closing CTA */
export function FinalCta() {
  return (
    <section className="mesh-hero grain relative overflow-hidden py-28 md:py-36">
      <div aria-hidden className="pattern-rings absolute left-1/2 top-1/2 size-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full text-ink/[0.07]" />
      <div className={cn(wrap, "relative flex flex-col items-center text-center")}>
        <Reveal>
          <h2 className="max-w-[900px] text-[44px] font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-[72px]">
            your next campaign is{" "}
            <span className="whitespace-nowrap rounded-[12px] bg-chartreuse px-3 [box-decoration-break:clone]">four steps</span> away.
          </h2>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-6 max-w-[540px] text-[19px] leading-relaxed text-ink/75">
            Start free for 2 days. Add a client, write a brief, preview it everywhere — and launch when it looks right.
          </p>
        </Reveal>
        <Reveal delay={200} className="mt-10 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/signup" size="lg">
            Start your 2-day trial <ArrowRight className="size-5" aria-hidden />
          </ButtonLink>
          <ButtonLink href="/login" variant="secondary" size="lg">
            Sign in
          </ButtonLink>
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- Footer */
export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-ink text-paper">
      <div className={cn(wrap, "grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]")}>
        <div>
          <Wordmark className="text-[34px] text-chartreuse" />
          <p className="mt-4 max-w-[340px] text-[15px] leading-relaxed text-paper/65">
            Launch and manage Meta ads for every client — built for local businesses and the agencies that serve them.
          </p>
        </div>
        <nav aria-label="Product">
          <p className="text-[13px] font-extrabold uppercase tracking-wide text-paper/50">Product</p>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            {[
              ["/#how", "How it works"],
              ["/#features", "Features"],
              ["/#placements", "Placements"],
              ["/#plans", "Plans"],
              ["/#faq", "FAQ"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-paper/80 hover:text-chartreuse">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Account">
          <p className="text-[13px] font-extrabold uppercase tracking-wide text-paper/50">Account</p>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            <li>
              <Link href="/signup" className="text-paper/80 hover:text-chartreuse">
                Start free trial
              </Link>
            </li>
            <li>
              <Link href="/login" className="text-paper/80 hover:text-chartreuse">
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <p className="text-[13px] font-extrabold uppercase tracking-wide text-paper/50">Legal</p>
          <ul className="mt-4 space-y-2.5 text-[15px]">
            {LEGAL_DOCS.map((d) => (
              <li key={d.slug}>
                <Link href={`/${d.slug}`} className="text-paper/80 hover:text-chartreuse">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {/* Oversized outline wordmark as a closing graphic */}
      <div aria-hidden className="pointer-events-none select-none overflow-hidden">
        <p className="-mb-[0.22em] whitespace-nowrap text-center text-[19vw] font-extrabold leading-none tracking-[-0.05em] text-transparent [-webkit-text-stroke:1.5px_rgb(212_255_58/0.35)]">
          shryxa ads.
        </p>
      </div>
      <div className="border-t border-paper/10">
        <p className={cn(wrap, "py-6 text-[13px] text-paper/55")}>© Shryxa Ads. All rights reserved.</p>
      </div>
    </footer>
  );
}
