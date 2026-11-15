const UNIT_SEEDS = [
  ["panipay", "PaniPay", "Payments and invoicing", "https://panipay.panigale.tech"],
  ["futurecampus", "FutureCampus", "Education technology", "https://futurecampus.africa"],
  ["euroza", "Euroza Consultancy", "Strategy and advisory", "https://euroza.panigale.tech"],
  ["ebt", "EBT", "Business technology", "https://ebt.panigale.tech"],
  ["zedpreneurs", "ZedPreneurs", "Entrepreneurship and skills", "https://zedprenuers.com"],
  ["strongpoint-capital", "StrongPoint Capital", "Fund management", "https://strongpoint.panigale.tech"],
  ["ultra-fx-academy", "Ultra FX Academy", "Financial education", "https://ultrafxacademy.online"],
  ["proventus-show", "The Proventus Show", "Media and thought leadership", "https://pshow.panigale.tech"],
  ["asil", "ASIL Zambia", "Advanced AI research", "https://panigale.tech/asil/"],
];

const RESOURCES = Object.freeze({
  contacts: { table: "crm_contacts", fields: ["name", "contact_type", "company", "email", "phone", "source", "notes", "status"], required: ["name"] },
  leads: { table: "crm_leads", fields: ["title", "contact_id", "stage", "source", "value_minor", "currency", "expected_close", "owner_user_id", "loss_reason", "notes"], required: ["title"] },
  activities: { table: "crm_activities", fields: ["title", "contact_id", "lead_id", "project_id", "kind", "details", "status", "due_at", "owner_user_id"], required: ["title"] },
  projects: { table: "crm_projects", fields: ["name", "contact_id", "lead_id", "description", "status", "due_date", "owner_user_id"], required: ["name"] },
  proposals: { table: "crm_proposals", fields: ["title", "contact_id", "lead_id", "scope", "amount_minor", "currency", "status", "valid_until"], required: ["title"] },
  invoices: { table: "crm_invoices", fields: ["title", "contact_id", "proposal_id", "external_reference", "amount_minor", "currency", "status", "due_date", "paid_at"], required: ["title", "amount_minor"] },
});

const ENUMS = {
  contacts: { contact_type: ["person", "organization"], status: ["active", "inactive", "archived"] },
  leads: { stage: ["new", "qualified", "proposal", "won", "lost"] },
  activities: { kind: ["task", "call", "meeting", "email", "note", "follow_up"], status: ["open", "completed", "cancelled"] },
  projects: { status: ["planned", "active", "on_hold", "completed", "cancelled"] },
  proposals: { status: ["draft", "sent", "accepted", "rejected", "expired"] },
  invoices: { status: ["draft", "sent", "paid", "overdue", "cancelled"] },
};

const text = (value, max = 4000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validEmail = value => !value || (typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
const dateValue = value => !value || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value));

export async function isCrmPlatformSuperadmin(db, userId) {
  const row = await db.prepare("SELECT 1 AS allowed FROM platform_staff WHERE user_id = ? AND role = 'superadmin' AND active = 1").bind(userId).first();
  return Boolean(row);
}

