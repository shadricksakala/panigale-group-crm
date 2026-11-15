CREATE TABLE crm_proposal_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  scope TEXT,
  currency TEXT NOT NULL DEFAULT 'ZMW',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  updated_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id)
);
CREATE UNIQUE INDEX crm_proposal_templates_name_idx ON crm_proposal_templates(tenant_id,unit_id,lower(name)) WHERE active=1;
CREATE INDEX crm_proposal_templates_scope_idx ON crm_proposal_templates(tenant_id,unit_id,active,name COLLATE NOCASE);