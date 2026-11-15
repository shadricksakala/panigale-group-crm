import { env } from "cloudflare:workers";
import { getPaniPayUser, requireSuperadmin } from "../../../../lib/server/current-user";
import { assertAuthenticatedMutation } from "../../../../lib/server/browser-guard.mjs";
import { parseJsonRequest } from "../../../../lib/server/http-errors.mjs";
import { bootstrapPanigaleCrm, createCrmTenant, getCrmBootstrapStatus } from "../../../../lib/server/crm.mjs";

export async function GET() {
  if (!env.DB) return Response.json({ error: "Service unavailable" }, { status: 503 });
  const user = await getPaniPayUser();
  if (!user) return Response.json({ error: "Sign in to PaniPay to continue" }, { status: 401 });
  return Response.json(await getCrmBootstrapStatus(env.DB, user.id), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!env.DB) return Response.json({ error: "Service unavailable" }, { status: 503 });
  try {
    assertAuthenticatedMutation(request, env.PANI_PAY_TRUSTED_ORIGINS);
    const user = await getPaniPayUser();
    if (!user) return Response.json({ error: "Sign in to PaniPay to continue" }, { status: 401 });
    const input = await parseJsonRequest(request);
    if (input.action === "bootstrap") {
      await requireSuperadmin();
      return Response.json(await bootstrapPanigaleCrm(env.DB, user), { status: 201, headers: { "cache-control": "no-store" } });
    }
    if (input.action === "create-tenant") {
      await requireSuperadmin();
      const tenant = await createCrmTenant(env.DB, user, input.name, input.slug);
      return Response.json({ tenant }, { status: 201, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: "Unsupported CRM administration action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to administer CRM workspaces" }, { status: 500 });
  }
}
