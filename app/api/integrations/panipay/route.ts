import { env } from "cloudflare:workers";
import { assertCrmMutation, getPanigaleCrmUser } from "../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../lib/server/crm.mjs";
import { getPaniPayConnections, savePaniPayConnection } from "../../../../lib/server/panipay-invoices.mjs";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const error = async (reason: unknown, fallback: string) => reason instanceof Response ? json({ error: await reason.text() }, reason.status) : json({ error: fallback }, 500);

export async function GET(request: Request) {
  try {
    const user = await getPanigaleCrmUser(request, env);
    if (!user) return json({ error: "Sign in to continue." }, 401);
    const tenantId = new URL(request.url).searchParams.get("tenantId") || "";
    const context = await crmContext(env.CRM_DB, user.id, tenantId);
    return json({ items: await getPaniPayConnections(env.CRM_DB, context, env), canManage: context.superadmin });
  } catch (reason) { return error(reason, "Unable to load PaniPay connections."); }
}

export async function PUT(request: Request) {
  try {
    await assertCrmMutation(request, env);
    const user = await getPanigaleCrmUser(request, env);
    if (!user) return json({ error: "Sign in to continue." }, 401);
    const input = await request.json() as { tenantId?: unknown; unitId?: unknown; apiKey?: unknown; webhookSecret?: unknown };
    const tenantId = typeof input.tenantId === "string" ? input.tenantId.slice(0, 100) : "";
    const unitId = typeof input.unitId === "string" ? input.unitId.slice(0, 100) : "";
    const context = await crmContext(env.CRM_DB, user.id, tenantId);
    const saved = await savePaniPayConnection(env.CRM_DB, env, context, user, unitId, String(input.apiKey || ""), String(input.webhookSecret || ""));
    return json(saved);
  } catch (reason) { return error(reason, "Unable to connect the PaniPay merchant."); }
}