export async function bootstrapPanigaleCrm(db, user) {
  if (!(await isCrmPlatformSuperadmin(db, user.id))) throw new Response("PaniPay platform superadmin access is required for initial CRM setup", { status: 403 });
  let tenant = await db.prepare("SELECT id,name,slug,status FROM crm_tenants WHERE slug='panigale-group'").first();
  if (!tenant) {
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO crm_tenants(id,name,slug,created_by) VALUES(?, 'Panigale Group', 'panigale-group', ?)").bind(id, user.id).run();
    tenant = await db.prepare("SELECT id,name,slug,status FROM crm_tenants WHERE id=?").bind(id).first();
  }
  for (const [slug, name, category, website] of UNIT_SEEDS) {
    await db.prepare("INSERT OR IGNORE INTO crm_units(id,tenant_id,name,slug,category,website) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(), tenant.id, name, slug, category, website).run();
  }
  await db.prepare("INSERT INTO crm_memberships(tenant_id,user_id,role,granted_by) VALUES(?,?,'superadmin',?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role='superadmin'").bind(tenant.id, user.id, user.id).run();
  await audit(db, tenant.id, null, user.id, "crm.bootstrap", "tenant", tenant.id, { name: tenant.name });
  return { tenant, units: await db.prepare("SELECT id,name,slug,category,website,active FROM crm_units WHERE tenant_id=? ORDER BY name").bind(tenant.id).all().then(result => result.results || []) };
}

export async function crmContext(db, userId, tenantId = "") {
  const member = tenantId
    ? await db.prepare("SELECT t.id AS tenant_id,t.name AS tenant_name,t.slug,t.status,m.role FROM crm_memberships m JOIN crm_tenants t ON t.id=m.tenant_id WHERE m.user_id=? AND m.tenant_id=? AND t.status='active'").bind(userId, tenantId).first()
    : await db.prepare("SELECT t.id AS tenant_id,t.name AS tenant_name,t.slug,t.status,m.role FROM crm_memberships m JOIN crm_tenants t ON t.id=m.tenant_id WHERE m.user_id=? AND t.status='active' ORDER BY t.created_at LIMIT 1").bind(userId).first();
  if (!member) throw new Response("You do not have CRM access. Ask a CRM superadmin to grant access.", { status: 403 });
  const superadmin = member.role === "superadmin";
  const result = superadmin
    ? await db.prepare("SELECT id,name,slug,category,website,active FROM crm_units WHERE tenant_id=? AND active=1 ORDER BY name").bind(member.tenant_id).all()
    : await db.prepare("SELECT u.id,u.name,u.slug,u.category,u.website,u.active,a.unit_role FROM crm_unit_access a JOIN crm_units u ON u.id=a.unit_id AND u.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.user_id=? AND u.active=1 ORDER BY u.name").bind(member.tenant_id, userId).all();
  const units = result.results || [];
  return { tenantId: String(member.tenant_id), tenantName: String(member.tenant_name), tenantSlug: String(member.slug), role: String(member.role), superadmin, units, unitIds: units.map(unit => String(unit.id)) };
}

export async function getCrmBootstrapStatus(db, userId) {
  const canBootstrap = await isCrmPlatformSuperadmin(db, userId);
  const tenant = await db.prepare("SELECT id,name,slug,status FROM crm_tenants WHERE slug='panigale-group'").first();
  if (!tenant) return { ready: false, canBootstrap };
  const membership = await db.prepare("SELECT role FROM crm_memberships WHERE tenant_id=? AND user_id=?").bind(tenant.id, userId).first();
  return { ready: true, canBootstrap, hasAccess: Boolean(membership), role: membership?.role || null, tenant };
}

function scopeWhere(context, unitId = "") {
  if (unitId) {
    if (!context.unitIds.includes(unitId)) throw new Response("You do not have access to this business unit", { status: 403 });
    return { sql: "r.tenant_id=? AND r.unit_id=?", bindings: [context.tenantId, unitId] };
  }
  if (!context.unitIds.length) return { sql: "r.tenant_id=? AND r.unit_id IS NULL", bindings: [context.tenantId] };
  return { sql: `r.tenant_id=? AND r.unit_id IN (${context.unitIds.map(() => "?").join(",")})`, bindings: [context.tenantId, ...context.unitIds] };
}

export async function readCrmResource(db, context, resource, unitId = "") {
  if (resource === "units") return context.units;
  if (resource === "members") {
    if (!context.superadmin) throw new Response("CRM superadmin access is required", { status: 403 });
    const { results = [] } = await db.prepare(`SELECT m.user_id,u.name,u.email,m.role,m.created_at,
      COALESCE((SELECT group_concat(a.unit_id, ',') FROM crm_unit_access a WHERE a.tenant_id=m.tenant_id AND a.user_id=m.user_id),'') AS unit_ids
      FROM crm_memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? ORDER BY m.role,u.name COLLATE NOCASE`).bind(context.tenantId).all();
    return results;
  }
  if (resource === "dashboard") {
    const scope = scopeWhere(context, unitId);
    const [leadRows, contactRows, projectRows, taskRows, invoiceRows, proposalRows] = await db.batch([
      db.prepare(`SELECT r.stage,COUNT(*) AS count,COALESCE(SUM(r.value_minor),0) AS value_minor FROM crm_leads r WHERE ${scope.sql} GROUP BY r.stage`).bind(...scope.bindings),
      db.prepare(`SELECT COUNT(*) AS count FROM crm_contacts r WHERE ${scope.sql} AND r.status='active'`).bind(...scope.bindings),
      db.prepare(`SELECT COUNT(*) AS count FROM crm_projects r WHERE ${scope.sql} AND r.status IN ('planned','active','on_hold')`).bind(...scope.bindings),
      db.prepare(`SELECT COUNT(*) AS count FROM crm_activities r WHERE ${scope.sql} AND r.status='open' AND r.kind IN ('task','follow_up') AND r.due_at <= datetime('now','+7 days')`).bind(...scope.bindings),
      db.prepare(`SELECT r.status,COUNT(*) AS count,COALESCE(SUM(r.amount_minor),0) AS amount_minor FROM crm_invoices r WHERE ${scope.sql} AND r.status IN ('sent','overdue','paid') GROUP BY r.status`).bind(...scope.bindings),
      db.prepare(`SELECT r.status,COUNT(*) AS count FROM crm_proposals r WHERE ${scope.sql} AND r.status IN ('sent','accepted','rejected') GROUP BY r.status`).bind(...scope.bindings),
    ]);
    const stages = Object.fromEntries((leadRows.results || []).map(row => [row.stage, { count: Number(row.count), valueMinor: Number(row.value_minor) }]));
    const invoices = Object.fromEntries((invoiceRows.results || []).map(row => [row.status, { count: Number(row.count), amountMinor: Number(row.amount_minor) }]));
    const proposals = Object.fromEntries((proposalRows.results || []).map(row => [row.status, Number(row.count)]));
    return { leads: stages, contacts: Number(contactRows.results?.[0]?.count || 0), activeProjects: Number(projectRows.results?.[0]?.count || 0), dueTasks: Number(taskRows.results?.[0]?.count || 0), invoices, proposals };
  }
  const config = RESOURCES[resource];
  if (!config) throw new Response("CRM resource not found", { status: 404 });
  const scope = scopeWhere(context, unitId);
  const ownerField = resource === "contacts" ? "created_by" : ["leads", "activities", "projects"].includes(resource) ? "owner_user_id" : null;
  const ownerJoin = ownerField ? `LEFT JOIN users owner ON owner.id=r.${ownerField}` : "LEFT JOIN users owner ON 1=0";
  const { results = [] } = await db.prepare(`SELECT r.*,u.name AS unit_name,owner.name AS owner_name FROM ${config.table} r JOIN crm_units u ON u.id=r.unit_id ${ownerJoin} WHERE ${scope.sql} ORDER BY r.updated_at DESC LIMIT 500`).bind(...scope.bindings).all();
  return results;
}

function recordValues(resource, input, isCreate) {
  const config = RESOURCES[resource];
  if (!config) throw new Response("CRM resource not found", { status: 404 });
  const data = {};
  for (const key of config.fields) {
    if (!(key in (input || {}))) continue;
    const value = input[key];
    if (["value_minor", "amount_minor"].includes(key)) {
      if (value === "" || value === null || value === undefined) data[key] = null;
      else if (!Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new Response("Enter an amount in whole minor units", { status: 400 });
      else data[key] = Number(value);
    } else if (["contact_id", "lead_id", "project_id", "proposal_id", "owner_user_id", "paid_at"].includes(key)) data[key] = text(value, 200) || null;
    else if (["expected_close", "due_at", "due_date", "valid_until"].includes(key)) {
      if (!dateValue(value)) throw new Response("Enter a valid date", { status: 400 });
      data[key] = text(value, 40) || null;
    } else {
      const valueText = text(value, key === "notes" || key === "details" || key === "scope" || key === "description" ? 6000 : 500);
      const allowed = ENUMS[resource]?.[key];
      if (allowed && !allowed.includes(valueText)) throw new Response(`Invalid ${key.replaceAll("_", " ")}`, { status: 400 });
      data[key] = valueText || null;
    }
  }
  for (const required of isCreate ? config.required : []) if (!data[required] && data[required] !== 0) throw new Response(`${required.replaceAll("_", " ")} is required`, { status: 400 });
  if ("email" in data && !validEmail(data.email)) throw new Response("Enter a valid email address", { status: 400 });
  if (resource === "contacts" && isCreate && !data.contact_type) data.contact_type = "person";
  if (resource === "leads" && isCreate) { data.stage ||= "new"; data.currency ||= "ZMW"; }
  if (resource === "activities" && isCreate) { data.kind ||= "task"; data.status ||= "open"; }
  if (resource === "projects" && isCreate) data.status ||= "planned";
  if (resource === "proposals" && isCreate) { data.status ||= "draft"; data.currency ||= "ZMW"; }
  if (resource === "invoices" && isCreate) { data.status ||= "draft"; data.currency ||= "ZMW"; }
  return data;
}

async function ensureRelated(db, context, unitId, data) {
  for (const [key, table] of [["contact_id", "crm_contacts"], ["lead_id", "crm_leads"], ["proposal_id", "crm_proposals"], ["project_id", "crm_projects"]]) {
    if (!data[key]) continue;
    const row = await db.prepare(`SELECT id FROM ${table} WHERE id=? AND tenant_id=? AND unit_id=?`).bind(data[key], context.tenantId, unitId).first();
    if (!row) throw new Response(`Selected ${key.replace("_id", "")} is not available in this business unit`, { status: 400 });
  }
}

async function ensureUnitMember(db, context, unitId, userId) {
  if (!userId) return;
  const row = await db.prepare("SELECT 1 AS allowed FROM crm_unit_access WHERE tenant_id=? AND unit_id=? AND user_id=?").bind(context.tenantId, unitId, userId).first();
  if (!context.superadmin && !row) throw new Response("Assign this teammate to the business unit before making them an owner", { status: 400 });
  if (context.superadmin && !row) throw new Response("Assign this teammate to the business unit before making them an owner", { status: 400 });
}

export async function createCrmRecord(db, context, user, resource, input) {
  const config = RESOURCES[resource], unitId = text(input?.unitId, 100);
  if (!config) throw new Response("CRM resource not found", { status: 404 });
  if (!context.unitIds.includes(unitId)) throw new Response("You do not have access to this business unit", { status: 403 });
  const data = recordValues(resource, input, true);
  await ensureRelated(db, context, unitId, data);
  if (data.owner_user_id) await ensureUnitMember(db, context, unitId, data.owner_user_id);
  const id = crypto.randomUUID();
  const defaults = { id, tenant_id: context.tenantId, unit_id: unitId, created_by: user.id, updated_by: user.id };
  const row = { ...defaults, ...data };
  if (resource === "invoices" && !Object.hasOwn(data, "amount_minor")) throw new Response("Amount is required", { status: 400 });
  if (resource === "activities") row.created_by = user.id;
  const keys = Object.keys(row);
  const result = await db.prepare(`INSERT INTO ${config.table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`).bind(...keys.map(key => row[key])).run();
  if (!result.success) throw new Response("Unable to save CRM record", { status: 500 });
  await audit(db, context.tenantId, unitId, user.id, `crm.${resource}.created`, resource, id, {});
  return { id, ...data, tenant_id: context.tenantId, unit_id: unitId };
}

export async function updateCrmRecord(db, context, user, resource, id, input) {
  const config = RESOURCES[resource];
  if (!config) throw new Response("CRM resource not found", { status: 404 });
  const existing = await db.prepare(`SELECT unit_id FROM ${config.table} WHERE id=? AND tenant_id=?`).bind(id, context.tenantId).first();
  if (!existing) throw new Response("CRM record not found", { status: 404 });
  const unitId = String(existing.unit_id);
  if (!context.unitIds.includes(unitId)) throw new Response("You do not have access to this business unit", { status: 403 });
  const data = recordValues(resource, input, false);
  if (!Object.keys(data).length) throw new Response("No changes were provided", { status: 400 });
  await ensureRelated(db, context, unitId, data);
  if (data.owner_user_id) await ensureUnitMember(db, context, unitId, data.owner_user_id);
  data.updated_by = user.id;
  data.updated_at = new Date().toISOString();
  const keys = Object.keys(data);
  const result = await db.prepare(`UPDATE ${config.table} SET ${keys.map(key => `${key}=?`).join(",")} WHERE id=? AND tenant_id=? AND unit_id=?`).bind(...keys.map(key => data[key]), id, context.tenantId, unitId).run();
  if (!result.meta?.changes) throw new Response("Record changed; refresh and try again", { status: 409 });
  await audit(db, context.tenantId, unitId, user.id, `crm.${resource}.updated`, resource, id, { fields: keys.filter(key => key !== "updated_by" && key !== "updated_at") });
  return { id, ...data };
}

export async function archiveCrmRecord(db, context, user, resource, id) {
  const config = RESOURCES[resource];
  if (!config) throw new Response("CRM resource not found", { status: 404 });
  const existing = await db.prepare(`SELECT unit_id FROM ${config.table} WHERE id=? AND tenant_id=?`).bind(id, context.tenantId).first();
  if (!existing) throw new Response("CRM record not found", { status: 404 });
  if (!context.unitIds.includes(String(existing.unit_id))) throw new Response("You do not have access to this business unit", { status: 403 });
  const status = resource === "contacts" ? "archived" : resource === "leads" ? "lost" : resource === "projects" ? "cancelled" : resource === "activities" ? "cancelled" : resource === "proposals" ? "expired" : "cancelled";
  const result = await db.prepare(`UPDATE ${config.table} SET status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND unit_id=?`).bind(status, user.id, id, context.tenantId, existing.unit_id).run();
  if (!result.meta?.changes) throw new Response("Record changed; refresh and try again", { status: 409 });
  await audit(db, context.tenantId, String(existing.unit_id), user.id, `crm.${resource}.archived`, resource, id, { status });
  return { id, status };
}

export async function grantCrmMember(db, context, actor, input) {
  requireCrmSuperadmin(context);
  const email = text(input?.email, 254).toLowerCase();
  if (!validEmail(email)) throw new Response("A valid account email is required", { status: 400 });
  const target = await db.prepare("SELECT id,email FROM users WHERE lower(email)=?").bind(email).first();
  if (!target) throw new Response("This person must create a PaniPay account before CRM access can be granted", { status: 404 });
  const role = input?.role === "superadmin" ? "superadmin" : "member";
  const units = Array.isArray(input?.unitIds) ? [...new Set(input.unitIds.map(value => text(value, 100)))].filter(Boolean) : [];
  if (role === "member" && !units.length) throw new Response("Choose at least one business unit", { status: 400 });
  for (const unitId of units) if (!context.unitIds.includes(unitId)) throw new Response("One or more selected business units are unavailable", { status: 400 });
  if (role === "superadmin" && !(await isCrmPlatformSuperadmin(db, actor.id))) throw new Response("Only a PaniPay platform superadmin can grant CRM superadmin access", { status: 403 });
  await db.prepare("INSERT INTO crm_memberships(tenant_id,user_id,role,granted_by) VALUES(?,?,?,?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET role=excluded.role,granted_by=excluded.granted_by").bind(context.tenantId, target.id, role, actor.id).run();
  await db.prepare("DELETE FROM crm_unit_access WHERE tenant_id=? AND user_id=?").bind(context.tenantId, target.id).run();
  if (role === "member") {
    for (const unitId of units) await db.prepare("INSERT INTO crm_unit_access(tenant_id,unit_id,user_id,unit_role,granted_by) VALUES(?,?,?,'member',?)").bind(context.tenantId, unitId, target.id, actor.id).run();
  }
  await audit(db, context.tenantId, null, actor.id, "crm.access.granted", "user", target.id, { email: target.email, role, unitIds: units });
  return { userId: target.id, email: target.email, role, unitIds: units };
}

export async function revokeCrmMember(db, context, actor, userId) {
  requireCrmSuperadmin(context);
  if (userId === actor.id) throw new Response("You cannot remove your own CRM access", { status: 400 });
  const target = await db.prepare("SELECT role FROM crm_memberships WHERE tenant_id=? AND user_id=?").bind(context.tenantId, userId).first();
  if (!target) throw new Response("CRM member not found", { status: 404 });
  if (target.role === "superadmin") {
    const count = await db.prepare("SELECT COUNT(*) AS count FROM crm_memberships WHERE tenant_id=? AND role='superadmin'").bind(context.tenantId).first();
    if (Number(count?.count || 0) <= 1) throw new Response("At least one CRM superadmin must remain", { status: 409 });
  }
  await db.prepare("DELETE FROM crm_memberships WHERE tenant_id=? AND user_id=?").bind(context.tenantId, userId).run();
  await audit(db, context.tenantId, null, actor.id, "crm.access.revoked", "user", userId, { previousRole: target.role });
  return { userId, revoked: true };
}

function requireCrmSuperadmin(context) {
  if (!context.superadmin) throw new Response("CRM superadmin access is required", { status: 403 });
}

async function audit(db, tenantId, unitId, actorId, action, entityType, entityId, metadata) {
  await db.prepare("INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), tenantId, unitId, actorId, action, entityType, entityId, JSON.stringify(metadata || {})).run();
}

export async function createCrmTenant(db, actor, name, slug) {
  if (!(await isCrmPlatformSuperadmin(db, actor.id))) throw new Response("PaniPay platform superadmin access is required", { status: 403 });
  const cleanName = text(name, 160), cleanSlug = text(slug, 120).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (cleanName.length < 2 || cleanSlug.length < 2) throw new Response("Enter a workspace name and a valid URL-safe key", { status: 400 });
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO crm_tenants(id,name,slug,created_by) VALUES(?,?,?,?)").bind(id, cleanName, cleanSlug, actor.id).run();
  await db.prepare("INSERT INTO crm_memberships(tenant_id,user_id,role,granted_by) VALUES(?,?,'superadmin',?)").bind(id, actor.id, actor.id).run();
  await audit(db, id, null, actor.id, "crm.tenant.created", "tenant", id, { name: cleanName, slug: cleanSlug });
  return { id, name: cleanName, slug: cleanSlug };
}

export async function createCrmUnit(db, context, actor, input) {
  requireCrmSuperadmin(context);
  const name = text(input?.name, 160), category = text(input?.category, 120) || "Business unit", website = text(input?.website, 500) || null;
  const slug = text(input?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 120).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (name.length < 2 || slug.length < 2) throw new Response("Enter a business unit name", { status: 400 });
  if (website && !/^https:\/\//i.test(website)) throw new Response("Use a secure https website address", { status: 400 });
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO crm_units(id,tenant_id,name,slug,category,website) VALUES(?,?,?,?,?,?)").bind(id, context.tenantId, name, slug, category, website).run();
  await audit(db, context.tenantId, id, actor.id, "crm.unit.created", "unit", id, { name, slug });
  return { id, name, slug, category, website, active: 1 };
}

export async function deactivateCrmUnit(db, context, actor, unitId) {
  requireCrmSuperadmin(context);
  if (context.units.filter(unit => unit.id !== unitId).length < 1) throw new Response("A workspace must keep at least one active business unit", { status: 409 });
  const result = await db.prepare("UPDATE crm_units SET active=0 WHERE id=? AND tenant_id=? AND active=1").bind(unitId, context.tenantId).run();
  if (!result.meta?.changes) throw new Response("Business unit not found", { status: 404 });
  await audit(db, context.tenantId, unitId, actor.id, "crm.unit.deactivated", "unit", unitId, {});
  return { id: unitId, active: false };
}
