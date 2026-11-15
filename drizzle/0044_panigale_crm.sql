CREATE TABLE IF NOT EXISTS crm_tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 160),
  slug TEXT NOT NULL UNIQUE CHECK(length(slug) BETWEEN 2 AND 120),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_units (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 160),
  slug TEXT NOT NULL CHECK(length(slug) BETWEEN 2 AND 120),
  category TEXT NOT NULL DEFAULT 'business',
  website TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS crm_memberships (
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('superadmin','member')),
  granted_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,user_id)
);

CREATE TABLE IF NOT EXISTS crm_unit_access (
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL REFERENCES crm_units(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_role TEXT NOT NULL DEFAULT 'member' CHECK(unit_role IN ('manager','member')),
  granted_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,unit_id,user_id),
  FOREIGN KEY(tenant_id,user_id) REFERENCES crm_memberships(tenant_id,user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS crm_contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES crm_units(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
  contact_type TEXT NOT NULL DEFAULT 'person' CHECK(contact_type IN ('person','organization')),
  company TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','archived')),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES crm_units(id),
  contact_id TEXT REFERENCES crm_contacts(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 200),
  stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','qualified','proposal','won','lost')),
  source TEXT,
  value_minor INTEGER CHECK(value_minor IS NULL OR value_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'ZMW',
  expected_close TEXT,
  owner_user_id TEXT REFERENCES users(id),
  loss_reason TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_activities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES crm_units(id),
  contact_id TEXT REFERENCES crm_contacts(id),
  lead_id TEXT REFERENCES crm_leads(id),
  project_id TEXT,
  kind TEXT NOT NULL DEFAULT 'task' CHECK(kind IN ('task','call','meeting','email','note','follow_up')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 200),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
  due_at TEXT,
  owner_user_id TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES crm_units(id),
  contact_id TEXT REFERENCES crm_contacts(id),
  lead_id TEXT REFERENCES crm_leads(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 200),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','on_hold','completed','cancelled')),
  due_date TEXT,
  owner_user_id TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_proposals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES crm_units(id),
  contact_id TEXT REFERENCES crm_contacts(id),
  lead_id TEXT REFERENCES crm_leads(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 200),
  scope TEXT,
  amount_minor INTEGER CHECK(amount_minor IS NULL OR amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'ZMW',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected','expired')),
  valid_until TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES crm_units(id),
  contact_id TEXT REFERENCES crm_contacts(id),
  proposal_id TEXT REFERENCES crm_proposals(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 200),
  external_reference TEXT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'ZMW',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','overdue','cancelled')),
  due_date TEXT,
  paid_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  updated_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES crm_units(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS crm_units_tenant_active_idx ON crm_units(tenant_id,active,name);
CREATE INDEX IF NOT EXISTS crm_memberships_user_idx ON crm_memberships(user_id,tenant_id);
CREATE INDEX IF NOT EXISTS crm_unit_access_user_idx ON crm_unit_access(tenant_id,user_id,unit_id);
CREATE INDEX IF NOT EXISTS crm_contacts_scope_idx ON crm_contacts(tenant_id,unit_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_leads_scope_idx ON crm_leads(tenant_id,unit_id,stage,updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_activities_scope_idx ON crm_activities(tenant_id,unit_id,status,due_at);
CREATE INDEX IF NOT EXISTS crm_projects_scope_idx ON crm_projects(tenant_id,unit_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_proposals_scope_idx ON crm_proposals(tenant_id,unit_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_invoices_scope_idx ON crm_invoices(tenant_id,unit_id,status,due_date);
CREATE INDEX IF NOT EXISTS crm_audit_scope_idx ON crm_audit_events(tenant_id,unit_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS crm_audit_events_no_update BEFORE UPDATE ON crm_audit_events BEGIN SELECT RAISE(ABORT,'CRM audit events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS crm_audit_events_no_delete BEFORE DELETE ON crm_audit_events BEGIN SELECT RAISE(ABORT,'CRM audit events are append-only'); END;
