import { env } from "cloudflare:workers";
import { assertCrmMutation, getPanigaleCrmUser } from "../../../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../../../lib/server/crm.mjs";
import { handlePaniPayInvoiceAction } from "../../../../../../lib/server/panipay-invoices.mjs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertCrmMutation(request, env);
    const user = await getPanigaleCrmUser(request, env);
    if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const input = await request.json() as { tenantId?: unknown; action?: unknown };
    const tenantId = typeof input.tenantId === "string" ? input.tenantId.slice(0, 100) : "";
    const context = await crmContext(env.CRM_DB, user.id, tenantId);
    const { id } = await params;
    const result = await handlePaniPayInvoiceAction(env.CRM_DB, env, user, context, id, String(input.action || ""));
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (reason) {
    if (reason instanceof Response) return Response.json({ error: await reason.text() }, { status: reason.status, headers: { "cache-control": "no-store" } });
    console.error("crm_panipay_invoice_action_failed", { name: reason instanceof Error ? reason.name : "unknown" });
    return Response.json({ error: "Unable to complete the PaniPay invoice action." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
