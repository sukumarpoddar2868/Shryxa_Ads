import { deleteMetaUserData, parseSignedRequest } from "@/features/meta-connect/signed-request";

/** Meta "Deauthorize callback": the person removed the app → drop their tokens. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const data = parseSignedRequest(String(form?.get("signed_request") ?? ""));
  if (!data) return new Response("invalid signed_request", { status: 400 });
  await deleteMetaUserData(data.user_id);
  return new Response(null, { status: 200 });
}
