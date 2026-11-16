-- Public support intake and automated delivery are system-generated audit events.
-- Preserve all existing audit rows while allowing those events to have no CRM user actor.
DROP TRIGGER crm_audit_events_no_update;
DROP TRIGGER crm_audit_events_no_delete;

ALTER TABLE crm_audit_events RENAME TO crm_audit_events_legacy;

CREATE TABLE crm_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES crm_tenants(id) ON DELETE CASCADE,
  unit_id TEXT,
  actor_user_id TEXT REFERENCES crm_users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO crm_audit_events(id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json,created_at)
SELECT id,tenant_id,unit_id,actor_user_id,action,entity_type,entity_id,metadata_json,created_at
FROM crm_audit_events_legacy;

DROP TABLE crm_audit_events_legacy;

CREATE INDEX crm_audit_scope_idx ON crm_audit_events(tenant_id,unit_id,created_at DESC);
CREATE TRIGGER crm_audit_events_no_update BEFORE UPDATE ON crm_audit_events BEGIN SELECT RAISE(ABORT,'CRM audit events are append-only'); END;
CREATE TRIGGER crm_audit_events_no_delete BEFORE DELETE ON crm_audit_events BEGIN SELECT RAISE(ABORT,'CRM audit events are append-only'); END;
