const MAX_SUGGESTIONS = 3;

export async function crmAssistantContext(db, context, unitId, userId) {
  const unit = context.units.find(item => item.id === unitId);
  if (!unit) throw new Response("Choose a business unit you can access.", { status: 403 });
  const [companies, contacts, leads, activities, projects, emails] = await Promise.all([
    db.prepare("SELECT id,name,industry,status,notes,owner_user_id FROM crm_companies WHERE tenant_id=? AND unit_id=? AND status NOT IN ('inactive','archived') ORDER BY updated_at DESC LIMIT 20").bind(context.tenantId,unitId).all(),
    db.prepare("SELECT id,name,company_id,job_title,status,next_follow_up,notes,owner_user_id FROM crm_contacts WHERE tenant_id=? AND unit_id=? AND status NOT IN ('inactive','archived') ORDER BY updated_at DESC LIMIT 30").bind(context.tenantId,unitId).all(),
    db.prepare("SELECT id,title,company_id,contact_id,stage,next_step,expected_close,owner_user_id FROM crm_leads WHERE tenant_id=? AND unit_id=? ORDER BY updated_at DESC LIMIT 30").bind(context.tenantId,unitId).all(),
    db.prepare("SELECT id,kind,title,details,status,due_at,company_id,contact_id,lead_id,project_id,owner_user_id FROM crm_activities WHERE tenant_id=? AND unit_id=? ORDER BY updated_at DESC LIMIT 30").bind(context.tenantId,unitId).all(),
    db.prepare("SELECT id,name,company_id,contact_id,status,due_date,progress,owner_user_id FROM crm_projects WHERE tenant_id=? AND unit_id=? AND status NOT IN ('completed','cancelled') ORDER BY updated_at DESC LIMIT 20").bind(context.tenantId,unitId).all(),
    db.prepare(`SELECT m.subject,m.snippet,m.body_text,m.received_at,m.direction,m.linked_company_id,m.linked_contact_id,m.linked_lead_id,c.connection_scope
      FROM crm_email_messages m JOIN crm_google_connections c ON c.id=m.connection_id AND c.tenant_id=m.tenant_id AND c.unit_id=m.unit_id
      WHERE m.tenant_id=? AND m.unit_id=? AND (m.private_owner_user_id IS NULL OR m.private_owner_user_id=?) AND COALESCE(m.received_at,m.sent_at)>=datetime('now','-30 days')
      ORDER BY COALESCE(m.received_at,m.sent_at) DESC LIMIT 15`).bind(context.tenantId,unitId,userId).all(),
  ]);
  const safeText=(value,max)=>{const text=String(value||"").slice(0,max);return containsCrmSecret(text)?"[content omitted because it appears to contain credentials]":text;};
  const safeEmails=(emails.results||[]).map(message=>({subject:safeText(message.subject,250),snippet:safeText(message.snippet,300),body:safeText(message.body_text,1200),receivedAt:message.received_at,direction:message.direction,linkedCompanyId:message.linked_company_id,linkedContactId:message.linked_contact_id,linkedLeadId:message.linked_lead_id,mailboxScope:message.connection_scope}));
  return {
    unit: { id: unit.id, name: unit.name },
    role: context.role,
    financialAccess: context.superadmin || Number(unit.can_view_financials) === 1,
    companies: companies.results || [], contacts: contacts.results || [], leads: leads.results || [],
    activities: activities.results || [], projects: projects.results || [], recentEmails:safeEmails,
  };
}

export function containsCrmSecret(value) {
  return /\b(?:Bearer\s+[A-Za-z0-9._~-]{20,}|(?:api[_ -]?key|password|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S{8,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)\b/i.test(value)
    || /\b(?:sk|pk|whsec|pp_live|pp_test)_[A-Za-z0-9_-]{16,}\b/i.test(value);
}

export function parseCrmAssistantResponse(value, validRecordIds) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) throw new Error("AI returned an empty response");
  let result;
  try {
    const candidate = raw.startsWith("{") ? raw : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    result = JSON.parse(candidate);
  } catch {
    return { answer: containsCrmSecret(raw) ? "I can’t provide credentials or secret values. I can help with CRM relationships, follow-ups, and preparation." : raw.slice(0, 6000), suggestions: [] };
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) return { answer: containsCrmSecret(raw) ? "I can’t provide credentials or secret values. I can help with CRM relationships, follow-ups, and preparation." : raw.slice(0,6000), suggestions: [] };
  const generatedAnswer = typeof result.answer === "string" && result.answer.trim() ? result.answer.trim().slice(0, 6000) : "I couldn’t form a clear response. Please try asking in a different way.";
  const answer = containsCrmSecret(generatedAnswer) ? "I can’t provide credentials or secret values. I can help with CRM relationships, follow-ups, and preparation." : generatedAnswer;
  const allowed = new Set(validRecordIds);
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions.slice(0, MAX_SUGGESTIONS).flatMap(item => {
    if (!item || !["task","note"].includes(item.kind) || typeof item.title !== "string") return [];
    const title = item.title.trim().slice(0,200);
    const details = typeof item.details === "string" ? item.details.trim().slice(0,1200) : "";
    if (title.length < 2) return [];
    const dueAt = typeof item.dueAt === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?Z?)?$/.test(item.dueAt) ? item.dueAt.slice(0,32) : null;
    const linkType = ["company","contact","lead","project"].includes(item.linkType) ? item.linkType : null;
    const linkId = typeof item.linkId === "string" && allowed.has(`${item.linkType}:${item.linkId}`) ? item.linkId : null;
    return [{ kind: item.kind, title, details, dueAt: item.kind === "task" ? dueAt : null, linkType: linkId ? linkType : null, linkId }];
  }) : [];
  return { answer, suggestions };
}
