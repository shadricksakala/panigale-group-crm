CREATE TABLE crm_ai_conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,user_id) REFERENCES crm_memberships(tenant_id,user_id) ON DELETE CASCADE
);

CREATE TABLE crm_ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES crm_ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL CHECK(length(content) <= 6000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE crm_ai_suggestions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES crm_ai_conversations(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('task','note')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','dismissed')),
  activity_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  FOREIGN KEY(tenant_id,unit_id) REFERENCES crm_units(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,user_id) REFERENCES crm_memberships(tenant_id,user_id) ON DELETE CASCADE
);

CREATE TABLE crm_ai_rate_limits (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(tenant_id,user_id),
  FOREIGN KEY(tenant_id,user_id) REFERENCES crm_memberships(tenant_id,user_id) ON DELETE CASCADE
);

CREATE TABLE crm_notification_preferences (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email_reminders_enabled INTEGER NOT NULL DEFAULT 0 CHECK(email_reminders_enabled IN (0,1)),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(tenant_id,user_id),
  FOREIGN KEY(tenant_id,user_id) REFERENCES crm_memberships(tenant_id,user_id) ON DELETE CASCADE
);

CREATE TABLE crm_email_outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL REFERENCES crm_users(id),
  recipient_email TEXT NOT NULL,
  message_type TEXT NOT NULL,
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

CREATE INDEX crm_ai_conversations_owner_idx ON crm_ai_conversations(tenant_id,unit_id,user_id,updated_at DESC);
CREATE INDEX crm_ai_messages_conversation_idx ON crm_ai_messages(conversation_id,created_at);
CREATE INDEX crm_ai_suggestions_owner_idx ON crm_ai_suggestions(tenant_id,unit_id,user_id,status,created_at DESC);
CREATE INDEX crm_email_outbox_queue_idx ON crm_email_outbox(status,next_attempt_at,created_at);
