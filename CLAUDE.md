# Shryxa Ads — project memory for Claude

Read this first instead of re-scanning the repo. Keep it short and current: update **Phases** / **Next up** after meaningful work.

## Product
SaaS for local businesses and agencies to create, launch and manage **Meta (FB/IG) ad campaigns** without Ads Manager.
Two account types: **business** (one auto client "My business") and **agency** (many clients). Billing via Razorpay (INR/USD, 2-day trial; tiers: starter 1 client, agency_lite 5, agency_standard 10, agency_pro 25 clients/5 seats). Known price: Starter ₹999/mo, $21 intl (agency prices unknown).

## Repo layout
- `web/` — **the Next.js app (active)**. Deployed on Vercel (Root Directory `web`).
- Root Python/Streamlit app — **legacy reference, being ported**. Run: `uv run streamlit run dashboard/app.py`.
  - `payload_pipeline/` Pydantic schema → builders → ordered Meta create-calls; adapters mock / validate-only / live; v1 = Traffic objective, single-image ad, lead forms (`lead_form_create.py`), image upload (`upload_image.py`).
  - `yaml_render.py` (dashboard inputs → launcher spec), `presets.py` (currency presets), `llm_resolver.py` (Groq ad copy + city→geo), `meta_utils.py` (interest IDs), `live_fetcher.py` (insights, pause/resume/stop), `preview_mockups.py`, `demo_data.py`, `auth/pause_resume.py`, `auth/subscription.py` (Razorpay), `benchmark_bridge.py` (external CLI — can't run serverless; undecided).

## Stack decisions (agreed)
Next.js 16 App Router + TS · Tailwind 4 · Zod 4 · **`@supabase/supabase-js` only, no ORM** (server-side service-role client) · custom auth on legacy `users`/`sessions` tables (bcrypt-compatible) · Fernet-compatible token crypto · lucide icons · react-markdown (legal pages). Uploads → Supabase Storage (planned). Razorpay → webhook (planned).

## Next.js conventions (`web/`)
Run `cd web && pnpm dev` · verify `pnpm lint && pnpm build` (use `pnpm run <script>`; pnpm 12). After adding routes run `npx next typegen` before `tsc`.
- **Next 16 differs from training data** → read `web/node_modules/next/dist/docs/` first. Middleware = `src/proxy.ts`. `cacheComponents` ON: anything reading cookies/session/params must sit inside `<Suspense>` (see `(app)/layout.tsx` Gate); no `usePathname` in prerendered fallbacks; no `new Date()` in prerendered components. Route files may only export handlers. Page props: `PageProps<"/route/[id]">` (params/searchParams are Promises).
- React 19 forms: server action forms auto-reset after submit → for controlled selects submit via `onSubmit` + `startTransition(() => formAction(fd))`. Disabled inputs aren't submitted → use `aria-disabled` or make the Zod field `.optional()`.
- Env only via `lib/env.ts` (`env()` core, `metaEnv()`/`metaConfigured()` Meta — separate so the app runs without Meta keys).
- DB: `lib/supabase/server.ts` `db()`; types hand-written in `lib/supabase/types.ts` (mirror migrations). Every query scoped by `user_id`.
- Auth: `features/auth/` (`session.ts` cookie `shryxa_session`, `dal.ts` `getCurrentUser`/`requireUser`/`requireAdmin` — call in every protected page AND server action, `actions.ts`).
- UI kit: `components/ui/{button,field,surface}.tsx`, `components/brand/wordmark.tsx`, `components/shell/{auth-frame,sidebar-nav}.tsx`. Feature folders: `features/{auth,clients,meta-connect,campaigns,marketing,legal}`; pages stay thin.
- Campaign engine `features/campaigns/engine/` = **pure** (no `server-only`, no `@/` alias, relative imports WITH `.ts` extension, no TS parameter properties/enums) so Node runs it natively: `schema.ts` (Zod port of schemas.py, snake_case Meta fields, `validateSpec`), `builders.ts` (`buildAll` → ordered ops, placeholders, `substitute`), `render.ts` (`renderSpec` = yaml_render port, `stamp` param), `presets.ts`, `lead-form.ts`, `guard.ts` (pilot guard), `mock-adapter.ts` (`runMock`), `run-result.ts`. Server side: `meta-adapter.ts` (`runMeta` validate|live, JSON-string form params, reverse-order rollback), `images.ts` (adimages `bytes`, mock = md5), `interests.ts`, `launch.ts` (`launchCampaign(userId, clientId, input, mode)` — uses client's saved assets + connection token).
- Parity: `pnpm run test:engine` (node:test vs `engine/__fixtures__/python-parity.json`). Regenerate fixtures from repo root: `uv run python web/scripts/campaign-parity/gen_fixtures.py`. `CONVERSION_TRACKING_VERIFIED` env (metaEnv) unlocks conversion objectives.
- Meta: `lib/meta/graph.ts` (`graphGet/graphPost/graphList`, appsecret_proof, `MetaApiError.isAuthError/isPermissionError`, `buildLoginUrl(state, configId?)`, `exchangeCode`), `lib/crypto/fernet.ts`. `features/meta-connect/`: `store.ts` (OAuth state, connections, invites, business connections), `discovery.ts` (assets, ad-account health, readiness, `REQUIRED_SCOPES`, Meta deep links), `client-meta.ts` (`loadClientMeta`), `assets.ts` (validated asset save). Decrypted tokens never leave the server.

## Routes
Public: `/`, `/login`, `/signup`, `/privacy`, `/terms`, `/refund`, `/service`, `/connect/[token]` (client invite).
App: `/dashboard` (placeholder KPIs), `/clients` (business → redirects to own client; agency → list + BM card + add), `/clients/[id]` (connect / invite / use BM, asset picker, readiness), `/clients/business/[id]` (BM import), `/campaigns` (empty-state placeholder), `/campaigns/new` (create blueprint). Proxy guards `/dashboard|campaigns|clients|account|admin`.
API: `/api/meta/oauth/start` (`?client=` | `?invite=` | `?business=1`), `/api/meta/oauth/callback`.

## Database (Supabase project `hgslohnagcdtqxxzsbzl`, ap-south-1)
Migrations in `web/supabase/migrations/` — **0001, 0002, 0003 applied**. Tables: users (+account_type), subscriptions, clients (+asset cols: ad_account/page/instagram/pixel ids+names, is_self, meta_connection_id), sessions, meta_connections (source owner|invite|business, token_type user|system_user, granted_scopes), meta_oauth_states (flow, invite_id, nullable client_id), meta_oauth_pending (legacy, unused), client_invites. RLS on, no policies.
- **Never change schema without the user's explicit approval.** Workflow: write `000N_*.sql` → dry-run in a rolled-back txn via psql (`DATABASE_URL` in `web/.env.local`, password URL-encoded) → show SQL + ask → apply.
- Legacy-compatible types kept (TEXT timestamps, int is_admin) — tighten at cutover.
- Admin seed: `cd web && pnpm run seed:admin` (from ADMIN_EMAIL/ADMIN_PASSWORD; idempotent).

## Meta integration facts / gotchas
- Facebook Login for Business with `META_LOGIN_CONFIG_ID` (user token → exchanged to ~60-day). Optional `META_BUSINESS_CONFIG_ID` = system-user config (never expires) for agency "Connect Business Manager".
- App is in **Development mode**: app-role users (admin) get all permissions; **system-user tokens did NOT receive ads_management / ads_read / business_management** (likely Standard-Access only) → BM import fails with #200 until Advanced Access. Workaround: unset `META_BUSINESS_CONFIG_ID` to use the user-token config.
- Page greyed out in Facebook's asset dialog = business portfolio lacks full control of that Page.
- `META_API_VERSION=v19.0` in env is probably retired → user should bump to current.
- Readiness: account_status 1 = active; `funding_source_details` present = payment method (prepaid balance counts); spend_cap readable/settable. Meta API can't add funds/payment methods → deep links.

## Design system — "catalog brochure", 3 colours
Tokens in `web/src/app/globals.css` (`@theme`); never raw hex in components.
lavender #C8B6FF (stage/surface) · lavender-soft #EFE9FF (app bg) · lavender-deep #6B4FD8 (focus ring, small accents) · chartreuse #D4FF3A (selection/active/success, ink text only) · chartreuse-soft #F4FFD1 · tomato #FF5A3C (brand energy, decor) · tomato-600 #D93A1F (**primary CTA**, white text) · tomato-700 #B8301A (links/errors) · tomato-soft #FFE6E0 · ink #2A2733 (text, sidebar) · ink-muted #6E6A7C · line #DCD6EA · paper #FFF.
- Tomato = the one action colour; chartreuse = state; lavender = space. Destructive = outline `danger` button, not red fill. Chips: ACTIVE chartreuse, PAUSED lavender, STOPPED tomato-soft.
- Pill buttons/chips, cards 4px flat no border, inputs 6px; only CTA pills get shadow. Manrope 400/700/800, tracking -0.007em; app interior dense (15px body), marketing large. Lowercase wordmark `shryxa ads.`; prose name "Shryxa Ads".
- Landing-only decoration: `grain`, `mesh-hero`, `mesh-soft`, `pattern-*`, `animate-*`, `<Reveal>` (reduced-motion safe). Keep the app interior calm. AA contrast; lucide 1.5–2px icons.
- No fake testimonials, metrics, logos or invented prices.

## Phases (✅ done · ⏳ next)
1. ✅ **Foundation** — scaffold, auth, app shell, landing, legal pages, Vercel deploy.
2. ✅ **Clients + Meta connect** — account types; (A) owner connect + client invite links (real-login verified); (B) Business Manager connect + bulk import (built; real import blocked by dev-mode permissions, see gotchas).
3. ✅ **Campaign engine port** — schema/builders/render/presets/lead forms/guard/mock ported; 18/18 parity tests match Python byte-for-byte (incl. mock form ids). Validate/live adapter, image upload, interest lookup, `launchCampaign` written + type-checked but **not yet run against real Meta** (do a validate-only run first in Phase 4). Not ported: `llm_resolver` (Groq copy + city→geo) → Phase 4.
4. ⏳ **Create wizard + preview** — blueprint built: `features/campaigns/create/` (`blueprint.ts` = LEVELS Start[one step: objective dropdown → destination (`DESTINATIONS_FOR`) → business → cities; `GOAL_GUIDE` in prompts.ts gives the AI a per-goal writing brief] → Campaign[Name & budget] → Ad set[Audience, Placements] → Ad[Creative] → Review, `Draft` state, `PLANNED` per-module to-build lists; `create-campaign.tsx` rail + summary; `sections.tsx` one component per module). Start is **AI-only** (no manual mode): `create/start-section.tsx` → `features/campaigns/ai/actions.ts` `generateSetupAction` (Groq via `lib/ai/groq.ts`, `aiEnv()` GROQ_API_KEY/GROQ_MODEL; `ai/prompts.ts` pure = llm_resolver port + campaign name/daily budget/CTA; locations + copy run in parallel, ~3 s) fills name, budget, pins (lat/lng/radius/why), age, gender, interests, copy, CTA; all editable. `audience-section.tsx` edits pins + `resolveAreaAction` adds areas. Interests are AI suggestions only, not sent to Meta (Python disabled them: wrong-country matches). Optional **ideal customer** text in Start → AI also returns `device_os` (all|android|ios) + `audience_why`; Audience has a Phone type control → engine `user_os` + `device_platforms:["mobile"]` (render `deviceOs`, `publisherPlatforms`); any phone type forces manual placements (Meta rule). Images stay manual. Destination is chosen in Start (Leads: instant form; WhatsApp/call soon; website form needs Pixel · Traffic: website); Creative shows it read-only. Client-side state only, not yet wired to `launchCampaign`. Build each module deeply next, one at a time. Original scope: client → destination (website/lead form) → creative upload (Supabase Storage) → AI copy (Groq) → geo (city → radii) → placement previews (reuse landing `ad-mockups`) → launch PAUSED by default.
5. ⏳ **Dashboard + Manage** — insights, KPI grid, campaign table pause/resume/stop, spend cap, leads retrieval.
6. ⏳ **Billing + admin** — Razorpay checkout + webhook, trial expiry, auto pause/resume, admin panel; add prices to landing Plans.
7. ⏳ **Cutover** — retire Streamlit, tighten DB types.

## App Review (Advanced Access) — after Phases 3–5
Reviewers must see each permission used (ads_management/pages_manage_ads need campaign create/edit; leads_retrieval needs lead fetch). Prep checklist: data-deletion page/callback (**missing**), reviewer demo account seed, app icon/category/contact, privacy+terms URLs (exist), production redirect URI, Vercel env complete, per-permission usage text, one end-to-end screencast. Check Marketing API access tier in the dashboard.

## Working agreements
- Commit only when asked; stage only `web/` + `CLAUDE.md` (never `.env*`, never the user's stray Python/.bak files). Claude's shell has no GitHub credentials → **user pushes**. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verify UI with `pnpm build` + `pnpm start -p 3123` + headless Chrome (`/usr/bin/google-chrome`, puppeteer-core in session scratchpad); delete `e2e-%@example.com` test users afterwards. Real accounts in DB: admin (id 1) + user's business test account — don't delete.
- Explain things simply; the user prefers short answers and screenshots-driven debugging.

## Next up
Phase 4: create wizard. First step: a server action calling `launchCampaign(..., "validate")` on the user's test client to prove the live adapter; then wizard UI, Supabase Storage uploads, Groq port. Open items for the user: bump `META_API_VERSION`; set all Meta env vars on Vercel (incl. `APP_URL`); re-test BM import after Advanced Access.
