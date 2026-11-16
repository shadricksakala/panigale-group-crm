# Email and calendar integrations

## Google OAuth setup

The CRM uses the Google OAuth authorization code flow with PKCE. Register this exact redirect URI on a Google OAuth web application:

`https://crm.panigale.tech/api/integrations/google/callback`

Configure these Worker values. `GOOGLE_OAUTH_CLIENT_SECRET` and `CRM_INTEGRATION_ENCRYPTION_KEY` must be Cloudflare secrets. The encryption key is 32 random bytes encoded as 64 hexadecimal characters; do not commit it or reuse the Panigale Auth or PaniPay keys.

- `GOOGLE_OAUTH_CLIENT_ID`
- Secret `GOOGLE_OAUTH_CLIENT_SECRET`
- Secret `CRM_INTEGRATION_ENCRYPTION_KEY`

The requested Google scopes are `openid`, `email`, `profile`, Gmail read-only, and Calendar event read/write. Google may require OAuth consent-screen setup and review before external users can grant Gmail access. No Google account is connected until its owner completes consent.

## Mailbox boundaries and retention

- Personal mailbox messages are tagged with their CRM owner and returned only to that owner.
- A shared Gmail address can be active in only one business unit per tenant. OAuth completion checks this and D1 insert/update triggers enforce it under concurrent requests. Messages are scoped to that unit; only users assigned there can read them. Unit managers and CRM superadmins manage the connection and retention setting. Cross-unit sharing requires a separately designed, explicit superadmin grant with audit coverage; reconnecting the same address in multiple units is not a sharing mechanism.
- Inbox page reads are audit logged with the unit, result count, pagination offset, and mailbox scopes involved. Search terms, addresses, subjects, and message bodies are not copied into the audit event.
- Gmail is read-only. New connections queue a full mailbox history import, then periodic Gmail history checks. Message bodies are stored in CRM D1; attachments up to 25 MB each are copied into the CRM R2 bucket.
- The first history import never auto-replies to or routes old mail. Only eligible inbox messages received at or after the mailbox connection time can trigger shared-mail automation. The original Gmail history cursor is preserved through import so mail arriving during the backfill is picked up by incremental sync.
- Disconnecting a mailbox requests Google grant revocation, immediately clears its encrypted Google tokens, and cancels pending sync work. Imported content is purged after the manager-set retention period. The Worker cron removes R2 objects before deleting their D1 references. If Google cannot confirm revocation, the CRM still disables its local connection and tells the user to remove the grant in Google Account security settings.
- CRM Calendar reads a bounded event range. Create and update require an explicit review confirmation in the CRM and are recorded in the audit log.

## Inbound shared-mail routing

- Shared inbox routing is off by default and configured by a unit manager or CRM superadmin.
- For an eligible new message, the CRM matches the sender's exact email address within the same unit. A single active contact or company match is linked to the message and its active owner is notified if they have unit access. Ambiguous matches are left unlinked and routed to the configured fallback teammate, who must also have active unit access.
- The internal notification contains the sender and subject and directs the teammate to review the shared inbox. It does not forward the message body or attachments. Personal Gmail messages are never routed to another teammate.
- Notifications use the internal outbox, idempotency keys, delivery retries, and the same company mail gateway. Routing settings and the fallback recipient are audit logged.

## Client email rules

- Automatic acknowledgements are off by default and configured per business unit by its manager.
- When enabled, only a plain receipt acknowledgement is queued to the original sender from a shared company mailbox. Personal Gmail connections never trigger automatic client email. Mailing-list and automated messages are excluded.
- Substantive client emails enter the approval queue. The author or a unit manager may approve or reject; approvals create an idempotent delivery outbox entry.
- Delivery remains disabled until a company mail-server adapter and its Cloudflare credentials are configured. Approval does not send mail by itself.

## Remaining rollout work

Before enabling Google connections, set the three Google OAuth values above and verify the registered callback URL. For sending, configure a private Cloudflare Worker Service Binding named `CRM_MAILER` to the company mail gateway, then set `CRM_EMAIL_SEND_ENABLED=true` only after its sender identities and domain verification are ready. The gateway contract is `POST /send` with `{tenantId,unitId,to,subject,text}`, an `Idempotency-Key` header, and a JSON response containing `messageId`; it owns the server-specific SMTP/API credentials. The CRM retries transient delivery failures with a bounded backoff and keeps recipient and message contents out of logs. Keep Google/Gmail and company mail-server credentials separate. Run a retention drill against a test unit before selecting the final production retention period.

Before applying migration `0014_shared_mailbox_unit_guard.sql` to an existing database, run this read-only audit for active shared mailbox addresses assigned to multiple units within the same tenant:

```sql
SELECT tenant_id, lower(email) AS email, COUNT(DISTINCT unit_id) AS unit_count
FROM crm_google_connections
WHERE connection_scope='shared' AND status='active'
GROUP BY tenant_id, lower(email)
HAVING COUNT(DISTINCT unit_id)>1;
```

Resolve any returned rows through an approved owner/superadmin review before relying on the one-unit invariant; do not delete imported messages or connection data as an automatic migration step.
