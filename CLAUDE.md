# Shryxa Ads — project memory for Claude

Read this first. Keep it short and current: update **Status** and **Decisions** whenever something changes.

## What it is
SaaS for businesses/agencies to create, launch and manage **Meta (FB/IG) ad campaigns** without Ads Manager.
Billing via Razorpay (INR/USD, 2-day trial, tiers limit clients/seats). Multi-client: each client connects own Meta account via OAuth.

## Current app (legacy, Python/Streamlit) — being migrated
Run: `uv run streamlit run dashboard/app.py`
- `auth/` — bcrypt login + `sessions` table cookie, Razorpay subscription, page gate, auto pause/resume campaigns on lapse, Meta OAuth, Fernet token encryption (`META_TOKEN_ENCRYPTION_KEY`), `db.py` = raw SQL on Supabase Postgres.
- `dashboard/views/` — login, dashboard (KPIs), create (campaign builder), preview (FB/IG mockups), manage (pause/resume/stop), clients, account, admin, policy pages (privacy/terms/refund/service).
- `payload_pipeline/` — Pydantic schema → builder → ordered Meta API calls; adapters: mock / validate-only / live. v1 = Traffic objective, single-image ad, lead forms, image upload.
- Root: `llm_resolver.py` (Groq: ad copy + city geo), `live_fetcher.py` (insights + status mutate), `yaml_render.py`, `preview_mockups.py`, `presets.py` (currency), `demo_data.py`, `meta_utils.py` (interest IDs), `benchmark_bridge.py` (external CLI — can't run serverless).

DB tables (public, Supabase): `users`, `subscriptions`, `clients`, `sessions`, Meta connection / OAuth state / OAuth pending tables. **Never alter schema without explicit approval.**

## Migration target: Next.js
- Next.js App Router + TypeScript, Tailwind + shadcn/ui.
- **DB access: `@supabase/supabase-js` only (no Drizzle/ORM).** Server-side with service-role key (never shipped to browser). Types via `supabase gen types typescript`. Atomic multi-step ops (e.g. consume OAuth state) → Postgres functions called with `.rpc()` (requires approval since it adds DB objects).
- Validation: Zod (replaces Pydantic).
- Keep existing custom auth (users + sessions tables, bcrypt hashes compatible). Fernet-compatible decrypt in Node so stored Meta tokens keep working.
- Razorpay → webhook route instead of polling. Uploads → Supabase Storage.
- Planned location: `web/` in this repo; Streamlit stays live until cutover.
- Feature-based structure: `src/features/{auth,billing,clients,meta-connect,campaigns,ai}`, `src/lib/{supabase,meta-graph}`, thin pages in `src/app/(public|app)`, `api/meta/oauth/callback`, `api/webhooks/razorpay`.

## Design system — "catalog brochure", 3-color
Style DNA (from user's reference): bold full-bleed color bands stacked vertically, flat borderless cards, pill CTAs with the only shadow, one geometric sans, oversized **lowercase** wordmark `shryxa` (800). Feels like a printed product catalog, not generic SaaS. Base = **Lavender + Chartreuse + Tomato**, layered as "complex texture" (grain + soft mesh gradients). Tokens live in `web/src/app/globals.css` (`@theme`) — use tokens, never raw hex in components.

| Token | Hex | Role |
|---|---|---|
| `lavender` | #C8B6FF | Stage/canvas: hero bands, auth backdrop, chart series 1 |
| `lavender-soft` | #EFE9FF | App page background, recessed surfaces |
| `lavender-deep` | #6B4FD8 | Focus ring (2px), small accents on white (5.6:1) |
| `chartreuse` | #D4FF3A | Brand band, active nav pill, selected state, "ACTIVE"/success chip. Ink text only; never text-on-white |
| `chartreuse-soft` | #F4FFD1 | Highlight rows, success callout |
| `tomato` | #FF5A3C | Brand energy: large shapes, illustrations, texture blobs, ink-text chips |
| `tomato-600` | #D93A1F | **Primary CTA fill** (white text 4.6:1), hover → `tomato-700` #B8301A |
| `tomato-700` | #B8301A | Links on white, error text (6:1) |
| `tomato-soft` | #FFE6E0 | Error / danger callout fill |
| `ink` | #2A2733 | All text, sidebar, footer band (never #000) |
| `ink-muted` | #6E6A7C | Helper text |
| `line` | #DCD6EA | Hairline dividers only |
| `paper` | #FFFFFF | Cards, inputs on colored bands |

Rules
- Tomato = the one action color (primary buttons, key links). Chartreuse = state/selection. Lavender = space/surface. Don't add other hues (charts may use tints of the 3).
- Destructive actions (stop campaign, delete client): ink outline button + `tomato-700` text + confirm dialog — not a filled red button.
- Status chips: ACTIVE chartreuse, PAUSED lavender, STOPPED/ERROR tomato-soft (ink text).
- Radii: buttons/tags/chips = full pill; cards 4px; inputs 6px. Shadow `0 2px 8px rgb(0 0 0/.15)` only on CTA pills. Cards flat, no border (separate by surface color).
- Texture: subtle SVG grain overlay (~6% opacity) on bands + radial mesh gradients mixing the 3 hues on hero/auth. Keep data areas clean (no texture under tables/charts).
- Type: Manrope (Roobert substitute) 400/700/800, tracking -0.007em. Marketing/public: brochure scale (body 20–22px, hero 68px+). App interior: dense scale (body 15px, labels 13px, headings 20–32px). Line-height display 1.0, body 1.4.
- Layout: public pages = full-bleed alternating bands (lavender → chartreuse → paper → ink footer), 1200px max, ~640px text measure. App = ink sidebar (chartreuse active pill) + lavender-soft content area. Base spacing unit 4px, section padding 60–120px.
- Icons: mono-stroke line icons 1.5–2px (lucide).
- Accessibility: keep AA contrast; pairs above are pre-checked.

## Next.js app (`web/`) — conventions
Run: `cd web && pnpm dev` · check: `pnpm lint && pnpm build`. Env: copy `web/.env.example` → `web/.env.local`.
- **Next 16**: read `web/node_modules/next/dist/docs/` before using unfamiliar APIs. Middleware is `src/proxy.ts`. `cacheComponents` is ON → anything reading cookies/session must be inside `<Suspense>` (see `(app)/layout.tsx` Gate pattern); avoid `new Date()` in prerendered components.
- Auth: `features/auth/` — `session.ts` (cookie `shryxa_session` ↔ `sessions` row), `dal.ts` (`getCurrentUser`/`requireUser`/`requireAdmin`; call in every protected page + server action), `actions.ts` (login/signup/logout, Zod-validated, `useActionState`). Signup compensates (deletes user) if subscription insert fails.
- DB: `lib/supabase/server.ts` `db()` (service role, server-only). `lib/supabase/types.ts` is hand-written → replace with generated types.
- Env: only via `lib/env.ts` (Zod).
- UI kit: `components/ui/{button,field,surface}.tsx` (Button/ButtonLink variants primary|secondary|ghost|danger|invert; Input/Select/Field; Card/Chip/Callout/Band), `components/brand/wordmark.tsx`, `components/shell/{auth-frame,sidebar-nav}.tsx`. Texture utilities: `grain`, `mesh-hero`, `mesh-soft`.
- Routes: `(public)/` → `/`, `/login`, `/signup`; `(app)/` → `/dashboard` (placeholder KPIs). Proxy guards `/dashboard|campaigns|clients|account|admin`.

## Phases
1. Foundation (project, supabase client, auth, policy pages)
2. Clients + Meta OAuth
3. Campaign engine port (schema/builder/adapters, mock first, parity with Python)
4. Create wizard + preview
5. Dashboard + Manage
6. Billing + admin
7. Parallel run on same DB → cutover

## Open decisions
- Benchmark report (external CLI): drop / port / separate service?
- Hosting (Vercel assumed). Meta app redirect URI must be updated at cutover.

## Status
- 2026-11-08: Plan agreed; supabase-js chosen over Drizzle. Design system recorded (lavender/chartreuse/tomato).
- 2026-11-08: Phase 1 started. `web/` scaffolded (Next 16.4, Tailwind 4, Zod 4, supabase-js, bcryptjs, lucide). Tokens + UI kit, landing, login, signup, app shell + dashboard placeholder built; `pnpm build` passes; visually checked desktop + mobile.
  - DB: NEW Supabase project ref `hgslohnagcdtqxxzsbzl` (ap-south-1). Both `.env` files point to it (`DATABASE_URL` password is URL-encoded — it contains special chars).
  - Schema `web/supabase/migrations/0001_initial_schema.sql` APPLIED 2026-11-08 (7 tables, RLS on/no policies; legacy-compatible TEXT timestamps + int is_admin on users/subscriptions/clients/sessions — tighten at cutover). New migrations: add `0002_*.sql`, dry-run inside a rolled-back txn with psql first.
  - Admin seeded via `pnpm run seed:admin` (`web/scripts/seed-admin.mts`, idempotent): user id 1, is_admin=1, agency_pro, subscription active/manual.
  - Auth verified end-to-end in headless Chrome (wrong pw, admin login, logout, proxy redirect, signup validation, duplicate email, new signup → trialing). E2E script lives in scratchpad only (not committed).
  - Note: use `pnpm run <script>` (pnpm 12 rejects `pnpm -s`).
  - 2026-11-08: committed `f0678d4` on main (web/ + CLAUDE.md only; user's Python OAuth edits + .bak files intentionally left uncommitted). Push failed from Claude's shell (no GitHub credentials) → user pushes manually. Deploy: Vercel, Root Directory `web`, env SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. If pnpm install fails on Vercel (packageManager pnpm@12), add env ENABLE_EXPERIMENTAL_COREPACK=1.
  - Phase 1 TODO: port policy pages (privacy/terms/refund/service) + footer links; then Phase 2 (clients + Meta OAuth).
