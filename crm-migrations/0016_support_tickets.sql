CREATE TABLE crm_support_integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  app_slug TEXT NOT NULL,
  app_name TEXT NOT NULL,
  portal_slug TEXT NOT NULL UNIQUE,
  api_key_hash TEXT UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE crm_support_tickets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  ticket_number TEXT NOT NULL,
  source_app TEXT NOT NULL,
  source_ticket_id TEXT,
  source_status TEXT,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  company_name TEXT,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','waiting','resolved','closed')),
  assigned_user_id TEXT,
  linked_reference TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  first_response_at TEXT,
  resolved_at TEXT,
  UNIQUE(tenant_id,ticket_number),
  UNIQUE(tenant_id,unit_id,id),
  UNIQUE(tenant_id,source_app,source_ticket_id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(assigned_user_id) REFERENCES crm_users(id) ON DELETE SET NULL
);
CREATE INDEX crm_support_tickets_queue ON crm_support_tickets(tenant_id,unit_id,status,updated_at DESC);
CREATE INDEX crm_support_tickets_customer ON crm_support_tickets(tenant_id,unit_id,customer_email,created_at DESC);

CREATE TABLE crm_support_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  source_message_id TEXT,
  author_type TEXT NOT NULL CHECK(author_type IN ('customer','agent','system')),
  author_name TEXT NOT NULL,
  author_email TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','internal')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id,source_message_id),
  FOREIGN KEY(tenant_id,unit_id,ticket_id) REFERENCES crm_support_tickets(tenant_id,unit_id,id) ON DELETE CASCADE
);
CREATE INDEX crm_support_messages_thread ON crm_support_messages(tenant_id,unit_id,ticket_id,created_at);

CREATE TABLE crm_support_email_outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY(tenant_id,unit_id,ticket_id) REFERENCES crm_support_tickets(tenant_id,unit_id,id) ON DELETE CASCADE,
  FOREIGN KEY(message_id) REFERENCES crm_support_messages(id) ON DELETE CASCADE
);

ALTER TABLE crm_email_drafts ADD COLUMN support_message_id TEXT REFERENCES crm_support_messages(id) ON DELETE SET NULL;

CREATE TABLE crm_support_intake_limits (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(integration_id) REFERENCES crm_support_integrations(id) ON DELETE CASCADE
);
CREATE INDEX crm_support_intake_rate ON crm_support_intake_limits(integration_id,email_hash,created_at);

CREATE INDEX crm_email_drafts_support_message ON crm_email_drafts(support_message_id);

INSERT OR IGNORE INTO crm_support_integrations(id,tenant_id,unit_id,app_slug,app_name,portal_slug)
SELECT lower(hex(randomblob(16))),t.id,u.id,'panipay','PaniPay','panipay'
FROM crm_tenants t JOIN crm_units u ON u.tenant_id=t.id WHERE t.slug='panigale-group' AND u.slug='panipay';
INSERT OR IGNORE INTO crm_support_integrations(id,tenant_id,unit_id,app_slug,app_name,portal_slug)
SELECT lower(hex(randomblob(16))),t.id,u.id,'euroza','EUROZA','euroza'
FROM crm_tenants t JOIN crm_units u ON u.tenant_id=t.id WHERE t.slug='panigale-group' AND u.slug='euroza';
INSERT OR IGNORE INTO crm_support_integrations(id,tenant_id,unit_id,app_slug,app_name,portal_slug)
SELECT lower(hex(randomblob(16))),t.id,u.id,u.slug,u.name,u.slug
FROM crm_tenants t JOIN crm_units u ON u.tenant_id=t.id
WHERE t.slug='panigale-group' AND u.slug IN ('ebt','futurecampus','zedpreneurs','strongpoint-capital','ultra-fx-academy','proventus-show','asil');
ALTER TABLE crm_support_integrations ADD COLUMN support_email TEXT;
UPDATE crm_support_integrations SET support_email='panipay@panigale.tech' WHERE app_slug='panipay';
UPDATE crm_support_integrations SET support_email='euroza@panigale.tech' WHERE app_slug='euroza';
