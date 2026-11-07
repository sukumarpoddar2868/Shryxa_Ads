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
  META_TOKEN_ENCRYPTION_KEY: z.string().length(44),
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
