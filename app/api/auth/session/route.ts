import { env } from "cloudflare:workers";
import { getPanigaleCrmUser } from "../../../../lib/server/panigale-auth.mjs";

export async function GET(request: Request) {
  try {
    const user = await getPanigaleCrmUser(request, env);
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401, headers: { "cache-control": "no-store" } });
    return Response.json({ user: { id: user.id, name: user.name, email: user.email } }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to read the current session." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
