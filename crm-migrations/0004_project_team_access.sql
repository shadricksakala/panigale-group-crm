CREATE TRIGGER crm_project_members_unit_access_insert
BEFORE INSERT ON crm_project_members
WHEN NOT EXISTS (
  SELECT 1 FROM crm_unit_access a
  WHERE a.tenant_id=NEW.tenant_id AND a.unit_id=NEW.unit_id AND a.user_id=NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT,'CRM project team member lacks access to the business unit');
END;

CREATE TRIGGER crm_project_members_unit_access_update
BEFORE UPDATE OF tenant_id,unit_id,user_id ON crm_project_members
WHEN NOT EXISTS (
  SELECT 1 FROM crm_unit_access a
  WHERE a.tenant_id=NEW.tenant_id AND a.unit_id=NEW.unit_id AND a.user_id=NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT,'CRM project team member lacks access to the business unit');
END;

CREATE TRIGGER crm_project_members_unit_access_delete
AFTER DELETE ON crm_unit_access
BEGIN
  DELETE FROM crm_project_members
  WHERE tenant_id=OLD.tenant_id AND unit_id=OLD.unit_id AND user_id=OLD.user_id;
END;

INSERT OR IGNORE INTO crm_project_members(tenant_id,unit_id,project_id,user_id,project_role,added_by)
SELECT p.tenant_id,p.unit_id,p.id,p.owner_user_id,'project_owner',p.created_by
FROM crm_projects p JOIN crm_unit_access a
  ON a.tenant_id=p.tenant_id AND a.unit_id=p.unit_id AND a.user_id=p.owner_user_id
WHERE p.owner_user_id IS NOT NULL;
