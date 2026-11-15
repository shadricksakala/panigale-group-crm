PRAGMA foreign_keys = ON;

CREATE TABLE crm_users (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT,
  UNIQUE(issuer, subject)
);

CREATE TABLE crm_oidc_flows (
  id TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL DEFAULT '/crm',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE crm_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE crm_system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE crm_tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 160),
  slug TEXT NOT NULL UNIQUE CHECK(length(slug) BETWEEN 2 AND 120),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE crm_units (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 160),
  slug TEXT NOT NULL CHECK(length(slug) BETWEEN 2 AND 120),
  category TEXT NOT NULL DEFAULT 'business',
  website TEXT,
  accent TEXT NOT NULL DEFAULT '#1467f5',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, slug),
  UNIQUE(tenant_id, id)
);

CREATE TABLE crm_memberships (
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('superadmin','unit_manager','member')),
  granted_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,user_id)
);

CREATE TABLE crm_unit_access (
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  unit_role TEXT NOT NULL DEFAULT 'member' CHECK(unit_role IN ('manager','member')),
  can_view_financials INTEGER NOT NULL DEFAULT 0 CHECK(can_view_financials IN (0,1)),
  granted_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,unit_id,user_id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,user_id) REFERENCES crm_memberships(tenant_id,user_id) ON DELETE CASCADE
);

CREATE TABLE crm_pipeline_stages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
  slug TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  position INTEGER NOT NULL DEFAULT 0,
  is_won INTEGER NOT NULL DEFAULT 0 CHECK(is_won IN (0,1)),
  is_lost INTEGER NOT NULL DEFAULT 0 CHECK(is_lost IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(tenant_id,unit_id,slug),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE crm_companies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 180),
  industry TEXT,
  segment TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK(status IN ('lead','prospect','client','partner','inactive','archived')),
  owner_user_id TEXT REFERENCES crm_users(id),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  updated_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id)
);

CREATE TABLE crm_contacts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  company_id TEXT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 180),
  contact_type TEXT NOT NULL DEFAULT 'person' CHECK(contact_type IN ('person','organization')),
  job_title TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK(status IN ('lead','prospect','client','partner','inactive','archived')),
  owner_user_id TEXT REFERENCES crm_users(id),
  next_follow_up TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  updated_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id),
  FOREIGN KEY(tenant_id,unit_id,company_id) REFERENCES crm_companies(tenant_id,unit_id,id)
);

CREATE TABLE crm_leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  company_id TEXT,
  contact_id TEXT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 200),
  stage TEXT NOT NULL DEFAULT 'discovery',
  source TEXT,
  qualification TEXT,
  value_minor INTEGER CHECK(value_minor IS NULL OR value_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'ZMW',
  expected_close TEXT,
  next_step TEXT,
  owner_user_id TEXT REFERENCES crm_users(id),
  loss_reason TEXT,
  notes TEXT,
  converted_project_id TEXT,
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  updated_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id),
  FOREIGN KEY(tenant_id,unit_id,company_id) REFERENCES crm_companies(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,contact_id) REFERENCES crm_contacts(tenant_id,unit_id,id)
);

CREATE TABLE crm_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  company_id TEXT,
  contact_id TEXT,
  lead_id TEXT,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 200),
  description TEXT,
  engagement_type TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','on_hold','completed','cancelled')),
  start_date TEXT,
  due_date TEXT,
  owner_user_id TEXT REFERENCES crm_users(id),
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  updated_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id),
  FOREIGN KEY(tenant_id,unit_id,company_id) REFERENCES crm_companies(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,contact_id) REFERENCES crm_contacts(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,lead_id) REFERENCES crm_leads(tenant_id,unit_id,id)
);

CREATE TABLE crm_activities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  company_id TEXT,
  contact_id TEXT,
  lead_id TEXT,
  project_id TEXT,
  kind TEXT NOT NULL DEFAULT 'task' CHECK(kind IN ('task','call','meeting','email','note','follow_up')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 200),
  details TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),
  due_at TEXT,
  completed_at TEXT,
  owner_user_id TEXT REFERENCES crm_users(id),
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  updated_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id),
  FOREIGN KEY(tenant_id,unit_id,company_id) REFERENCES crm_companies(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,contact_id) REFERENCES crm_contacts(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,lead_id) REFERENCES crm_leads(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,project_id) REFERENCES crm_projects(tenant_id,unit_id,id)
);

CREATE TABLE crm_project_members (
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES crm_users(id),
  project_role TEXT NOT NULL DEFAULT 'consultant',
  added_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,unit_id,project_id,user_id),
  FOREIGN KEY(tenant_id,unit_id,project_id) REFERENCES crm_projects(tenant_id,unit_id,id) ON DELETE CASCADE
);

CREATE TABLE crm_milestones (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 180),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','blocked')),
  due_date TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,project_id) REFERENCES crm_projects(tenant_id,unit_id,id) ON DELETE CASCADE
);

