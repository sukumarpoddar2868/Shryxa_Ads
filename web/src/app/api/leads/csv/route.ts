import { getCurrentUser } from "@/features/auth/dal";
import { leadError, leadsCsv, listLeads } from "@/features/leads/load";

/** GET /api/leads/csv?client=<id>&form=<id> → all leads of that form as CSV. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  const url = new URL(req.url);
  const clientId = Number(url.searchParams.get("client"));
  const formId = url.searchParams.get("form") ?? "";
  if (!Number.isSafeInteger(clientId) || clientId <= 0) return new Response("Missing client.", { status: 400 });
  try {
    const { form, leads } = await listLeads(user.id, clientId, formId, 100);
    const name = form.name.replace(/[^\w-]+/g, "_").slice(0, 60) || "leads";
    return new Response(leadsCsv(leads), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(leadError(e), { status: 400 });
  }
}
