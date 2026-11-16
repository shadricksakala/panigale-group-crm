import { env } from "cloudflare:workers";
import { assertCrmMutation, getPanigaleCrmUser } from "../../../../../lib/server/panigale-auth.mjs";
import { crmContext } from "../../../../../lib/server/crm.mjs";
import { getConfiguredCrmSupportSender, getVerifiedCrmMailSender } from "../../../../../lib/server/mail-delivery.mjs";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

async function manager(tenantId: string, unitId: string, userId: string) {
  const row = await env.CRM_DB.prepare("SELECT m.role,a.unit_role FROM crm_memberships m LEFT JOIN crm_unit_access a ON a.tenant_id=m.tenant_id AND a.user_id=m.user_id AND a.unit_id=? WHERE m.tenant_id=? AND m.user_id=?").bind(unitId, tenantId, userId).first();
  return row?.role === "superadmin" || row?.unit_role === "manager";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await assertCrmMutation(request, env);
    const user = await getPanigaleCrmUser(request, env);
    if (!user) return json({ error: "Sign in to continue." }, 401);
    const { id } = await params;
    const input = await request.json() as { tenantId?: unknown; action?: unknown; confirmNoDelivery?: unknown };
    const tenantId = typeof input.tenantId === "string" ? input.tenantId.slice(0, 100) : "";
    if (!["approve", "reject", "retry_uncertain"].includes(String(input.action))) return json({ error: "Choose approve, reject, or retry after checking delivery." }, 400);

    const context = await crmContext(env.CRM_DB, user.id, tenantId);
    const draft = await env.CRM_DB.prepare("SELECT * FROM crm_email_drafts WHERE tenant_id=? AND id=?").bind(context.tenantId, id).first();
    if (!draft || !context.unitIds.includes(String(draft.unit_id)) || (draft.private_owner_user_id && draft.private_owner_user_id !== user.id)) return json({ error: "Email draft not found." }, 404);
    if(input.action==="retry_uncertain"){
      if(!await manager(context.tenantId,String(draft.unit_id),user.id))return json({error:"A business unit manager must confirm an uncertain delivery."},403);
      if(input.confirmNoDelivery!==true)return json({error:"Confirm that you checked delivery and the client did not receive the email."},400);
      if(draft.status!=="failed"||draft.message_kind!=="client"||!draft.support_message_id||!env.CRM_EMAIL||env.CRM_EMAIL_SEND_ENABLED!=="true")return json({error:"This email is not eligible for a native support email retry."},409);
      const outbox=await env.CRM_DB.prepare("SELECT id FROM crm_client_email_outbox WHERE tenant_id=? AND unit_id=? AND draft_id=? AND status='failed' AND last_error_code='email_service_delivery_uncertain'").bind(context.tenantId,draft.unit_id,id).first();
      if(!outbox)return json({error:"This email has no uncertain native delivery to review."},409);
      const source=await env.CRM_DB.prepare("SELECT t.source_app FROM crm_support_messages m JOIN crm_support_tickets t ON t.tenant_id=m.tenant_id AND t.unit_id=m.unit_id AND t.id=m.ticket_id WHERE m.tenant_id=? AND m.unit_id=? AND m.id=?").bind(context.tenantId,draft.unit_id,draft.support_message_id).first();
      const senderEmail=source?.source_app?await getConfiguredCrmSupportSender(env.CRM_DB,context.tenantId,String(draft.unit_id),String(source.source_app)):null;
      const previousApproval=await env.CRM_DB.prepare("SELECT metadata_json FROM crm_audit_events WHERE tenant_id=? AND unit_id=? AND entity_type='email_draft' AND entity_id=? AND action='crm.email.approved' ORDER BY created_at DESC LIMIT 1").bind(context.tenantId,draft.unit_id,id).first();
      let approvedSender="";try{approvedSender=String(JSON.parse(String(previousApproval?.metadata_json||"{}")).senderEmail||"").trim().toLowerCase();}catch{}
      if(!senderEmail||senderEmail!==approvedSender)return json({error:"The approved support sender is no longer configured. The email was not requeued."},409);
      const audit=env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,'crm.email.retry_after_uncertain','email_draft',?,?)").bind(crypto.randomUUID(),context.tenantId,draft.unit_id,user.id,id,JSON.stringify({confirmedNoDelivery:true,senderEmail}));
      const results=await env.CRM_DB.batch([
        env.CRM_DB.prepare("UPDATE crm_client_email_outbox SET status='queued',next_attempt_at=NULL,last_error_code=NULL WHERE tenant_id=? AND unit_id=? AND id=? AND status='failed' AND last_error_code='email_service_delivery_uncertain'").bind(context.tenantId,draft.unit_id,outbox.id),
        env.CRM_DB.prepare("UPDATE crm_email_drafts SET status='queued',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND status='failed'").bind(context.tenantId,id),
        audit,
      ]);
      if(Number(results[0]?.meta?.changes||0)!==1||Number(results[1]?.meta?.changes||0)!==1)return json({error:"The email state changed. Refresh and review it before retrying."},409);
      return json({id,status:"queued",senderEmail});
    }
    if (draft.status !== "pending_approval" || draft.message_kind !== "client") return json({ error: "This draft is not waiting for client email approval." }, 409);
    if (draft.created_by_user_id !== user.id && !await manager(context.tenantId, String(draft.unit_id), user.id)) return json({ error: "Only the author or a unit manager may approve this draft." }, 403);

    const approved = input.action === "approve";
    let senderEmail: string | null = null;
    if (approved) {
      if (env.CRM_EMAIL_SEND_ENABLED !== "true") return json({ error: "Client email delivery is not configured. The draft remains pending approval." }, 503);
      if(draft.support_message_id&&env.CRM_EMAIL){
        const supportSource=await env.CRM_DB.prepare("SELECT t.source_app FROM crm_support_messages m JOIN crm_support_tickets t ON t.tenant_id=m.tenant_id AND t.unit_id=m.unit_id AND t.id=m.ticket_id WHERE m.tenant_id=? AND m.unit_id=? AND m.id=?").bind(context.tenantId,draft.unit_id,draft.support_message_id).first();
        if(supportSource?.source_app)senderEmail=await getConfiguredCrmSupportSender(env.CRM_DB,context.tenantId,String(draft.unit_id),String(supportSource.source_app));
      }
      if(!senderEmail&&env.CRM_MAILER)senderEmail=await getVerifiedCrmMailSender(env.CRM_MAILER, context.tenantId, String(draft.unit_id));
      if (!senderEmail) return json({ error: "This business unit has no verified company sender. The draft remains pending approval." }, 503);
    }

    const audit = env.CRM_DB.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,'email_draft',?,?)")
      .bind(crypto.randomUUID(), context.tenantId, draft.unit_id, user.id, approved ? "crm.email.approved" : "crm.email.rejected", id, JSON.stringify({ deliveryQueued: approved, ...(senderEmail ? { senderEmail } : {}) }));
    if (approved) {
      const statements = [
        env.CRM_DB.prepare("UPDATE crm_email_drafts SET status='queued',approved_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND status='pending_approval'").bind(user.id, context.tenantId, id),
        env.CRM_DB.prepare("INSERT OR IGNORE INTO crm_client_email_outbox(id,tenant_id,unit_id,draft_id,recipient_email,subject,body_text,idempotency_key,status) VALUES(?,?,?,?,?,?,?,?,'queued')").bind(crypto.randomUUID(), context.tenantId, draft.unit_id, id, draft.recipient_email, draft.subject, draft.body_text, `crm-client-email:${id}`),
        audit,
      ];
      if (draft.support_message_id) statements.push(env.CRM_DB.prepare("UPDATE crm_support_messages SET visibility='public' WHERE id=? AND tenant_id=? AND unit_id=?").bind(draft.support_message_id, context.tenantId, draft.unit_id));
      await env.CRM_DB.batch(statements);
    } else {
      await env.CRM_DB.batch([
        env.CRM_DB.prepare("UPDATE crm_email_drafts SET status='rejected',approved_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND status='pending_approval'").bind(user.id, context.tenantId, id),
        audit,
      ]);
    }
    return json({ id, status: approved ? "queued" : "rejected", senderEmail });
  } catch (error) {
    if (error instanceof Response) return json({ error: await error.text() }, error.status);
    return json({ error: "Unable to update email approval." }, 500);
  }
}