CREATE TABLE crm_deliverables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  milestone_id TEXT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 180),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','in_review','completed')),
  due_date TEXT,
  owner_user_id TEXT REFERENCES crm_users(id),
  document_id TEXT,
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,project_id) REFERENCES crm_projects(tenant_id,unit_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,unit_id,milestone_id) REFERENCES crm_milestones(tenant_id,unit_id,id)
);

CREATE TABLE crm_proposals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  company_id TEXT,
  contact_id TEXT,
  lead_id TEXT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 200),
  scope TEXT,
  amount_minor INTEGER CHECK(amount_minor IS NULL OR amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'ZMW',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','sent','accepted','rejected','expired')),
  valid_until TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  updated_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id),
  FOREIGN KEY(tenant_id,unit_id,company_id) REFERENCES crm_companies(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,contact_id) REFERENCES crm_contacts(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,lead_id) REFERENCES crm_leads(tenant_id,unit_id,id)
);

CREATE TABLE crm_proposal_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  scope TEXT,
  amount_minor INTEGER,
  currency TEXT NOT NULL,
  valid_until TEXT,
  changed_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,proposal_id,version),
  FOREIGN KEY(tenant_id,unit_id,proposal_id) REFERENCES crm_proposals(tenant_id,unit_id,id) ON DELETE CASCADE
);

CREATE TABLE crm_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  company_id TEXT,
  contact_id TEXT,
  project_id TEXT,
  proposal_id TEXT,
  filename TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 15728640),
  version_label TEXT,
  uploaded_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id),
  FOREIGN KEY(tenant_id,unit_id,company_id) REFERENCES crm_companies(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,contact_id) REFERENCES crm_contacts(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,project_id) REFERENCES crm_projects(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,proposal_id) REFERENCES crm_proposals(tenant_id,unit_id,id)
);

CREATE TABLE crm_invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  company_id TEXT,
  contact_id TEXT,
  proposal_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 200),
  external_reference TEXT,
  amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'ZMW',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','overdue','cancelled')),
  due_date TEXT,
  paid_at TEXT,
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  updated_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id),
  FOREIGN KEY(tenant_id,unit_id,company_id) REFERENCES crm_companies(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,contact_id) REFERENCES crm_contacts(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,proposal_id) REFERENCES crm_proposals(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,project_id) REFERENCES crm_projects(tenant_id,unit_id,id)
);

CREATE TABLE crm_payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  paid_at TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'manual',
  reference TEXT,
  notes TEXT,
  recorded_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id,unit_id,invoice_id) REFERENCES crm_invoices(tenant_id,unit_id,id) ON DELETE CASCADE
);

CREATE TABLE crm_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  unit_id TEXT,
  actor_user_id TEXT NOT NULL REFERENCES crm_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX crm_sessions_user_idx ON crm_sessions(user_id,expires_at);
CREATE INDEX crm_memberships_user_idx ON crm_memberships(user_id,tenant_id);
CREATE INDEX crm_unit_access_user_idx ON crm_unit_access(tenant_id,user_id,unit_id);
CREATE INDEX crm_pipeline_scope_idx ON crm_pipeline_stages(tenant_id,unit_id,active,position);
CREATE INDEX crm_companies_scope_idx ON crm_companies(tenant_id,unit_id,status,updated_at DESC);
CREATE INDEX crm_contacts_scope_idx ON crm_contacts(tenant_id,unit_id,status,updated_at DESC);
CREATE INDEX crm_leads_scope_idx ON crm_leads(tenant_id,unit_id,stage,updated_at DESC);
CREATE INDEX crm_activities_scope_idx ON crm_activities(tenant_id,unit_id,status,due_at);
CREATE INDEX crm_projects_scope_idx ON crm_projects(tenant_id,unit_id,status,updated_at DESC);
CREATE INDEX crm_milestones_project_idx ON crm_milestones(tenant_id,unit_id,project_id,position);
CREATE INDEX crm_deliverables_project_idx ON crm_deliverables(tenant_id,unit_id,project_id,due_date);
CREATE INDEX crm_proposals_scope_idx ON crm_proposals(tenant_id,unit_id,status,updated_at DESC);
CREATE INDEX crm_documents_scope_idx ON crm_documents(tenant_id,unit_id,created_at DESC);
CREATE INDEX crm_invoices_scope_idx ON crm_invoices(tenant_id,unit_id,status,due_date);
CREATE INDEX crm_payments_invoice_idx ON crm_payments(tenant_id,unit_id,invoice_id,paid_at);
CREATE INDEX crm_audit_scope_idx ON crm_audit_events(tenant_id,unit_id,created_at DESC);

CREATE TRIGGER crm_audit_events_no_update BEFORE UPDATE ON crm_audit_events BEGIN SELECT RAISE(ABORT,'CRM audit events are append-only'); END;
CREATE TRIGGER crm_audit_events_no_delete BEFORE DELETE ON crm_audit_events BEGIN SELECT RAISE(ABORT,'CRM audit events are append-only'); END;
