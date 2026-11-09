import { enforceBilling } from "@/features/billing/access";
import { cronSecret } from "@/lib/env";
import { db } from "@/lib/supabase/server";

/** Daily: pause campaigns of lapsed trials/plans, resume ones that came back. */
export async function GET(req: Request) {
  const secret = cronSecret();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  const { data: users } = await db().from("users").select("id").eq("is_admin", 0).order("id").limit(1000);
  let paused = 0;
  let resumed = 0;
  const errors: string[] = [];
  for (const u of users ?? []) {
    try {
      const r = await enforceBilling(u.id);
      paused += r.paused;
      resumed += r.resumed;
      errors.push(...r.errors.map((e) => `user ${u.id}: ${e}`));
    } catch (e) {
      errors.push(`user ${u.id}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  return Response.json({ users: users?.length ?? 0, paused, resumed, errors: errors.slice(0, 50) });
}
