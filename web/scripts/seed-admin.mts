/**
 * Create (or update) the admin user from ADMIN_EMAIL / ADMIN_PASSWORD.
 * Idempotent: re-running updates the password and keeps admin rights.
 *
 *   cd web && pnpm run seed:admin
 */
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name} in web/.env.local`);
    process.exit(1);
  }
  return v;
}

const url = need("SUPABASE_URL");
const key = need("SUPABASE_SERVICE_ROLE_KEY");
const email = need("ADMIN_EMAIL").toLowerCase();
const password = need("ADMIN_PASSWORD");

if (password.length < 8) {
  console.error("ADMIN_PASSWORD must be at least 8 characters.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const now = new Date();
const farFuture = new Date(now.getTime() + 3650 * 86_400_000).toISOString();

const admin = {
  email,
  password_hash: await bcrypt.hash(password, 12),
  currency: "INR",
  tier: "agency_pro",
  client_limit: 25,
  team_seats: 5,
  is_admin: 1,
  created_at: now.toISOString(),
  trial_ends_at: now.toISOString(),
};

const { data: existing, error: findErr } = await db.from("users").select("id").eq("email", email).maybeSingle();
if (findErr) throw new Error(`Lookup failed: ${findErr.message} (did you run the migration?)`);

let userId: number;
if (existing) {
  const { password_hash, currency, tier, client_limit, team_seats, is_admin } = admin;
  const { error } = await db
    .from("users")
    .update({ password_hash, currency, tier, client_limit, team_seats, is_admin })
    .eq("id", existing.id);
  if (error) throw new Error(`Update failed: ${error.message}`);
  userId = existing.id;
  console.log(`Updated existing admin (id ${userId}).`);
} else {
  const { data, error } = await db.from("users").insert(admin).select("id").single();
  if (error) throw new Error(`Insert failed: ${error.message}`);
  userId = data.id;
  console.log(`Created admin (id ${userId}).`);
}

const { error: subErr } = await db.from("subscriptions").upsert(
  { user_id: userId, status: "active", provider: "manual", current_period_end: farFuture },
  { onConflict: "user_id" },
);
if (subErr) throw new Error(`Subscription upsert failed: ${subErr.message}`);

console.log(`Admin ${email} ready: tier agency_pro, subscription active (manual).`);
