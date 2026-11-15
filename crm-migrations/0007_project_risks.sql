CREATE TABLE crm_project_risks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 180),
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','monitoring','mitigated','closed','archived')),
  owner_user_id TEXT REFERENCES crm_users(id),
  due_date TEXT,
  created_by TEXT NOT NULL REFERENCES crm_users(id),
  updated_by TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,project_id) REFERENCES crm_projects(tenant_id,unit_id,id) ON DELETE CASCADE
);

CREATE INDEX crm_project_risks_scope_idx ON crm_project_risks(tenant_id,unit_id,project_id,status,severity);
