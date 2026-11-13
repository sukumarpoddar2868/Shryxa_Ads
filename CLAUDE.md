# Shryxa Ads — project memory for Claude

Read this first instead of re-scanning the repo. Keep it short and current: update **Status** / **Next up** after meaningful work.

## Product
SaaS for local businesses and agencies to create, launch and manage **Meta (FB/IG) ad campaigns** without Ads Manager.
Account types: **business** (one auto client "My business") and **agency** (many clients). Billing via Razorpay (INR/USD, 2-day trial; tiers by client limit only — starter 1, agency_lite 5, agency_standard 10, agency_pro 25; one login per account, no seats). Known price: Starter ₹999/mo, $21 intl (agency prices unknown).

## Repo
- `web/` — **the Next.js app (active)**, deployed on Vercel (Root Directory `web`).
- Root Python/Streamlit app — legacy reference (`uv run streamlit run dashboard/app.py`). Still useful: `live_fetcher.py` (pause/resume/stop), `auth/subscription.py` (Razorpay), `auth/pause_resume.py`. Everything else is ported.

## Stack
Next.js 16 App Router + TS · Tailwind 4 · Zod 4 · `@supabase/supabase-js` only (server-side service-role client, no ORM) · custom auth on legacy `users`/`sessions` (bcrypt) · Fernet-compatible token crypto · lucide · Groq (AI) · MapLibre 6 + OpenFreeMap (map) · Supabase Storage (media).

## Conventions (`web/`)
- `cd web && pnpm dev` · verify `pnpm run lint && pnpm run build` (pnpm 12) · engine tests `pnpm run test:engine` (41: engine, billing, leads, geo, create) · after adding routes `npx next typegen` before `tsc`.
- **Next 16 differs from training data** → check `web/node_modules/next/dist/docs/`. Middleware = `src/proxy.ts`. `cacheComponents` ON: anything reading cookies/session/params sits inside `<Suspense>`; no `usePathname` in prerendered fallbacks; no `new Date()` in prerendered components. Page props `PageProps<"/route">` (params/searchParams are Promises). Route files export handlers only.
- React 19 lint is strict: no ref reads during render, no sync setState in effects, no `Date.now()` in render.
- Env only via `lib/env.ts`: `env()` core, `metaEnv()`/`metaConfigured()` (incl. `CONVERSION_TRACKING_VERIFIED`), `aiEnv()`/`aiConfigured()` (GROQ_API_KEY/GROQ_MODEL).
- DB `lib/supabase/server.ts` `db()`; types hand-written in `lib/supabase/types.ts` (mirror migrations); **every query scoped by `user_id`**. Auth `features/auth/dal.ts` `requireUser()` in every protected page **and** server action.
- UI kit `components/ui/{button,field,surface}.tsx`; shell `components/shell/{sidebar-nav,app-sidebar}.tsx` (collapsible, localStorage). Pages stay thin; logic in `features/*`.
- Design: tokens in `app/globals.css` — **never raw hex in components**. Tomato-600 = the one CTA colour, chartreuse = state/selection, lavender = space, ink = text. Pills, flat 4px cards, Manrope. Charts follow the dataviz skill (single hue lavender-deep, no dual axes, tooltips + table view). No fake metrics/testimonials/prices.

