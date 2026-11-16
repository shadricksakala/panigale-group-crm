import { env } from "cloudflare:workers";
import { assertCrmMutation, getPanigaleCrmUser } from "../../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../../lib/server/crm.mjs";

type RouteContext = { params: Promise<{ id: string }> };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await assertCrmMutation(request,env);
    const user = await getPanigaleCrmUser(request,env);
    if (!user) return json({ error: "Sign in to continue." },401);
    const input = await request.json() as { tenantId?: unknown; action?: unknown };
    const tenantId = typeof input.tenantId === "string" ? input.tenantId.slice(0,100) : "";
    const action = input.action === "confirm" ? "confirm" : input.action === "dismiss" ? "dismiss" : "";
    if (!action) return json({ error: "Choose confirm or dismiss." },400);
    const { id } = await params;
    const suggestion = await env.CRM_DB.prepare("SELECT s.*,c.unit_id conversation_unit_id FROM crm_ai_suggestions s JOIN crm_ai_conversations c ON c.id=s.conversation_id WHERE s.id=? AND s.tenant_id=? AND s.user_id=? AND c.user_id=?").bind(id,tenantId,user.id,user.id).first<Record<string,unknown>>();
    if (!suggestion || suggestion.status !== "pending") return json({ error: "This suggestion is no longer available." },404);
    const context = await crmContext(env.CRM_DB,user.id,tenantId);
    const unitId = String(suggestion.unit_id);
    if (!context.unitIds.includes(unitId)) return json({ error: "You do not have access to this business unit." },403);
    if (action === "dismiss") {
      await env.CRM_DB.prepare("UPDATE crm_ai_suggestions SET status='dismissed',resolved_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND status='pending'").bind(id,user.id).run();
      return json({ dismissed: true });
    }
    const payload = JSON.parse(String(suggestion.payload_json)) as { kind: string; title: string; details?: string; dueAt?: string | null; linkType?: string | null; linkId?: string | null };
    const linkColumn = ({ company: "company_id", contact: "contact_id", lead: "lead_id", project: "project_id" } as Record<string,string>)[String(payload.linkType)] || "";
    const linkId = typeof payload.linkId === "string" && linkColumn ? payload.linkId : "";
    if (linkId) {
      const table = ({ company: "crm_companies", contact: "crm_contacts", lead: "crm_leads", project: "crm_projects" } as Record<string,string>)[String(payload.linkType)];
      const exists = await env.CRM_DB.prepare(`SELECT 1 ok FROM ${table} WHERE id=? AND tenant_id=? AND unit_id=?`).bind(linkId,tenantId,unitId).first();
      if (!exists) return json({ error: "The linked record is no longer available in this unit." },400);
    }
    const activityId = crypto.randomUUID();
    const kind = payload.kind === "note" ? "note" : "task";
    const dueAt = kind === "task" && typeof payload.dueAt === "string" ? payload.dueAt : null;
    const status = kind === "note" ? "completed" : "open";
    const completedAt = kind === "note" ? new Date().toISOString() : null;
    const batch = await env.CRM_DB.batch([
      env.CRM_DB.prepare(`INSERT INTO crm_activities(id,tenant_id,unit_id,${linkColumn || "company_id"},kind,title,details,priority,status,due_at,completed_at,owner_user_id,created_by,updated_by)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_ai_suggestions WHERE id=? AND status='pending' AND user_id=?)`)
        .bind(activityId,tenantId,unitId,linkId || null,kind,payload.title.slice(0,200),String(payload.details||"").slice(0,1200),"medium",status,dueAt,completedAt,user.id,user.id,user.id,id,user.id),
      env.CRM_DB.prepare("UPDATE crm_ai_suggestions SET status='accepted',activity_id=?,resolved_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending' AND user_id=?").bind(activityId,id,user.id),
    ]);
    if (!Number(batch[0]?.meta?.changes || 0) || !Number(batch[1]?.meta?.changes || 0)) return json({ error: "This suggestion was already handled." },409);
    await env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.ai_suggestion.accepted','activity',?,?)").bind(crypto.randomUUID(),tenantId,unitId,user.id,activityId,JSON.stringify({suggestionId:id,kind})).run();
    return json({ activityId, created: true },201);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("crm_ai_suggestion_action_failed", { name: error instanceof Error ? error.name : "unknown" });
    return json({ error: "Unable to save this CRM suggestion." },500);
  }
}
