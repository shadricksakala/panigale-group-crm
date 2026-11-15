ALTER TABLE crm_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived'));
CREATE INDEX crm_documents_active_scope_idx ON crm_documents(tenant_id,unit_id,status,created_at DESC);
