import { env } from "cloudflare:workers";
import { finishPanigaleAuth } from "../../../../lib/server/panigale-auth.mjs";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    return await finishPanigaleAuth(request, env, requestId);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to complete Panigale sign-in.", reference: requestId }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
