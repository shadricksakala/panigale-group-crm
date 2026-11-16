ALTER TABLE crm_email_messages ADD COLUMN automation_processed_at TEXT;

CREATE INDEX crm_email_messages_automation_pending_idx
  ON crm_email_messages(connection_id,automation_processed_at,received_at);
