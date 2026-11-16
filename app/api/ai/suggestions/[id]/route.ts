import { env } from "cloudflare:workers";
import { assertCrmMutation, getPanigaleCrmUser } from "../../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../../lib/server/crm.mjs";
import { containsCrmSecret } from "../../../../../lib/server/crm-ai.mjs";

type RouteContext = { params: Promise<{ id: string }> };
type SuggestionPayload = { kind?: unknown; title?: unknown; details?: unknown; dueAt?: unknown; linkType?: unknown; linkId?: unknown };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request, { params }: RouteContext) {
  try {
    await assertCrmMutation(request, env);
    const user = await getPanigaleCrmUser(request, env);
    if (!user) return json({ error: "Sign in to continue." }, 401);
    const input = await request.json() as { tenantId?: unknown; action?: unknown };
    const tenantId = typeof input.tenantId === "string" ? input.tenantId.slice(0, 100) : "";
    const action = input.action === "confirm" ? "confirm" : input.action === "dismiss" ? "dismiss" : "";
    if (!action) return json({ error: "Choose confirm or dismiss." }, 400);
    const { id } = await params;
    const suggestion = await env.CRM_DB.prepare(`SELECT s.*,c.unit_id conversation_unit_id,c.tenant_id conversation_tenant_id,c.user_id conversation_user_id
      FROM crm_ai_suggestions s JOIN crm_ai_conversations c ON c.id=s.conversation_id AND c.tenant_id=s.tenant_id AND c.unit_id=s.unit_id
      WHERE s.id=? AND s.tenant_id=? AND s.user_id=? AND c.user_id=?`).bind(id, tenantId, user.id, user.id).first<Record<string, unknown>>();
    if (!suggestion || suggestion.status !== "pending") return json({ error: "This suggestion is no longer available." }, 404);
    const context = await crmContext(env.CRM_DB, user.id, tenantId);
    const unitId = String(suggestion.unit_id);
    if (unitId !== String(suggestion.conversation_unit_id) || String(suggestion.conversation_tenant_id) !== context.tenantId) return json({ error: "This suggestion is not available in the selected workspace." }, 404);
    if (!context.unitIds.includes(unitId)) return json({ error: "You do not have access to this business unit." }, 403);

    if (action === "dismiss") {
      const results = await env.CRM_DB.batch([
        env.CRM_DB.prepare("UPDATE crm_ai_suggestions SET status='dismissed',resolved_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=? AND user_id=? AND status='pending'").bind(id, context.tenantId, unitId, user.id),
        env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) SELECT ?,?,?,?,'crm.ai_suggestion.dismissed','ai_suggestion',?,'{}' WHERE changes()=1").bind(crypto.randomUUID(), context.tenantId, unitId, user.id, id),
      ]);
      if (!Number(results[0]?.meta?.changes || 0)) return json({ error: "This suggestion was already handled." }, 409);
      return json({ dismissed: true });
    }

    let payload: SuggestionPayload;
    try { payload = JSON.parse(String(suggestion.payload_json)) as SuggestionPayload; }
    catch { return json({ error: "This suggestion is invalid. Dismiss it and ask the assistant again." }, 409); }
    if (payload.kind !== "task" && payload.kind !== "note") return json({ error: "This suggestion is invalid. Dismiss it and ask the assistant again." }, 409);
    const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 200) : "";
    const details = typeof payload.details === "string" ? payload.details.trim().slice(0, 1200) : "";
    if (title.length < 2 || containsCrmSecret(title) || containsCrmSecret(details)) return json({ error: "This suggestion contains unsupported content. Dismiss it and ask the assistant again." }, 409);
    const linkType = ["company", "contact", "lead", "project"].includes(String(payload.linkType)) ? String(payload.linkType) : "";
    const linkColumn = ({ company: "company_id", contact: "contact_id", lead: "lead_id", project: "project_id" } as Record<string, string>)[linkType] || "";
    const linkId = typeof payload.linkId === "string" && linkColumn ? payload.linkId.slice(0, 160) : "";
    if (payload.linkId && !linkId) return json({ error: "This suggestion contains an invalid record link." }, 409);
    if (linkId) {
      const table = ({ company: "crm_companies", contact: "crm_contacts", lead: "crm_leads", project: "crm_projects" } as Record<string, string>)[linkType];
      const exists = await env.CRM_DB.prepare(`SELECT 1 ok FROM ${table} WHERE id=? AND tenant_id=? AND unit_id=?`).bind(linkId, context.tenantId, unitId).first();
      if (!exists) return json({ error: "The linked record is no longer available in this unit." }, 400);
    }
    let dueAt: string | null = null;
    if (payload.kind === "task" && typeof payload.dueAt === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?Z?)?$/.test(payload.dueAt)) {
      const date = new Date(payload.dueAt);
      if (Number.isFinite(date.getTime())) dueAt = date.toISOString();
    }

    const activityId = crypto.randomUUID();
    const kind = payload.kind;
    const note = kind === "note";
    const results = await env.CRM_DB.batch([
      env.CRM_DB.prepare(`INSERT INTO crm_activities(id,tenant_id,unit_id,${linkColumn || "company_id"},kind,title,details,priority,status,due_at,completed_at,owner_user_id,created_by,updated_by)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM crm_ai_suggestions WHERE id=? AND tenant_id=? AND unit_id=? AND user_id=? AND status='pending')`)
        .bind(activityId, context.tenantId, unitId, linkId || null, kind, title, details, "medium", note ? "completed" : "open", note ? null : dueAt, note ? new Date().toISOString() : null, user.id, user.id, user.id, id, context.tenantId, unitId, user.id),
      env.CRM_DB.prepare("UPDATE crm_ai_suggestions SET status='accepted',activity_id=?,resolved_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=? AND user_id=? AND status='pending'").bind(activityId, id, context.tenantId, unitId, user.id),
      env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) SELECT ?,?,?,?,'crm.ai_suggestion.accepted','activity',?,? WHERE EXISTS(SELECT 1 FROM crm_activities WHERE id=?)")
        .bind(crypto.randomUUID(), context.tenantId, unitId, user.id, activityId, JSON.stringify({ suggestionId: id, kind, linkType: linkType || null, linked: Boolean(linkId) }), activityId),
    ]);
    if (!Number(results[0]?.meta?.changes || 0) || !Number(results[1]?.meta?.changes || 0)) return json({ error: "This suggestion was already handled." }, 409);
    return json({ activityId, created: true }, 201);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("crm_ai_suggestion_action_failed", { name: error instanceof Error ? error.name : "unknown" });
    return json({ error: "Unable to save this CRM suggestion." }, 500);
  }
}
