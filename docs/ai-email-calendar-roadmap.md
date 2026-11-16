# CRM AI, reminders, email, and calendar plan

## Product intent

Make the CRM a lively, useful relationship workspace for Panigale Group companies. It should help a teammate remember who needs attention, understand recent client communication, prepare the next step, and coordinate work across authorized business units. It links to PaniPay and other group platforms; it does not replace them.

The CRM remains private by business unit by default. Personal mailbox data is private to the connecting user. A shared mailbox belongs to one tenant and one business unit. Cross-unit visibility requires an explicit CRM superadmin grant and an audit event. Never trust tenant, unit, role, or user IDs supplied by the browser as authority.

## PaniPay AI as a starting point

PaniPay has two useful patterns to carry forward:

- **Support assistant:** Cloudflare Workers AI, an environment-selected model, concise product guidance, permission-filtered context, private per-user/per-organization conversations, bounded message history, rate limits, sensitive-output checks, and no prompt logging or caching.
- **Shop assistant:** a small context-limited assistant that treats catalog data as untrusted input, does not claim to perform transactions, and returns a safe non-AI response when inference is unavailable.

The CRM already follows these patterns in `app/api/ai/assistant/route.ts` and `lib/server/crm-ai.mjs`: Cloudflare Workers AI, selected-unit CRM context, a 12-request hourly limit, private conversation history, secret filtering, and human-confirmed task/note suggestions. Recent authorized email can inform summaries and follow-ups. Keep the current production feature flag off until the AI configuration and release checks are ready.

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
- Send optional internal reminders through a notification adapter (email first, later other channels), with per-user preferences, quiet hours, deduplication, retries, and an audit trail.
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
- For shared inboxes, optionally notify the active owner of an exact sender-matched contact/company; otherwise use a unit manager-configured fallback teammate. The notification identifies the sender and subject and links staff back to the shared inbox without forwarding message contents. Personal mailbox data is never routed to colleagues.
- Any substantive client email requires an approval before delivery. Show recipient, subject, full body, sender mailbox, related CRM record, and approval history. The author or authorized manager can approve/reject according to the configured policy.
- Internal emails (for example, reminders) use separate templates, recipient resolution, and settings. “Send to the right recipient” must resolve from an assigned owner/manager or explicit CRM relationship, show the resolved recipient, and avoid guessed addresses.
- Start with the company mail-server adapter behind a private service binding. Keep provider credentials out of the CRM database, browser, logs, and source. Later support the user's email server through the same adapter contract rather than coupling CRM workflows to one provider.
- Sending stays disabled until sender-domain verification, adapter credentials, approval UX, audit, idempotency, and delivery health checks pass.

## Delivery sequence

1. **Foundation and review:** confirm data classification, consent copy, access matrix, retention periods, notification preferences, and audit events. Review existing migrations and endpoints before enabling integrations.
2. **Internal CRM usefulness:** ship due/overdue reminders, personal task preferences, and the permission-scoped assistant for CRM records. Keep all AI-generated changes confirm-before-save.
3. **Personal Google connections:** validate OAuth consent, encrypted token storage, sync progress/errors, revoke, retention purge, and personal mailbox isolation in a non-production environment.
4. **Unit shared inbox:** add manager setup, shared inbox review, record matching, unit-scoped access, retention controls, and audit visibility.
5. **Calendar workflow:** complete mobile event views and confirmed create/update with permission and audit checks.
6. **Outbound email:** configure the mail-server adapter, internal reminders, automatic receipt acknowledgements, then the human approval queue for client emails. Keep substantive client mail approval mandatory.
7. **Controlled AI expansion:** add meeting briefs and reviewed draft generation, evaluate output quality and source attribution, then consider automation only with explicit policies and kill switches.
8. **Production readiness:** configure secrets and bindings, backup/restore and retention drills, monitoring/alerts, mobile checks, access-isolation checks, rollback, and health verification before enabling flags or cutting over production.

## Release gates and operating rules

- Production feature flags remain off until each dependency is configured and verified.
- No migration or import treats current production D1 data as disposable. Back up before migration and rehearse restoration in a non-production environment.
- Monitor OAuth failures, sync lag/errors, revoked grants, reminder queue age, delivery failures, approval latency, AI errors/rate limits, and unauthorized access denials. Logs contain identifiers and error classes only, never tokens or message bodies.
- Test tenant and unit isolation with at least two tenants, two units, personal and shared mailboxes, unauthorized IDs, disconnect/revoke, retention purge, and delivery retries.
- Roll out by feature flag and business unit. Preserve the PaniPay-hosted CRM as rollback until the standalone production checks pass.

## Current implementation snapshot

The repository already contains an initial CRM assistant, reminder/activity foundation, Google OAuth integration, Gmail read/sync, Calendar APIs, shared and personal mailbox scopes, retention cleanup, automatic receipt settings (off by default), client-email drafts/approval, and an outbound mail service-binding adapter. This document is the staged product/release plan; these features are not necessarily production-enabled. In particular, AI and outbound email are configured off, and production DNS/health and required Google/mail bindings still need verification before release.
