CREATE TABLE crm_google_oauth_flows (
  id TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  connection_scope TEXT NOT NULL CHECK(connection_scope IN ('personal','shared')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,user_id) REFERENCES crm_memberships(tenant_id,user_id) ON DELETE CASCADE
);

CREATE TABLE crm_google_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  connection_scope TEXT NOT NULL CHECK(connection_scope IN ('personal','shared')),
  owner_user_id TEXT REFERENCES crm_users(id),
  connected_by_user_id TEXT NOT NULL REFERENCES crm_users(id),
  google_subject TEXT NOT NULL,
  email TEXT NOT NULL,
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  access_token_expires_at TEXT,
  granted_scopes TEXT NOT NULL,
  gmail_history_id TEXT,
  gmail_sync_cursor TEXT,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disconnected','reauth_required','error')),
  retention_days INTEGER NOT NULL DEFAULT 90 CHECK(retention_days BETWEEN 0 AND 3650),
  connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disconnected_at TEXT,
  UNIQUE(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX crm_google_personal_active_email ON crm_google_connections(tenant_id,unit_id,owner_user_id,email) WHERE connection_scope='personal' AND status='active';
CREATE UNIQUE INDEX crm_google_shared_active_email ON crm_google_connections(tenant_id,unit_id,email) WHERE connection_scope='shared' AND status='active';

CREATE TABLE crm_email_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  private_owner_user_id TEXT REFERENCES crm_users(id),
  provider_message_id TEXT NOT NULL,
  provider_thread_id TEXT,
  from_email TEXT,
  to_emails_json TEXT NOT NULL DEFAULT '[]',
  cc_emails_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  body_text TEXT,
  body_html TEXT,
  sent_at TEXT,
  received_at TEXT,
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  linked_company_id TEXT,
  linked_contact_id TEXT,
  linked_lead_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(connection_id,provider_message_id),
  FOREIGN KEY(tenant_id,unit_id,connection_id) REFERENCES crm_google_connections(tenant_id,unit_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,unit_id,linked_company_id) REFERENCES crm_companies(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,linked_contact_id) REFERENCES crm_contacts(tenant_id,unit_id,id),
  FOREIGN KEY(tenant_id,unit_id,linked_lead_id) REFERENCES crm_leads(tenant_id,unit_id,id)
);

CREATE TABLE crm_email_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  message_id TEXT NOT NULL REFERENCES crm_email_messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 0 AND 26214400),
  storage_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE crm_email_drafts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES crm_users(id),
  private_owner_user_id TEXT REFERENCES crm_users(id),
  connection_id TEXT,
  source_message_id TEXT REFERENCES crm_email_messages(id),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  message_kind TEXT NOT NULL CHECK(message_kind IN ('receipt','client','internal')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','approved','rejected','queued','sent','failed')),
  approval_required INTEGER NOT NULL DEFAULT 1 CHECK(approval_required IN (0,1)),
  approved_by_user_id TEXT REFERENCES crm_users(id),
  reviewed_at TEXT,
  provider_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,unit_id,connection_id) REFERENCES crm_google_connections(tenant_id,unit_id,id)
);

CREATE TABLE crm_email_unit_settings (
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  receipt_auto_enabled INTEGER NOT NULL DEFAULT 0 CHECK(receipt_auto_enabled IN (0,1)),
  receipt_subject TEXT NOT NULL DEFAULT 'We received your message' CHECK(length(receipt_subject) BETWEEN 2 AND 250),
  receipt_body TEXT NOT NULL DEFAULT 'Thank you for contacting us. We have received your message and will direct it to the right person.',
  updated_by_user_id TEXT REFERENCES crm_users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,unit_id),
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE crm_client_email_outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  draft_id TEXT NOT NULL UNIQUE REFERENCES crm_email_drafts(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE
);

CREATE TABLE crm_email_sync_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  job_kind TEXT NOT NULL CHECK(job_kind IN ('initial_history','incremental')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','complete','failed','cancelled')),
  cursor TEXT,
  imported_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id,unit_id,connection_id) REFERENCES crm_google_connections(tenant_id,unit_id,id) ON DELETE CASCADE
);

CREATE INDEX crm_google_connections_unit_idx ON crm_google_connections(tenant_id,unit_id,status,connection_scope);
CREATE INDEX crm_email_messages_unit_date_idx ON crm_email_messages(tenant_id,unit_id,received_at DESC);
CREATE INDEX crm_email_messages_private_owner_idx ON crm_email_messages(tenant_id,unit_id,private_owner_user_id,received_at DESC);
CREATE INDEX crm_email_drafts_approval_idx ON crm_email_drafts(tenant_id,unit_id,status,created_at DESC);
CREATE INDEX crm_email_sync_jobs_queue_idx ON crm_email_sync_jobs(status,created_at);
CREATE UNIQUE INDEX crm_email_sync_one_active_job ON crm_email_sync_jobs(connection_id,job_kind) WHERE status IN ('queued','running');
CREATE INDEX crm_email_unit_settings_scope_idx ON crm_email_unit_settings(tenant_id,unit_id);
CREATE INDEX crm_client_email_outbox_queue_idx ON crm_client_email_outbox(status,created_at);
