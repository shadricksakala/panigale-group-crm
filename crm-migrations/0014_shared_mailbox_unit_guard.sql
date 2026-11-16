-- Shared mailboxes are assigned to one unit per tenant. Keep this invariant
-- in D1 so concurrent OAuth callbacks cannot create cross-unit duplicates.
CREATE TRIGGER crm_google_shared_unit_guard_insert
BEFORE INSERT ON crm_google_connections
WHEN NEW.connection_scope='shared' AND NEW.status='active'
BEGIN
  SELECT RAISE(ABORT, 'shared mailbox is already assigned to another business unit')
  WHERE EXISTS (
    SELECT 1 FROM crm_google_connections existing
    WHERE existing.tenant_id=NEW.tenant_id
      AND existing.unit_id<>NEW.unit_id
      AND lower(existing.email)=lower(NEW.email)
      AND existing.connection_scope='shared'
      AND existing.status='active'
  );
END;

CREATE TRIGGER crm_google_shared_unit_guard_update
BEFORE UPDATE OF tenant_id,unit_id,email,connection_scope,status ON crm_google_connections
WHEN NEW.connection_scope='shared' AND NEW.status='active'
BEGIN
  SELECT RAISE(ABORT, 'shared mailbox is already assigned to another business unit')
  WHERE EXISTS (
    SELECT 1 FROM crm_google_connections existing
    WHERE existing.id<>NEW.id
      AND existing.tenant_id=NEW.tenant_id
      AND existing.unit_id<>NEW.unit_id
      AND lower(existing.email)=lower(NEW.email)
      AND existing.connection_scope='shared'
      AND existing.status='active'
  );
END;
