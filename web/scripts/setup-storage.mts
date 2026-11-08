/**
 * Create (or update) the private Storage bucket for ad media. Idempotent.
 *
 *   cd web && pnpm run setup:storage
 *
 * Files live at  u{userId}/c{clientId}/{uuid}.{ext}  and are only reached
 * through short-lived signed URLs created server-side.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in web/.env.local");
  process.exit(1);
}

const BUCKET = "ad-media";
const options = {
  public: false,
  fileSizeLimit: 50 * 1024 * 1024, // Supabase free-plan maximum
  allowedMimeTypes: ["image/jpeg", "image/png", "video/mp4", "video/quicktime"],
};

const db = createClient(url, key, { auth: { persistSession: false } });
const { data: existing } = await db.storage.getBucket(BUCKET);
const { error } = existing ? await db.storage.updateBucket(BUCKET, options) : await db.storage.createBucket(BUCKET, options);
if (error) {
  console.error(`Storage setup failed: ${error.message}`);
  process.exit(1);
}
console.log(`${existing ? "Updated" : "Created"} private bucket "${BUCKET}".`);
