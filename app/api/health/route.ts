import { env } from "cloudflare:workers";

export async function GET() {
  try {
    if (!env.CRM_DB) throw new Error("database missing");
    await env.CRM_DB.prepare("SELECT 1 AS healthy").first();
    return Response.json({ status: "ok", service: "panigale-group-crm" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable", service: "panigale-group-crm" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
