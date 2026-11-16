const MAX_SUGGESTIONS = 3;

export async function crmAssistantContext(db, context, unitId, userId) {
  const unit = context.units.find(item => item.id === unitId);
  if (!unit) throw new Response("Choose a business unit you can access.", { status: 403 });
  const [companies, contacts, leads, activities, projects, emails] = await Promise.all([
    db.prepare("SELECT id,name,industry,status,notes,updated_at FROM crm_companies WHERE tenant_id=? AND unit_id=? AND status NOT IN ('inactive','archived') ORDER BY updated_at DESC LIMIT 20").bind(context.tenantId,unitId).all(),
    db.prepare("SELECT id,name,company_id,job_title,status,next_follow_up,notes,updated_at FROM crm_contacts WHERE tenant_id=? AND unit_id=? AND status NOT IN ('inactive','archived') ORDER BY updated_at DESC LIMIT 30").bind(context.tenantId,unitId).all(),
    db.prepare("SELECT id,title,company_id,contact_id,stage,next_step,expected_close,updated_at FROM crm_leads WHERE tenant_id=? AND unit_id=? ORDER BY updated_at DESC LIMIT 30").bind(context.tenantId,unitId).all(),
    db.prepare("SELECT id,kind,title,details,status,due_at,company_id,contact_id,lead_id,project_id,created_at FROM crm_activities WHERE tenant_id=? AND unit_id=? ORDER BY updated_at DESC LIMIT 30").bind(context.tenantId,unitId).all(),
    db.prepare("SELECT id,name,company_id,contact_id,status,due_date,progress,updated_at FROM crm_projects WHERE tenant_id=? AND unit_id=? AND status NOT IN ('completed','cancelled') ORDER BY updated_at DESC LIMIT 20").bind(context.tenantId,unitId).all(),
    db.prepare(`SELECT m.id,m.subject,m.snippet,m.body_text,m.received_at,m.direction,m.linked_company_id,m.linked_contact_id,m.linked_lead_id,c.connection_scope
      FROM crm_email_messages m JOIN crm_google_connections c ON c.id=m.connection_id AND c.tenant_id=m.tenant_id AND c.unit_id=m.unit_id
      WHERE m.tenant_id=? AND m.unit_id=? AND (m.private_owner_user_id IS NULL OR m.private_owner_user_id=?) AND COALESCE(m.received_at,m.sent_at)>=datetime('now','-30 days')
      ORDER BY COALESCE(m.received_at,m.sent_at) DESC LIMIT 15`).bind(context.tenantId,unitId,userId).all(),
  ]);
  const safeText=(value,max)=>{const text=String(value||"").slice(0,max);return containsCrmSecret(text)?"[content omitted because it appears to contain credentials]":text;};
  const safeRows=(result,fields)=>(result.results||[]).map(row=>Object.fromEntries(fields.map(([field,max])=>[field,typeof row[field]==="string"?safeText(row[field],max):row[field]])));
  const safeCompanies=safeRows(companies,[["id",160],["name",160],["industry",120],["status",40],["notes",1000],["updated_at",40]]);
  const safeContacts=safeRows(contacts,[["id",160],["name",160],["company_id",160],["job_title",120],["status",40],["next_follow_up",40],["notes",1000],["updated_at",40]]);
  const safeLeads=safeRows(leads,[["id",160],["title",180],["company_id",160],["contact_id",160],["stage",60],["next_step",500],["expected_close",40],["updated_at",40]]);
  const safeActivities=safeRows(activities,[["id",160],["kind",40],["title",180],["details",1000],["status",40],["due_at",40],["company_id",160],["contact_id",160],["lead_id",160],["project_id",160],["created_at",40]]);
  const safeProjects=safeRows(projects,[["id",160],["name",180],["company_id",160],["contact_id",160],["status",40],["due_date",40],["progress",20],["updated_at",40]]);
  const safeEmails=(emails.results||[]).map(message=>({subject:safeText(message.subject,250),snippet:safeText(message.snippet,300),body:safeText(message.body_text,1200),receivedAt:message.received_at,direction:message.direction,linkedCompanyId:message.linked_company_id,linkedContactId:message.linked_contact_id,linkedLeadId:message.linked_lead_id,mailboxScope:message.connection_scope}));
  const sources=[
    ...safeCompanies.map(row=>({id:`company:${row.id}`,type:"Company",label:row.name,date:row.updated_at||null})),
    ...safeContacts.map(row=>({id:`contact:${row.id}`,type:"Contact",label:row.name,date:row.updated_at||null})),
    ...safeLeads.map(row=>({id:`lead:${row.id}`,type:"Lead",label:row.title,date:row.updated_at||null})),
    ...safeActivities.map(row=>({id:`activity:${row.id}`,type:"Activity",label:row.title,date:row.due_at||row.created_at||null})),
    ...safeProjects.map(row=>({id:`project:${row.id}`,type:"Project",label:row.name,date:row.updated_at||null})),
    ...safeEmails.map((row,index)=>({id:`email:${emails.results[index].id}`,type:"Email",label:safeText(row.subject,160)||"Email message",date:row.receivedAt||null})),
  ];
  return {
    unit: { name: safeText(unit.name,160) },
    financialAccess: context.superadmin || Number(unit.can_view_financials) === 1,
    companies: safeCompanies, contacts: safeContacts, leads: safeLeads,
    activities: safeActivities, projects: safeProjects, recentEmails:safeEmails, sources,
  };
}

