# Panigale Group CRM

Dedicated source repository and workspace for the Panigale Group relationship CRM. The planned production address is **https://crm.panigale.tech**.

The CRM provides tenant and business-unit scoped contacts, leads, activities, projects, proposals, invoice tracking, memberships, and audit events. This repository is the canonical home for CRM implementation. Other Panigale project repositories remain accessible as integration references; do not copy unrelated products into this repository.

## Current state

This repository contains the extracted first CRM implementation. The existing deployment is still hosted at `https://panipay.panigale.tech/crm` until the independent app is ready. Keep that deployment intact during development and cut over to `crm.panigale.tech` only after the standalone identity, data, runtime, and production checks are complete.

## Source workspace access

The dedicated CRM repo is the workspace for CRM changes. Related source repositories remain available in the shared local workspace:

- PaniPay: `C:\Users\WINDOWS1\GitHub\PaniPay\work\panipay` — existing CRM, authentication, SSO, D1, and deployment integration reference.
- EUROZA: `C:\Users\WINDOWS1\GitHub\EuroZambia` — consultancy integration and group context.
- PaniPay product source and other group projects can be inspected when a connector is needed; make changes in their own repositories only when that product's source must change.

Keep integration contracts explicit and avoid coupling the new CRM deployment to arbitrary files in another checkout. The independent runtime must not assume those local folders exist in production.

## Current integration dependencies

The extracted routes still use PaniPay infrastructure:

- PaniPay `pp_session` authentication and user model.
- PaniPay D1 binding `DB`, including shared `users` and `platform_staff` tables.
- PaniPay CSRF and trusted-origin configuration.
- PaniPay Cloudflare/Next runtime and API helpers.

This source snapshot is not independently deployable yet. Before serving `crm.panigale.tech`, define the identity/SSO boundary, tenant authorization, database ownership and migrations, runtime bindings, secrets, backups, and restore procedure. Do not expose CRM endpoints or point a new deployment at production data before those controls are ready.

## Data access model

CRM data is tenant-scoped and business-unit scoped. Cross-unit access requires explicit CRM superadmin authorization. PaniPay merchant-organization memberships do not grant CRM access. SaaS tenant onboarding must be opt-in and must not share records across tenants.

## Contents

- `app/crm/page.tsx` — CRM interface.
- `app/api/crm/` — current API route handlers, still coupled to PaniPay authentication/runtime.
- `lib/server/crm.mjs` — CRM tenant, access, and resource logic.
- `drizzle/0044_panigale_crm.sql` — initial CRM schema, already applied to PaniPay production D1 during the first implementation.

See [HANDOFF.md](HANDOFF.md) for the continuation prompt and migration checklist.
