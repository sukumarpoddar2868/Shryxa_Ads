/**
 * Dashboard maths — pure (no server-only), so it can be unit-tested.
 * Date windows in the ad account's time zone, Meta action parsing, totals,
 * derived rates and period-over-period change.
 */

export const RANGES = { today: "Today", "7d": "Last 7 days", "14d": "Last 14 days", "30d": "Last 30 days", month: "This month" } as const;
export type RangeKey = keyof typeof RANGES;
export const isRange = (v: string): v is RangeKey => v in RANGES;

export type Window = { since: string; until: string; days: number };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return iso(now);
  }
}

/** Current window and the equal-length window right before it. */
export function windows(range: RangeKey, today: string): { current: Window; previous: Window } {
  const days = range === "today" ? 1 : range === "7d" ? 7 : range === "14d" ? 14 : range === "30d" ? 30 : Number(today.slice(8, 10));
  const since = addDays(today, -(days - 1));
  return {
    current: { since, until: today, days },
    previous: { since: addDays(since, -days), until: addDays(since, -1), days },
  };
}

/** Every date in a window (for a gap-free daily chart). */
export function datesOf(w: Window): string[] {
  return Array.from({ length: w.days }, (_, i) => addDays(w.since, i));
}

export type MetaAction = { action_type: string; value: string };

/** Leads / chats / calls / purchases from Meta's `actions`, without double counting. */
export function resultsOf(actions: MetaAction[] | undefined) {
  const v = (t: string) => Number(actions?.find((a) => a.action_type === t)?.value ?? 0);
  // "lead" already aggregates on-Facebook + website leads when present.
  const leads = v("lead") || v("onsite_conversion.lead_grouped") + v("offsite_conversion.fb_pixel_lead");
  const chats = v("onsite_conversion.messaging_conversation_started_7d");
  const calls = Math.max(v("click_to_call_native_call_placed"), v("click_to_call_call_confirm"));
  const purchases = v("omni_purchase") || v("purchase") || v("offsite_conversion.fb_pixel_purchase");
  return { leads, chats, calls, purchases, results: leads + chats + calls + purchases };
}

export type Totals = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number; // link clicks
  leads: number;
  chats: number;
  calls: number;
  purchases: number;
  results: number;
};

export const emptyTotals = (): Totals => ({ spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, chats: 0, calls: 0, purchases: 0, results: 0 });

export function addTotals(a: Totals, b: Partial<Totals>): Totals {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof Totals)[]) out[k] += b[k] ?? 0;
  return out;
}

/** Rates derived from totals (null when the denominator is 0). */
export function rates(t: Totals) {
  return {
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : null,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null,
    cpc: t.clicks ? t.spend / t.clicks : null,
    frequency: t.reach ? t.impressions / t.reach : null,
    costPerResult: t.results ? t.spend / t.results : null,
  };
}

/** % change vs previous; null when there's nothing to compare. */
export function change(now: number | null, before: number | null): number | null {
  if (now == null || before == null || before === 0) return null;
  return ((now - before) / before) * 100;
}

/** Friendly placement name from Meta's breakdown values. */
export function placementLabel(platform: string, position: string): string {
  const P: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", audience_network: "Audience Network", threads: "Threads" };
  const POS: Record<string, string> = {
    feed: "Feed",
    story: "Stories",
    instagram_stories: "Stories",
    facebook_stories: "Stories",
    reels: "Reels",
    instagram_reels: "Reels",
    facebook_reels: "Reels",
    facebook_reels_overlay: "Reels overlay",
    instagram_explore: "Explore",
    instagram_explore_grid_home: "Explore",
    explore_home: "Explore",
    profile_feed: "Profile feed",
    instagram_profile_feed: "Profile feed",
    marketplace: "Marketplace",
    video_feeds: "Video feeds",
    right_hand_column: "Right column",
    search: "Search",
    instream_video: "In-stream video",
    an_classic: "Apps & sites",
    rewarded_video: "Rewarded video",
    messenger_inbox: "Inbox",
  };
  return `${P[platform] ?? platform} ${POS[position] ?? position.replace(/_/g, " ")}`.trim();
}
