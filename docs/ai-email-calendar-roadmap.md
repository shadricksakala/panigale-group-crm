# CRM AI, reminders, email, and calendar plan

## Product intent

Make the CRM a lively, useful relationship workspace for Panigale Group companies. It should help a teammate remember who needs attention, understand recent client communication, prepare the next step, and coordinate work across authorized business units. It links to PaniPay and other group platforms; it does not replace them.

The broader consulting lifecycle, MVP modules, later operational extensions, and internal SaaS direction are in [the product roadmap](product-roadmap.md). This document focuses on the AI, reminders, Gmail, Calendar, and email delivery slice of that roadmap.

The CRM remains private by business unit by default. Personal mailbox data is private to the connecting user. A shared mailbox belongs to one tenant and one business unit. Cross-unit sharing is not implemented; it would require a separately designed CRM superadmin grant and an audit event. Never trust tenant, unit, role, or user IDs supplied by the browser as authority.

## PaniPay AI as a starting point

The inspected PaniPay implementation is its in-app Support assistant (`components/support-assistant.tsx` and `app/api/organizations/support-assistant/route.ts`). It uses Cloudflare Workers AI with an environment-selected model, verifies organization membership on the server, builds permission-filtered context, limits requests per user and organization, bounds the message history, rejects likely secrets and private-data requests, validates the response, and disables AI Gateway caching and prompt logs. Saved conversations are private to the signed-in user and organization. Its prompt is intentionally read-only and does not execute product actions.

Carry those engineering safeguards into the CRM, but use the CRM relationship assistant as the product starting point. The CRM implementation in `app/api/ai/assistant/route.ts` and `lib/server/crm-ai.mjs` already scopes context to an authorized business unit, limits usage, stores per-user/per-unit history, filters secrets, and returns proposed tasks or notes for human confirmation. Extend that foundation for relationship summaries, meeting briefs, and email follow-up drafts. Never reuse PaniPay's payment-support prompt or expose payment-system data in CRM context. Imported emails and CRM notes remain untrusted input; every data lookup must be re-authorized server-side for the current user and unit. Keep the production feature flag off until model configuration, privacy behavior, and release checks are verified.

## Feature plan

### 1. Relationship assistant

- Answer questions about a selected business unit's contacts, companies, leads, activities, projects, and recent authorized email.
- Summarize a client or lead timeline and prepare a meeting brief with source records and dates.
- Suggest follow-ups, reminders, tasks, or notes. Suggestions remain drafts until a user confirms them.
- Later: draft proposal outlines, meeting summaries, and client replies. Client-facing drafts must enter the existing review queue; AI must never send them directly.
- Keep every query scoped server-side to the current user's unit access, financial permission, and personal/shared mailbox visibility. Treat email bodies and CRM notes as untrusted data, filter secrets, bound context, rate-limit, and do not log prompts.

### 2. Reminders and follow-up workflow

- Use CRM activities as the reminder source of truth: owner, due time, related record, priority, and completion state.
- Surface due today, overdue, and upcoming items in the dashboard, mobile view, and reminder panel.
- Allow users to set personal reminders; managers may assign unit work where their role permits.
- Send optional internal reminders through a notification adapter (email first, later other channels), with per-user opt-in, an editable IANA time zone, local morning delivery, deduplication, retries, and an audit trail.
- AI may propose a reminder from a communication; the recipient and due date must be shown and confirmed before creation.

### 3. Personal Gmail connections

- Each user connects their own Google account through OAuth consent. Read-only Gmail access is used to bring relevant communication into the CRM and link it to CRM records.
- The mailbox owner alone sees personal mailbox content. Other unit members can see a CRM activity the owner deliberately shares, without gaining access to the Gmail account.
- Provide sync status, disconnect/revoke, retention controls, and deletion of imported content after retention expires.
- Do not request Gmail send scope for personal accounts as part of the first release.

### 4. Shared/group Gmail monitoring

- A unit manager or CRM superadmin connects an approved shared company mailbox and assigns it to exactly one business unit.
- Unit members with explicit unit access can review its communication. Record who connected it, who changed settings, and who accessed or exported sensitive content.
- Detect likely client/contact/lead matches and offer them for review; preserve an unlinked inbox for uncertain matches.
- Configure mailbox-specific retention, sync state, monitored labels/folders where supported, and alert preferences.
- A shared mailbox connection does not grant broader tenant access or authorize cross-unit sharing.

### 5. Calendar

- Let a user connect Google Calendar and view a bounded date range of events relevant to their work.
- Offer CRM record links and meeting preparation summaries using only records the user can access.
- Event create/update must show a review step and write an audit event. Keep calendar access distinct from Gmail mailbox sharing.
- Later, consider shared calendars only after the same unit ownership and consent model is defined.

### 6. Email sending and approvals

- Keep inbound monitoring and outbound delivery as separate permissions and settings.
- Optional automatic replies may send only a plain receipt acknowledgement to the original sender from a shared company mailbox, after the unit manager enables the feature. Personal Gmail connections never trigger automatic client email. Exclude mailing lists, bounce addresses, and automated/system messages; enforce loop prevention, rate limits, and idempotency.
- For shared inboxes, optionally link a message only when the sender's exact address maps to one active contact/company, then notify its owner. Ambiguous or unmatched messages use the unit manager-configured fallback teammate and stay unlinked. The notification identifies the sender and subject and directs staff to the shared inbox without forwarding message contents. Personal mailbox data is never routed to colleagues.
- Any substantive client email requires an approval before delivery. Show recipient, subject, full body, sender mailbox, related CRM record, and approval history. The author or authorized manager can approve/reject according to the configured policy.
- Internal emails (for example, reminders) use separate templates, recipient resolution, and settings. “Send to the right recipient” must resolve from an assigned owner/manager or explicit CRM relationship, show the resolved recipient, and avoid guessed addresses.
- Start with the company mail-server adapter behind a private service binding. Keep provider credentials out of the CRM database, browser, logs, and source. Later support the user's email server through the same adapter contract rather than coupling CRM workflows to one provider.
- Sending stays disabled until sender-domain verification, adapter credentials, approval UX, audit, idempotency, and delivery health checks pass.

