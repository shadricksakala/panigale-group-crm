# Panigale Group CRM — Product direction

Internal product brief adapted from the Consulting CRM concept note in Gmail (9 November 2026). This is a product direction, not a claim that the features below are implemented.

## Product intent

Build a relationship CRM for Panigale Group businesses. It follows relationships and work across the lifecycle—lead, qualification, proposal, engagement, delivery, invoice tracking, retention—while linking out to the group’s product systems instead of replacing them. The initial deployment serves group companies; the data model should leave room for separately provisioned SaaS workspaces later.

## Workspace and access model

- The workspace contains business units such as PaniPay, Euroza Consultancy, FutureCampus, and other Panigale platforms.
- Every CRM record belongs to one tenant and one business unit. Users see only units they are explicitly assigned to.
- Cross-unit sharing is off by default. A CRM superadmin can explicitly authorize it, with the grant and access recorded in the audit trail.
- Organization admins manage their own workspace. Platform operations should not imply routine access to customer records.
- The interface keeps the current workspace and business unit visible in a persistent switcher; switching units changes the record scope.
- Product links open the authoritative product system. CRM stores relationship context and references, not payment, education, investment, or other product transactions.

## MVP modules

1. **Overview and reports** — Unit-scoped pipeline, active relationships, ongoing engagements, tasks due, outstanding invoice records, and recent activity. Include report filters and export later in MVP if needed.
2. **Companies and contacts** — Organization and person profiles, multiple contacts per organization, segment/industry, relationship status, owner, notes, activity history, attachments, search, filters, and duplicate warnings.
3. **Leads and opportunities** — Manual entry and CSV import, source attribution, configurable stages, qualification notes, expected value and close date, owner, next action, lost reason, and conversion into an engagement.
4. **Tasks and activities** — Calls, meetings, emails, notes, and assigned tasks with priority, due date, status, reminders, project context, and manager views.
5. **Engagements and projects** — Scope, client, source opportunity, assigned team, deadlines, milestones, deliverables, progress, risks, and client activity history.
6. **Proposals and quotations** — Reusable templates, scope and price, version history, draft/sent/accepted/rejected states, approval trail, PDF export, and conversion of accepted work into an engagement.
7. **Documents** — Client and engagement folders for proposals, agreements, reports, and deliverables; permission checks follow the record’s tenant and unit; retain version and access history.
8. **Invoice tracking** — Invoice records, due dates, amounts, status, manual payment reconciliation and receipt reference, outstanding balance and aging. Link PaniPay invoices/payment pages where applicable; do not recreate payment processing in CRM.

### MVP workflow acceptance path

Within one authorized business unit, a user can add a lead, qualify it, record an opportunity, issue and accept a proposal, create an engagement, track tasks and deliverables, record an invoice and its payment status, then review the complete history and dashboard totals. Every step remains unit-scoped and produces an audit event for sensitive access or changes.

### Roles for first release

- **CRM superadmin:** tenant setup and membership administration; explicit unit access and cross-unit sharing grants.
- **Unit manager:** manage that unit’s people, pipeline, work, and team access within granted permissions.
- **Consultant/member:** work with records in assigned units; financial and document permissions can be narrower than general CRM access.

Keep authorization server-side on every operation. Never accept tenant, user, unit, or role claims as authority from request payloads; derive identity from the verified session and scope access from persisted grants.

## Later phases

**Operations:** secure client portal, onboarding and follow-up automations, approvals, email and calendar history, optional WhatsApp/SMS notifications, booking, contract lifecycle, timesheets, utilization, expense capture, project profitability, reusable playbooks, and accounting/storage integrations.

**Intelligence:** human-reviewed proposal and scope drafts, meeting summaries, search over approved documents, pipeline and retention insights, margin forecasting, configurable sector workflows, and optional branded client experiences. AI actions require review and must respect the same record permissions as the user.

## Technical direction

- Follow the PaniPay application stack already present in the source workspace: React 19 and Next-compatible app routes on Vinext/Vite, deployed to Cloudflare Workers with the Node compatibility flag; Tailwind CSS 4 for UI.
- Preserve the existing API/resource behavior while extracting PaniPay coupling behind explicit adapters. Keep CRM routes and UI native to this repository.
- Use a CRM-owned D1 database and migration history for the standalone deployment. Do not point the new app at the PaniPay production database or rely on local checkout paths. Treat any data migration as a separately backed-up, reconciled operation.
- Use Panigale Auth as the identity provider: OIDC authorization code with PKCE, verified RS256 ID tokens/JWKS, issuer/audience/expiry/nonce validation, and stable issuer/subject identity. Store CRM sessions and app memberships in CRM-owned storage. Do not use PaniPay cookies across unrelated hosts or trust caller-supplied user/tenant IDs.
- Keep secrets in Cloudflare secret bindings, configuration in environment-specific Wrangler files, mutations behind origin/CSRF checks, and production observability enabled with sensitive fields redacted.
- Establish automated tenant/unit-isolation checks, staging, D1 backup/restore rehearsal, health endpoint, migration review, and rollback before production cutover. Preserve the existing PaniPay-hosted CRM until the new host passes the release checks.

## Visual direction

Use a lively, polished B2B workspace inspired by the PaniPay product visuals: crisp white surfaces, deep navy structure, confident cobalt actions, teal and warm gold accents, friendly illustrations and data graphics, and rounded but restrained cards. Keep navigation and business-unit context obvious on desktop; use compact, thumb-friendly bottom navigation and full-screen drawers on mobile. Keep screens useful and data-dense, with bright accents supporting the CRM work rather than overwhelming it.

## Measures of success

- Lead-to-client conversion and proposal turnaround
- Engagement milestone completion and overdue task rate
- Invoice collection time and outstanding balance
- Monthly active users by business unit and workspace retention
- Zero unauthorized cross-tenant or cross-unit record access

## Source note

Derived from the internal Gmail note “Note to Self — Full Internal Consulting CRM Concept, Architecture & Roadmap” and the attached “Euroza Consultancy — Consulting CRM Concept and Phased Rollout” email. The internal note explicitly distinguishes proposed scope from delivered functionality; preserve that distinction in product and client-facing material.
