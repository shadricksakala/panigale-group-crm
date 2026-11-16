# Panigale Group CRM product roadmap

**Internal planning document.** Based on the private Gmail note “Note to Self — Full Internal Consulting CRM Concept, Architecture & Roadmap” dated November 9, 2026, adapted for Panigale Group business units and the canonical CRM repository.

## Product direction

Build a relationship CRM and consulting operations workspace for Panigale Group companies. Support the consulting lifecycle:

**Lead → qualification → consultation → proposal/quotation → contract → engagement → delivery → invoice/collection → retention or expansion.**

Panigale Group business units are the initial operating context. The CRM is a shared platform for authorized Group teams, while each business unit's records remain private to that unit by default. A future SaaS foundation can support independent CRM tenants, each with its own users, data, configuration, branding, permissions, and feature access. Euroza is a useful consulting workflow reference and possible early user; it does not get exclusive ownership or rights by default.

The CRM links to product systems such as PaniPay for transactions and collections. It should not replace those systems or imply a payment is collected until the source platform confirms it.

## Core workflow and first product scope

1. **Companies and contacts:** organization and individual profiles, multiple contacts per company, industry/segment, owner, status, notes, timeline, files, search, filters, and duplicate review.
2. **Leads and pipeline:** source, qualification, configurable stages, owner, expected value and close date, next action, won/lost outcomes, and conversion into a client engagement.
3. **Projects and delivery:** engagements linked to clients and won opportunities, scope, assigned consultants, milestones, deliverables, due dates, progress, risks, and activity history.
4. **Tasks and reminders:** owner, priority, due date, project or client link, completion status, personal reminders, and manager oversight.
5. **Proposals and quotations:** templates, scope and pricing, version history, draft/sent/accepted/rejected status, professional export, and conversion into an engagement after acceptance.
6. **Document management:** client and project files, contracts, reports, deliverables and proposals, with access controls and version labels.
7. **Invoices and collection tracking:** invoice records, due dates, manual reconciliation where needed, outstanding and aging views, receipts, and payment status verified through linked payment platforms such as PaniPay.
8. **Dashboard and reporting:** pipeline by stage, active clients and engagements, overdue work, upcoming reminders, invoices outstanding, and collected revenue subject to financial permissions.

The first end-to-end acceptance workflow is: create a lead, qualify and convert it, prepare and approve a proposal, record acceptance, create and deliver the engagement, issue an invoice, record a verified payment, then see the full history in the dashboard.

## Delivery stages

### Stage 1 — Secure Group CRM foundation

- Preserve a clear tenant boundary for future independent organizations and explicit unit boundaries inside the Panigale Group tenant.
- Continue server-side authorization, audit records, least-privilege user roles, and financial visibility controls.
- Define the roles in product terms: CRM superadmin, unit manager, and unit member; map consultant, finance, and viewer capabilities through specific permissions instead of broad cross-unit access.
- Complete and verify the responsive core workflow above. Keep PaniPay, Gmail, Calendar, and mail-server connections behind isolated adapters and per-feature controls.
- Establish imports, observability, backup/restore, CI, staging, and release checks before expanding live data use.

### Stage 2 — Team operations and integrations

- Internal onboarding and project handoff workflows, reminders, document review, and follow-up automation.
- Personal Gmail and Calendar connections, with mailbox-owner privacy and reviewed event changes.
- Unit-owned shared inboxes, record matching, internal routing, and approved client-email sending as specified in [the AI, email, and calendar plan](ai-email-calendar-roadmap.md).
- Optional client portal for approved updates, milestones, shared deliverables, invoices, and requests.
- Consultation booking, contract lifecycle, signature and expiration workflow, timesheets, billable hours, utilization, expense capture, profitability, and richer financial reporting.
- Reusable engagement templates, SOPs, methodologies, research, and integrations with accounting, payment, and storage products.

### Stage 3 — Assisted consulting and insight

- AI-assisted proposal and scope drafts, meeting summaries, client reports, and search over approved client documents.
- Contextual recommendations with clear source records, permission checks, and human review.
- Lifecycle insights such as lead conversion, sales cycle, project margin, invoice collection, renewal risk, and client retention.
- Human approvals remain mandatory for sensitive lifecycle transitions and every substantive client email. AI suggestions do not execute transactions, change access, approve work, or send client messages.

## Product and data boundaries

- Enforce tenant and unit scope in server authorization and database queries. Never treat a browser-supplied tenant, unit, role, or user ID as proof of access.
- Each unit sees its own records by default. Cross-unit access requires an explicit CRM superadmin grant with audit history; no integration, group mailbox, or AI assistant should grant it implicitly.
- Distinguish CRM-owned relationship and workflow data from payment, identity, email, calendar, and accounting source systems. Keep each system authoritative for its own domain.
- Use configurable workflows, modules, feature access, branding, currency, and contact information rather than customer-specific product forks.
- Preserve data ownership, export/exit rights, retention settings, backup controls, and auditable administrative access as the SaaS foundation evolves.
- Keep commercialization, platform strategy, and proprietary architecture internal. Client-facing descriptions should focus on practical capabilities and phased delivery, and must not imply unsupported certifications or completed functionality.

## Current repository evidence

The migrations define tenant/unit-scoped tables for companies, contacts, leads, projects, activities, milestones, deliverables, proposals and proposal versions, documents, invoices, and payments. The repository also has CRM AI, reminder, Google integration, and PaniPay invoice integration code. This is evidence of a data and code foundation only; it does not prove every user workflow, release gate, production configuration, or integration is complete or enabled. Track each capability as implemented, verified, enabled, or planned separately during delivery reviews.

## Success measures

- Lead-to-client conversion and proposal turnaround.
- Engagement delivery against milestones and due dates.
- Overdue task reduction and timely follow-up.
- Invoice collection time and outstanding balance visibility.
- Client retention, expansion, and team adoption.
- Zero unauthorized cross-tenant or cross-unit data access.

## Planning note

The source email is a private strategic note, not a client brief or a statement of delivered functionality. Use it to guide prioritization and internal architecture; do not forward it or present its commercialization details externally without an explicit review.
