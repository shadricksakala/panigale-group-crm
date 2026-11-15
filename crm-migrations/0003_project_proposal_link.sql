ALTER TABLE crm_projects ADD COLUMN proposal_id TEXT;
CREATE UNIQUE INDEX crm_projects_proposal_unique_idx ON crm_projects(tenant_id,unit_id,proposal_id) WHERE proposal_id IS NOT NULL;

CREATE TRIGGER crm_projects_proposal_scope_insert
BEFORE INSERT ON crm_projects
WHEN NEW.proposal_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM crm_proposals p
  WHERE p.id=NEW.proposal_id AND p.tenant_id=NEW.tenant_id AND p.unit_id=NEW.unit_id
)
BEGIN
  SELECT RAISE(ABORT,'CRM proposal belongs to a different workspace or business unit');
END;

CREATE TRIGGER crm_projects_proposal_scope_update
BEFORE UPDATE OF proposal_id,tenant_id,unit_id ON crm_projects
WHEN NEW.proposal_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM crm_proposals p
  WHERE p.id=NEW.proposal_id AND p.tenant_id=NEW.tenant_id AND p.unit_id=NEW.unit_id
)
BEGIN
  SELECT RAISE(ABORT,'CRM proposal belongs to a different workspace or business unit');
END;
