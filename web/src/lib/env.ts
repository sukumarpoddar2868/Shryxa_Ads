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
