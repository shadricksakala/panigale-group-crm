import { env } from "cloudflare:workers";
import { assertCrmMutation, endPanigaleCrmSession } from "../../../../lib/server/panigale-auth.mjs";

export async function POST(request: Request) {
  try {
    await assertCrmMutation(request, env);
    return await endPanigaleCrmSession(request, env);
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to sign out." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
