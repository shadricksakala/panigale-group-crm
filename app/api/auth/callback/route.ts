import { env } from "cloudflare:workers";
import { finishPanigaleAuth } from "../../../../lib/server/panigale-auth.mjs";

export async function GET(request: Request) {
  try {
    return await finishPanigaleAuth(request, env);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to complete Panigale sign-in." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
