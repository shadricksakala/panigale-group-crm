import { env } from "cloudflare:workers";
import { csrfTokenResponse } from "../../../../lib/server/panigale-auth.mjs";

export async function GET(request: Request) {
  try {
    return await csrfTokenResponse(request, env);
  } catch {
    return Response.json({ error: "CRM security configuration is unavailable." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
