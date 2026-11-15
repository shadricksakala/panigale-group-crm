# Panigale Group CRM

Standalone source repository for the Panigale Group relationship CRM. The CRM provides tenant and business-unit scoped contacts, leads, activities, projects, proposals, invoice tracking, memberships, and audit events.

## Current state

This is an extraction of the first CRM implementation from the PaniPay repository. The live CRM remains available at `https://panipay.panigale.tech/crm` while the standalone application is prepared. This repository is the intended home for further development; do not remove the live PaniPay implementation until authentication, database ownership, and deployment have been migrated and verified.

## Important integration dependencies

The extracted routes currently use PaniPay infrastructure:

- PaniPay `pp_session` authentication and the PaniPay user model.
- PaniPay D1 database binding `DB`, including shared `users` and `platform_staff` tables.
- PaniPay CSRF and trusted-origin configuration.
- PaniPay's Cloudflare/Next runtime and API helpers.

As a result, this source snapshot is not an independently deployable SaaS app yet. Do not point an independent deployment at production data or expose CRM endpoints until an explicit identity provider, tenant authorization policy, database/migrations strategy, secrets, and backup/restore procedure have been designed.

## Data access model

CRM data is tenant-scoped and business-unit scoped. Cross-unit access is granted explicitly by CRM superadmins. PaniPay merchant-organization memberships do not grant CRM access. SaaS tenant onboarding should be opt-in and must not share records across tenants.

## Contents

- `app/crm/page.tsx` — CRM interface.
- `app/api/crm/` — current API route handlers, still coupled to PaniPay authentication/runtime.
- `lib/server/crm.mjs` — CRM tenant, access, and resource logic.
- `drizzle/0044_panigale_crm.sql` — initial CRM schema, applied to PaniPay production D1 during the first implementation.

See [HANDOFF.md](HANDOFF.md) for the continuation prompt and migration checklist.