export function containsCrmSecret(value) {
  const text=String(value||"");
  return /\b(?:Bearer\s+[A-Za-z0-9._~-]{20,}|(?:api[_ -]?key|password|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S{8,})/i.test(text)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(text)
    || /\b(?:sk|pk|whsec|pp_live|pp_test)_[A-Za-z0-9_-]{16,}\b/i.test(text);
}

export function sanitizeCrmAssistantText(value, financialAccess = false) {
  let text=String(value||"").slice(0,6000);
  if(!financialAccess)text=text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,"[email address withheld]")
    .replace(/(^|[^\w])\+\d{1,3}(?:[\s().-]?\d){7,14}(?!\w)/g,"$1[phone number withheld]")
    .replace(/(^|[^\w])0\d(?:[\s.-]?\d){8}(?!\w)/g,"$1[phone number withheld]")
    .replace(/(^|[^\w])\d{3}[\s.-]\d{3}[\s.-]\d{4}(?!\w)/g,"$1[phone number withheld]")
    .replace(/(^|[^\w])(?:US\$|USD|ZMW|ZK|EUR|GBP|CAD|AUD|K)\s?[\d][\d,.]*(?!\w)|(?:\$|€|£)\s?[\d][\d,.]*/gi,"$1[amount withheld]");
  return text;
}

export function parseCrmAssistantResponse(value, validRecordIds, validSourceIds = [], financialAccess = false) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) throw new Error("AI returned an empty response");
  let result;
  try {
    const candidate = raw.startsWith("{") ? raw : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    result = JSON.parse(candidate);
  } catch {
    return { answer: containsCrmSecret(raw) ? "I can’t provide credentials or secret values. I can help with CRM relationships, follow-ups, and preparation." : sanitizeCrmAssistantText(raw,financialAccess).slice(0,4200), suggestions: [], sources: [] };
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) return { answer: containsCrmSecret(raw) ? "I can’t provide credentials or secret values. I can help with CRM relationships, follow-ups, and preparation." : sanitizeCrmAssistantText(raw,financialAccess).slice(0,4200), suggestions: [], sources: [] };
  const generatedAnswer = typeof result.answer === "string" && result.answer.trim() ? result.answer.trim().slice(0, 6000) : "I couldn’t form a clear response. Please try asking in a different way.";
  const answer = containsCrmSecret(generatedAnswer) ? "I can’t provide credentials or secret values. I can help with CRM relationships, follow-ups, and preparation." : sanitizeCrmAssistantText(generatedAnswer,financialAccess);
  const availableSources = new Map(validSourceIds.map(source => [source.id, source]));
  const requestedSources = Array.isArray(result.sources) ? result.sources.slice(0,5) : [];
  const sourceIdsAreValid = requestedSources.every((id,index) => typeof id === "string" && availableSources.has(id) && requestedSources.indexOf(id) === index);
  const sources = sourceIdsAreValid ? requestedSources.map(id => availableSources.get(id)) : [];
  const sanitizedAnswer = answer.replace(/\[S(\d+)\]/g, (marker, rawIndex) => Number(rawIndex) > 0 && Number(rawIndex) <= sources.length ? marker : "");
  const allowed = new Set(validRecordIds);
  const suggestions = Array.isArray(result.suggestions) ? result.suggestions.slice(0, MAX_SUGGESTIONS).flatMap(item => {
    if (!item || !["task","note"].includes(item.kind) || typeof item.title !== "string") return [];
    const title = sanitizeCrmAssistantText(item.title.trim(),financialAccess).slice(0,200);
    const details = typeof item.details === "string" ? sanitizeCrmAssistantText(item.details.trim(),financialAccess).slice(0,1200) : "";
    if (title.length < 2 || containsCrmSecret(title) || containsCrmSecret(details)) return [];
    const dueAt = typeof item.dueAt === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?Z?)?$/.test(item.dueAt) ? item.dueAt.slice(0,32) : null;
    const linkType = ["company","contact","lead","project"].includes(item.linkType) ? item.linkType : null;
    const linkId = typeof item.linkId === "string" && allowed.has(`${item.linkType}:${item.linkId}`) ? item.linkId : null;
    return [{ kind: item.kind, title, details, dueAt: item.kind === "task" ? dueAt : null, linkType: linkId ? linkType : null, linkId }];
  }) : [];
  return { answer: sanitizedAnswer.slice(0,4200), suggestions, sources };
}
