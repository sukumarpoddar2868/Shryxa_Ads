import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once on first use.
 * Add new variables here (and to .env.example) — never read process.env elsewhere.
 */
const EnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SESSION_DAYS: z.coerce.number().int().positive().default(30),
  TRIAL_DAYS: z.coerce.number().int().positive().default(2),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Meta settings are validated separately so the rest of the app (auth,
 * landing) keeps working when they are not configured yet.
 */
const MetaEnvSchema = z.object({
  APP_URL: z.url().transform((u) => u.replace(/\/+$/, "")),
  META_APP_ID: z.string().min(5),
  META_APP_SECRET: z.string().min(10),
  META_LOGIN_CONFIG_ID: z.string().min(5),
  // Optional second Login-for-Business config with a *system-user* token
  // (never expires) for agencies connecting a whole Business Manager.
  META_BUSINESS_CONFIG_ID: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  META_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),
  // Optional Marketing API sandbox ad account (act_… or digits): offered in the
  // asset picker whenever the connected login can read it.
  META_SANDBOX_AD_ACCOUNT_ID: z
    .string()
    .optional()
    .transform((v) => v?.trim().replace(/^act_/, "") || undefined),
  META_TOKEN_ENCRYPTION_KEY: z.string().length(44),
  // "true" only once Pixel + CAPI are verified: unlocks conversion objectives
  // (Sales, Website leads). Instant Form leads never need it.
  CONVERSION_TRACKING_VERIFIED: z
    .string()
    .optional()
    .transform((v) => v?.trim().toLowerCase() === "true"),
});
export type MetaEnv = z.infer<typeof MetaEnvSchema>;

let metaCached: MetaEnv | null = null;
export function metaEnv(): MetaEnv {
  if (metaCached) return metaCached;
  const parsed = MetaEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Meta is not configured: ${missing}. See web/.env.example.`);
  }
  metaCached = parsed.data;
  return metaCached;
}

export function metaConfigured(): boolean {
  return MetaEnvSchema.safeParse(process.env).success;
}

/** Groq (AI copy + locations). Optional so the app runs without it. */
const AiEnvSchema = z.object({
  GROQ_API_KEY: z.string().min(10),
  GROQ_MODEL: z
    .string()
    .optional()
    .transform((v) => v?.trim() || "openai/gpt-oss-120b"),
});
export type AiEnv = z.infer<typeof AiEnvSchema>;

let aiCached: AiEnv | null = null;
export function aiEnv(): AiEnv {
  if (aiCached) return aiCached;
  const parsed = AiEnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error("AI is not configured: set GROQ_API_KEY. See web/.env.example.");
  aiCached = parsed.data;
  return aiCached;
}

export function aiConfigured(): boolean {
  return AiEnvSchema.safeParse(process.env).success;
}

/** Razorpay (Starter self-serve checkout). Optional: without it /account shows "contact us". */
const BillingEnvSchema = z.object({
  RAZORPAY_KEY_ID: z.string().trim().min(8),
  RAZORPAY_KEY_SECRET: z.string().trim().min(8),
  RAZORPAY_PLAN_ID_INR: z.string().trim().optional().transform((v) => v || undefined),
  RAZORPAY_PLAN_ID_USD: z.string().trim().optional().transform((v) => v || undefined),
  RAZORPAY_WEBHOOK_SECRET: z.string().trim().optional().transform((v) => v || undefined),
});
export type BillingEnv = z.infer<typeof BillingEnvSchema>;

let billingCached: BillingEnv | null = null;
export function billingEnv(): BillingEnv {
  if (billingCached) return billingCached;
  const parsed = BillingEnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error("Billing is not configured: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  billingCached = parsed.data;
  return billingCached;
}
export function billingConfigured(): boolean {
  return BillingEnvSchema.safeParse(process.env).success;
}

/** Shared secret for scheduled jobs (Vercel Cron sends it as a Bearer token). */
export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET?.trim() || undefined;
}

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${missing}. See web/.env.example.`);
  }
  cached = parsed.data;
  return cached;
}
