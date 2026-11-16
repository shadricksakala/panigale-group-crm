ALTER TABLE crm_email_unit_settings ADD COLUMN inbound_route_enabled INTEGER NOT NULL DEFAULT 0 CHECK(inbound_route_enabled IN (0,1));
ALTER TABLE crm_email_unit_settings ADD COLUMN inbound_fallback_user_id TEXT REFERENCES crm_users(id);

CREATE INDEX crm_contacts_email_lookup_idx ON crm_contacts(tenant_id,unit_id,email);
CREATE INDEX crm_companies_email_lookup_idx ON crm_companies(tenant_id,unit_id,email);