## Delivery sequence

1. **Policy and data boundaries:** confirm mailbox consent, record/data classification, unit access matrix, retention periods, user notification preferences, and audit events. Keep personal Gmail private to its owner and assign each shared mailbox to one unit. Treat cross-unit sharing as a separate future feature requiring an explicit superadmin grant model. Review existing migrations/endpoints and preserve the production D1 data.
2. **CRM assistant and reminders:** improve the existing unit-scoped assistant for relationship questions, timeline summaries, and follow-up suggestions; ship due/overdue reminders and user time-zone preferences. Every task/note/reminder suggestion stays a draft until confirmed. Add source links/dates to summaries and never let the model trigger writes or sends.
3. **Personal Gmail and Calendar:** verify OAuth consent, least-privilege scopes, encrypted token storage, sync status, disconnect/revoke, retention purge, and owner-only mailbox access in non-production. Add bounded calendar views and reviewed event changes with audit records.
4. **Shared inbox operations:** let authorized managers connect a group mailbox to one unit, set monitored scope/retention, review matched and unmatched mail, and route a shared message to a uniquely matched record owner or configured unit fallback. Keep internal notifications minimal and audited.
5. **Internal email and reminders:** connect the company mail-server adapter for opted-in CRM reminders. Resolve recipients only from an assigned CRM owner/manager or explicit relationship, show the resolved destination, deduplicate deliveries, and record delivery outcomes.
6. **Client email controls:** when enabled by an authorized manager, allow a plain receipt acknowledgement to the original sender from a shared mailbox, with loop and auto-generated-message protections. Require human approval for every substantive client email; show recipient, sender mailbox, subject, full body, related record, and approver. AI may draft but cannot approve or send.
7. **Production readiness and staged rollout:** configure secrets/bindings, backup/restore and retention drills, monitoring/alerts, mobile checks, unit/tenant isolation checks, rollback, and health verification. Enable each integration per unit/feature flag only after its checks pass; keep the PaniPay CRM as rollback until the standalone deployment is verified.

## PaniPay patterns to reuse

- Use the Cloudflare Workers AI binding and model setting from the server environment; never put model credentials in browser code.
- Authenticate and authorize before building prompt context. Query only the active tenant/unit and the current user's permitted mailbox scope.
- Rate-limit by tenant and user; bound request size, history, retrieved rows, and output length.
- Treat imported email, notes, and CRM fields as untrusted prompt content. Do not follow instructions embedded in them.
- Filter credentials from input/context/output, disable AI Gateway caching and prompt collection, and log only error class/request metadata.
- Keep the assistant read-only. Parse structured suggestions against known CRM record IDs and allowlist fields; require a user confirmation endpoint for each write.
- Provide a clear unavailable response if inference is disabled or fails. AI must not block the CRM's ordinary reminder, mail, or calendar workflows.

## Initial acceptance checks

- A user cannot retrieve another tenant's or unauthorized unit's records, messages, conversations, or suggestions by changing request IDs.
- Personal Gmail content is visible only to its owner; shared inbox content is limited to members of its assigned unit.
- AI summaries cite CRM records/messages and dates, distinguish known facts from suggestions, and do not invent missing details.
- AI-generated notes, tasks, reminders, calendar changes, and client messages remain unsaved/unsent until a user completes the relevant confirmation or approval flow.
- Internal reminders honor opt-in, configured time zone, recipient rules, deduplication, and retry behavior.
- Automatic receipt responses are disabled by default and limited to eligible shared-mailbox messages; substantive client email always awaits approval.
- OAuth disconnect, retention expiry, audit logging, provider failure, and rollback behavior are verified before enabling production integrations.

## Release gates and operating rules

- Production feature flags remain off until each dependency is configured and verified.
- No migration or import treats current production D1 data as disposable. Back up before migration and rehearse restoration in a non-production environment.
- Monitor OAuth failures, sync lag/errors, revoked grants, reminder queue age, delivery failures, approval latency, AI errors/rate limits, and unauthorized access denials. Logs contain identifiers and error classes only, never tokens or message bodies.
- Test tenant and unit isolation with at least two tenants, two units, personal and shared mailboxes, unauthorized IDs, disconnect/revoke, retention purge, and delivery retries.
- Roll out by feature flag and business unit. Preserve the PaniPay-hosted CRM as rollback until the standalone production checks pass.

## Current implementation snapshot

The repository already contains an initial CRM assistant, reminder/activity foundation, Google OAuth integration, Gmail read/sync, Calendar APIs, shared and personal mailbox scopes, retention cleanup, automatic receipt settings (off by default), client-email drafts/approval, and an outbound mail service-binding adapter. The dedicated Worker and custom domain are deployed; on 2026-11-16 the health endpoint returned `ok`, the OIDC redirect reached Panigale Auth, unauthenticated CRM context returned 401, and the owner confirmed sign-in. The current deployment keeps AI and outbound email disabled. Google OAuth secrets and the company mail service binding still need configuration before those features can be enabled. Before client sending is enabled, complete the mail gateway's verified sender identity contract and show the exact sender in the approval flow; Google connections remain read-only.
