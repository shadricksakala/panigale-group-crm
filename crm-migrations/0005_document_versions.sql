ALTER TABLE crm_documents ADD COLUMN document_group_id TEXT;
ALTER TABLE crm_documents ADD COLUMN version_number INTEGER NOT NULL DEFAULT 1 CHECK(version_number > 0);
UPDATE crm_documents SET document_group_id = id WHERE document_group_id IS NULL;
CREATE UNIQUE INDEX crm_documents_group_version_idx ON crm_documents(tenant_id,unit_id,document_group_id,version_number);