ALTER TABLE crm_invoices ADD COLUMN panipay_invoice_id TEXT;
ALTER TABLE crm_invoices ADD COLUMN panipay_payment_url TEXT;
ALTER TABLE crm_invoices ADD COLUMN panipay_send_status TEXT NOT NULL DEFAULT 'not_sent' CHECK(panipay_send_status IN ('not_sent','created','sent','error'));

ALTER TABLE crm_payments ADD COLUMN panipay_payment_id TEXT;
CREATE UNIQUE INDEX crm_payments_panipay_payment_idx ON crm_payments(tenant_id,unit_id,panipay_payment_id) WHERE panipay_payment_id IS NOT NULL;

CREATE TABLE crm_panipay_connections (
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  webhook_secret_ciphertext TEXT NOT NULL,
  connected_by_user_id TEXT NOT NULL REFERENCES crm_users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,unit_id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE crm_panipay_webhook_events (
  event_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','processed','ignored','error')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX crm_panipay_events_unit_idx ON crm_panipay_webhook_events(tenant_id,unit_id,created_at DESC);
