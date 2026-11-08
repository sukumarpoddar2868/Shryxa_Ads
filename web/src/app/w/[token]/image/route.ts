import { readItemToken } from "@/features/campaigns/whatsapp/item-link";
import { db } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/features/campaigns/media/rules";

/** Public image for a signed carousel-item link (used as og:image by WhatsApp). */
export async function GET(_req: Request, ctx: RouteContext<"/w/[token]/image">) {
  const { token } = await ctx.params;
  const item = readItemToken(token);
  if (!item) return new Response("Not found", { status: 404 });
  const { data } = await db().storage.from(MEDIA_BUCKET).download(item.path);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data, {
    headers: {
      "content-type": item.path.endsWith(".png") ? "image/png" : "image/jpeg",
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}