## Feature map (`web/src/features`)
- **clients/**, **meta-connect/** — clients, Meta OAuth (owner / invite link / Business Manager), asset picker (ad account, Page, IG, Pixel), readiness. `discovery.ts` (`adAccountHealth`, `listPixels`, `metaLinks`), `store.ts` (`getConnectionToken`). Tokens never leave the server.
- **campaigns/engine/** — **pure** (no `server-only`, relative imports WITH `.ts`, no TS param properties/enums). `schema.ts` (Zod spec, `validateSpec`), `render.ts` (`renderSpec` + `routeFor()` objective×destination table), `builders.ts` (`buildAll` → campaign/adset/ad ops), `presets.ts` (`DESTINATIONS`, `CTA_FOR`), `lead-form.ts`, `guard.ts`, `mock-adapter.ts`. `parity.test.ts`: 25 tests, Python fixtures + every route. Builder emits `instagram_user_id` (Graph v22+ rename).
- **campaigns/create/** — the wizard: Start (goal → destination → business → cities; **AI-only**, Groq drafts everything) → Name & budget → Audience → Placements → Creative → Review. `blueprint.ts` (Draft type, `normalizeDraft`, readiness rules, `destinationOptions`), `start-section`, `audience-section` (+ `area-map`, `audience-estimate`, `audience-targeting`), `sections.tsx`, `carousel-editor`, `lead-form-editor`, `whatsapp-editor`, `pixel-setup`, `destination-details`, `ad-preview` (FB/IG/Stories/Form/WhatsApp/Call/Profile tabs), `launch-panel` + `launch-payload`.
- **campaigns/** (server) — `ai/` (prompts, resolver, actions; per-goal briefs), `media/` (signed browser uploads to private bucket `ad-media`, `push.ts` → Meta at launch), `launch-actions.ts` (`launchDraftAction(payload, "validate"|"live", draftId)`), `launch.ts`, `meta-adapter.ts` (validate_only / live with rollback), `store.ts` + `draft-actions.ts` (drafts, `recordLaunch`, media cleanup), `list.ts` (Campaigns tab data), `audiences/` (custom/lookalike/customer list hashed in browser, `estimate.ts` delivery_estimate), `pixel/` (snippets, create/select, install check with SSRF guard), `whatsapp/` (wa.me links, signed item links).
- **campaigns/manage/** — `actions.ts` (pause/resume[whole tree]/stop=ARCHIVED, budget campaign-or-adset, spend cap; verifies campaign ∈ client ad account), `row-actions.tsx` (Campaigns list ▶/❚❚ + ⋯ dialog).
- **leads/** — `load.ts` (forms + leads live via Page token, nothing stored), `csv.ts` (pure, formula-safe) → `/leads`, `/api/leads/csv`.
- **billing/** — `plans.ts` (pure `computeAccess`, tiers), `razorpay.ts` (REST + signatures), `access.ts` (`getAccess`, `requireActivePlan`, `enforceBilling` auto-pause/resume; paused ids in `subscriptions.paused_campaign_ids` as `{at,ids:["clientId:campaignId"]}`), `actions.ts` (checkout.js subscribe/confirm/cancel), `pricing.ts`. Starter self-serve; agency tiers set by admin (invoice).
- **account/** (password, delete account + Storage), **admin/** (`/admin`: tier, mark paid, trial +7d, end access).
- **meta-connect/** extras: `page-token.ts`, `signed-request.ts` (data-deletion/deauthorize), `test-token-actions.ts` (admin: connect client with a Graph Explorer token). `META_SANDBOX_AD_ACCOUNT_ID` adds a sandbox account to the picker.
- **dashboard/** — `metrics.ts` (pure: windows in account tz, results without double count, rates), `load.ts` (Meta Insights per client), components (filters, KPI tiles, trend charts, placements, tables, alerts).

## What the create flow supports
- Objectives × destinations: Leads → instant form / WhatsApp / call / website form (Pixel) · Traffic → website / Instagram profile · Awareness → reach (frequency cap) · Engagement → WhatsApp / Messenger / Instagram DM · Sales → website (Pixel). Buttons limited per destination (`CTA_FOR`), validated server-side.
- Formats: single image (1:1 + optional 4:5 / 9:16), carousel (2–10 cards, AI card text), video (auto cover). WhatsApp: number, greeting, pre-filled message or quick questions; carousel "message about that item" switches to Traffic + per-card wa.me links with public `/w/[token]` item pages (needs public https `APP_URL`).
- Locations: AI returns **names only**; `campaigns/geo/resolve.ts` turns them into **Meta location ids** (city / neighbourhood / subcity / PIN via `search?type=adgeolocation` + `adgeolocationmeta`). **Targeting needs only Meta**; OpenStreetMap only puts areas on the map (Meta gives cities and PINs no coordinates) and supplies a pin for areas Meta lacks: Photon first, Nominatim second (queued 1 req/s, knows old names like Bangalore→Bengaluru; Photon outage 2026-11-13). Map down → the Meta area is still added with `lat/lng: null` ("not on the map right now", position from the city's Meta neighbourhoods when it has any); `MapSearchUnavailableError` only when Meta doesn't list the place either. A neighbourhood is accepted when Meta's `city_id` = the town's key, or it is ≤25 km from the town in the same state (Vashi is filed under Navi Mumbai). Name match in `geo/match.ts` (Indiranagar→Indira Nagar); a renamed city (Bengaluru → Meta "Bangalore") is accepted when its Meta neighbourhoods sit round the map's centre. Hyper-local = Meta neighbourhoods; town with none → whole town. City ids: whole town or +17–80 km. **Circle instead of the Meta area** (Audience → per-area toggle + radius slider `RadiusSlider`, stops not linear; `Segmented variant="bar"`; `DraftPin.origin` remembers the Meta id; sent as a plain custom location): town = Whole town / Smaller (1–15 km circle) / Bigger (town + 17–80 km); neighbourhood = Neighbourhood / Wider circle (1–5 km); pin = slider 1–80 km; none for PINs. **Measured on Meta (delivery_estimate, 2026-11-13): neighbourhood ids are the tightest (Lalpur 7–8K vs a 1 km circle there 740–870K); circles are coarse in India (Ranchi 1 km ≈ 0.8M of 2.1–2.5M; Chaibasa 1–5 km ≈ 100K of 153–180K); a PIN ≈ its whole town; `location_types` home-only changes nothing.** Dragging a Meta area turns it into a circle. "Add area" = direct lookup (town, "Area, City", 6-digit PIN), no AI. Meta withholds Page `whatsapp_number` in dev mode → WhatsApp Test shows "unknown".
- Audience: core (areas on a map, age, gender, phone OS, language) · custom (customer list / website / FB / IG engagers) · lookalike · exclusions · live size estimate. Interests are AI suggestions only (not sent to Meta yet).
- Interests: names matched to real Meta ids at launch (`interests.ts`, top match each).
- Drafts autosave to DB (`?draft=<id>`); Review has **Check with Meta** (validate) · **Launch** (ACTIVE, after Meta review) · **Pause** (created PAUSED), both confirmed; live launch + resume need an active trial/plan; after a live launch the row stores Meta ids and uploaded media is deleted (except WhatsApp per-item pictures).

## Routes
Public: `/`, `/login`, `/signup`, `/privacy`, `/terms`, `/refund`, `/service`, `/data-deletion` (`?code=`), `/connect/[token]`, `/w/[token]` (+ `/image`).
App: `/dashboard` (`?range=today|7d|14d|30d|month&client=`), `/campaigns` (live list + drafts, `?client&status&q&sort`), `/campaigns/new` (`?draft=`), `/clients`, `/clients/[id]`, `/clients/business/[id]`, `/leads` (`?client&form`), `/account`, `/admin` (is_admin). Proxy guards `/dashboard|campaigns|clients|leads|account|admin`.
API: `/api/meta/oauth/start`, `/api/meta/oauth/callback`, `/api/meta/data-deletion`, `/api/meta/deauthorize` (signed_request), `/api/razorpay/webhook`, `/api/cron/billing` (Bearer `CRON_SECRET`, `vercel.json` daily), `/api/leads/csv`.

## Database (Supabase `hgslohnagcdtqxxzsbzl`, ap-south-1, free tier 500 MB DB / 1 GB Storage)
Migrations `web/supabase/migrations/` — **0001–0004 applied**. Tables: users, sessions, subscriptions, clients (+asset cols, `meta_connection_id`; unique user_id+ad_account_id), meta_connections, meta_oauth_states, meta_oauth_pending (unused), client_invites, **campaigns** (state draft|launched, text only, `draft` jsonb ≤200 KB, meta_* ids). RLS on, no policies (service role only).
- **Never change schema without the user's explicit approval**: write `000N_*.sql` → dry-run in a rolled-back txn via `psql "$DATABASE_URL"` (from `web/.env.local`) → show SQL + ask → apply.
- Keep the DB text-only (user's request): media stays in Storage as paths. Storage bucket created by `pnpm run setup:storage`.
- Admin seed: `pnpm run seed:admin`.

## Meta facts / gotchas
- Login for Business config (`META_LOGIN_CONFIG_ID`, ~60-day user token); optional `META_BUSINESS_CONFIG_ID` (system user). App in **Development mode**: system-user tokens lack ads permissions → BM import fails (#200) until Advanced Access.
- `META_API_VERSION` should be `v23.0` (user bumped locally). Lookalike `country` only sent for API < v27.
- Readiness: account_status 1 = active; `funding_source_details` = payment method. API can't add funds → deep links.
- Limited-availability: Instagram-profile traffic ads. WhatsApp ads need the Page linked to a WhatsApp Business number. Custom audiences may need ToS acceptance (we return the link).
- Lead forms are created with a **Page token** (`GET /{page}?fields=access_token`); rollback archives forms (they can't be deleted).
- Dev-mode apps: Meta may reject ads with "creative created by an app in development mode" (#1885183) → app must be switched to **Live** (needs privacy URL, data-deletion URL, icon, category) — Standard Access still works for accounts with app roles.
- **Verified on real Meta (2026-11-10, app Live, Chaitali ad account 983561041272004):** Leads→WhatsApp and Leads→Instant form launched (paused), lead retrieval via Lead Ads Testing Tool, Meta location ids. Non-discrimination policy must be accepted on facebook.com (no API).

## Status
1. ✅ Foundation · 2. ✅ Clients + Meta connect · 3. ✅ Campaign engine · 4. ✅ Create wizard (feature-complete, untested on real Meta).
5. ✅ Dashboard + Manage (pause/resume/stop, budget, spend cap) + lead inbox/CSV — built 2026-11-09, untested on real Meta.
6. ✅ Billing + admin. Razorpay **LIVE on Vercel since 2026-11-11** (test checkout + test webhook verified end to end; live checkout opens, live webhook secret verified). Local `web/.env.local` stays on **test** keys; live pair commented there + in root `.env`. Live plan = `plan_SqLZ…` "Meta Ads Starter — INR" ₹999 (not `plan_To8g…`, that is the shryxa-review app's ₹199 plan; same Razorpay account/keys shared with shryxa-review — never regenerate keys without updating both). Data-deletion page + callbacks built.
7. ⏳ Cutover (retire Streamlit, tighten DB types).
Later: ad text in Indian languages, app UI translation, team seats (multi-login per account).

## App Review (Advanced Access) — after Phase 5
Reviewers must see each permission used (ads_management/pages_manage_ads → create/edit; leads_retrieval → lead fetch). Checklist: data-deletion URL `${APP_URL}/api/meta/data-deletion` + deauthorize `${APP_URL}/api/meta/deauthorize` (built; set in Meta app settings), reviewer demo account, app icon/category/contact, privacy+terms (exist), production redirect URI, Vercel env complete, per-permission usage text, end-to-end screencast.

## Working agreements
- Commit only when asked; stage only `web/` + `CLAUDE.md` (never `.env*`, never stray Python/.bak files). Claude's shell has no GitHub credentials → **user pushes** (`git push origin main`). Trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verify UI: `pnpm run build` + `pnpm start -p 3123` + headless Chrome (`/usr/bin/google-chrome`, puppeteer-core + supabase-js installed in the session scratchpad). Test users `e2e-%@example.com` with dummy-token clients (unique ad_account_id per client); delete them and their Storage files afterwards. Real accounts: admin (id 1) + user's business test account — don't delete.
- Vercel env needed: Supabase keys, all `META_*`, `APP_URL` (public https), `GROQ_API_KEY`, `GROQ_MODEL`, `RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_PLAN_ID_INR/USD`, `RAZORPAY_WEBHOOK_SECRET`, `CRON_SECRET`.
- Explain simply; the user prefers short answers and screenshot-driven debugging.

## Next up
1. **App Review SUBMITTED 2026-11-11 — "Review in progress" (Meta: up to ~20 days).** Don't change login config, demo account or app URL meanwhile. Requested: Advanced Access requested for ads_management, ads_read, business_management, pages_show_list, pages_read_engagement, pages_manage_ads, leads_retrieval, instagram_basic (+ Marketing API Access Tier once its 500-call counter turns green — ~507 read-only calls run 2026-11-10, Meta updates within ~24 h). Reviewer demo Shryxa account: `meta.reviewer@shryxaads.com` (agency_lite, active manual plan to 2027-11; password given to user, not stored here). Screencast: `~/Videos/Screencasts/shryxa-review-captioned.mp4`. Don't request read_insights (unused) — remove it from the Login config.
2. USD plan once Razorpay international cards approved.
3. Remaining route tests (Traffic/website, Awareness, Engagement).
4. **Sister product planned (2026-11-12): Shryxa Chat** — WhatsApp broadcasts for local businesses; separate repo, separate DB, new Meta app (Tech Provider, coexistence mode, no inbox), ₹199/mo. It will share this Razorpay account, so other apps' subscription events and payments reach this app too. Guard added 2026-11-12: `isOurSubscription()` (`billing/razorpay.ts`, pure `isOwnPlan` in `plans.ts`) — the webhook's `notes.user_id` fallback and `confirmCheckoutAction` only accept subscriptions on `RAZORPAY_PLAN_ID_INR/USD`; a stored subscription id still matches whatever its plan. Webhook verified locally with signed fake events.
