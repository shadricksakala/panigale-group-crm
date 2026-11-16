import { env } from "cloudflare:workers";
import { receivePaniPayWebhook } from "../../../../lib/server/panipay-invoices.mjs";

export async function POST(request: Request) {
  try {
    const result = await receivePaniPayWebhook(env.CRM_DB, env, request);
    return Response.json(result, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (reason) {
    if (reason instanceof Response) return Response.json({ error: await reason.text() }, { status: reason.status, headers: { "cache-control": "no-store" } });
    console.error("crm_panipay_webhook_failed", { name: reason instanceof Error ? reason.name : "unknown" });
    return Response.json({ error: "Unable to process the PaniPay event." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
