import { confirmationCode, deleteMetaUserData, parseSignedRequest } from "@/features/meta-connect/signed-request";
import { metaEnv } from "@/lib/env";

/** Meta "Data deletion request" callback (App settings → Basic → Data deletion). */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const signed = String(form?.get("signed_request") ?? "");
  const data = parseSignedRequest(signed);
  if (!data) return Response.json({ error: "invalid signed_request" }, { status: 400 });
  await deleteMetaUserData(data.user_id);
  const code = confirmationCode(data.user_id, Date.now());
  return Response.json({ url: `${metaEnv().APP_URL}/data-deletion?code=${code}`, confirmation_code: code });
}
