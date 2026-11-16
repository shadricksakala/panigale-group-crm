import { env } from "cloudflare:workers";
import { finishPanigaleAuth } from "../../../../lib/server/panigale-auth.mjs";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    return await finishPanigaleAuth(request, env, requestId);
  } catch (error) {
    if (error instanceof Response) {
      const detail = (await error.text()).trim().slice(0, 300);
      return Response.json({ error: detail || "Unable to complete Panigale sign-in.", reference: requestId }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: "Unable to complete Panigale sign-in.", reference: requestId }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
