import { env } from "cloudflare:workers";
import { getPaniPayUser } from "../../../../lib/server/current-user";
import { assertAuthenticatedMutation } from "../../../../lib/server/browser-guard.mjs";
import { parseJsonRequest } from "../../../../lib/server/http-errors.mjs";
import { archiveCrmRecord, createCrmRecord, createCrmUnit, crmContext, deactivateCrmUnit, grantCrmMember, readCrmResource, revokeCrmMember, updateCrmRecord } from "../../../../lib/server/crm.mjs";

type RouteContext = { params: Promise<{ resource: string }> };

async function authenticate(request: Request) {
  if (!env.DB) throw new Response("Service unavailable", { status: 503 });
  const user = await getPaniPayUser();
  if (!user) throw new Response("Sign in to PaniPay to continue", { status: 401 });
  const url = new URL(request.url);
  const context = await crmContext(env.DB, user.id, url.searchParams.get("tenantId") || "");
  return { user, context, url };
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const [{ resource }, { user, context, url }] = await Promise.all([params, authenticate(request)]);
    return Response.json({ data: await readCrmResource(env.DB, context, resource, url.searchParams.get("unitId") || "") }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load CRM data" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    assertAuthenticatedMutation(request, env.PANI_PAY_TRUSTED_ORIGINS);
    const [{ resource }, { user, context }] = await Promise.all([params, authenticate(request)]);
    const input = await parseJsonRequest(request);
    if (resource === "members") return Response.json({ member: await grantCrmMember(env.DB, context, user, input) }, { status: 201, headers: { "cache-control": "no-store" } });
    if (resource === "units") return Response.json({ unit: await createCrmUnit(env.DB, context, user, input) }, { status: 201, headers: { "cache-control": "no-store" } });
    return Response.json({ record: await createCrmRecord(env.DB, context, user, resource, input) }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Unable to save CRM record";
    return Response.json({ error: message.includes("UNIQUE constraint") ? "That CRM workspace or business unit already exists" : "Unable to save CRM record" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    assertAuthenticatedMutation(request, env.PANI_PAY_TRUSTED_ORIGINS);
    const [{ resource }, { user, context }] = await Promise.all([params, authenticate(request)]);
    const input = await parseJsonRequest(request);
    if (resource === "members") {
      const member = await grantCrmMember(env.DB, context, user, input);
      return Response.json({ member }, { headers: { "cache-control": "no-store" } });
    }
    return Response.json({ record: await updateCrmRecord(env.DB, context, user, resource, String(input.id || ""), input) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to update CRM access" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    assertAuthenticatedMutation(request, env.PANI_PAY_TRUSTED_ORIGINS);
    const [{ resource }, { user, context }] = await Promise.all([params, authenticate(request)]);
    const input = await parseJsonRequest(request);
    if (resource === "members") return Response.json(await revokeCrmMember(env.DB, context, user, String(input.userId || "")), { headers: { "cache-control": "no-store" } });
    if (resource === "units") return Response.json(await deactivateCrmUnit(env.DB, context, user, String(input.id || "")), { headers: { "cache-control": "no-store" } });
    return Response.json(await archiveCrmRecord(env.DB, context, user, resource, String(input.id || "")), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to update CRM record" }, { status: 500 });
  }
}
