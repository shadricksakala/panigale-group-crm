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

## Standalone runtime

The standalone runtime uses React 19, Next-compatible routes on Vinext/Vite, and Cloudflare Workers, following the PaniPay application stack. Authentication is an OIDC client integration with Panigale Auth; credentials and identity lifecycle stay in that provider. The CRM verifies ID tokens and owns only its app session, tenant memberships, relationship data, and audit trail. The CRM does not bind to the PaniPay D1 database or read PaniPay identity tables.

### Panigale Auth contract

The CRM is a public OIDC client using authorization code with PKCE S256; it does not use a client secret. Register the exact callback URL `https://crm.panigale.tech/api/auth/callback` in Panigale Auth and configure the resulting client ID as `PANIGALE_AUTH_CLIENT_ID`. The CRM uses these issuer endpoints directly:

- `GET /api/oidc/authorize` with `openid profile email`, `state`, `nonce`, and an S256 challenge.
- `POST /api/oidc/token` with the one-time code, exact callback URL, and PKCE verifier.
- `GET /api/oidc/jwks` to verify the RS256 signature.

The CRM requires an ID token with `token_use=id`, the exact issuer and client audience, a valid time window, the login nonce, a stable `sub`, and `email_verified=true`. It then creates its own 14-day CRM session; Panigale Auth cookies are never shared with the CRM. CRM membership and unit access are provisioned separately and do not follow automatically from an Auth account. Identity sign-in and email delivery still require the Panigale Auth staging flow to pass its own release checks.

## Local setup

1. Install Node 22.13 or newer and dependencies with `npm ci`.
2. Create a local D1 database and apply the CRM migrations with `npm run db:apply:local`.
3. Create `.dev.vars` (ignored by Git) with `CRM_PUBLIC_URL=http://localhost:5173`, `AUTH_ISSUER=https://auth.panigale.tech`, `PANIGALE_AUTH_CLIENT_ID=<registered-client-id>`, and `CRM_BOOTSTRAP_OWNER_EMAIL=<verified-admin-email>`.
4. Register `http://localhost:5173/api/auth/callback` in Panigale Auth and run `npm run dev`.

The first successful login by the configured bootstrap owner claims the one-time CRM bootstrap and seeds the Panigale Group tenant, units, and default pipeline stages. Remove the bootstrap secret after it has been claimed. Other accounts must sign in once, then receive explicit unit access from a CRM superadmin.

## Production provisioning and release

The checked-in `wrangler.production.jsonc` intentionally has an all-zero D1 database ID. Before deployment, provision the dedicated D1 database and R2 document bucket, put the actual D1 ID in the Worker config, configure the Panigale Auth client with `https://crm.panigale.tech/api/auth/callback`, and set `PANIGALE_AUTH_CLIENT_ID` and the temporary `CRM_BOOTSTRAP_OWNER_EMAIL` with Cloudflare Worker secrets. Never put secret values in Wrangler vars, source, or Git. The CRM does not bind to PaniPay `DB` or read its user tables.

Back up D1 before every production migration. Use Cloudflare D1 point-in-time recovery or an encrypted D1 export stored outside the Worker deployment, and retain a separate R2 backup of `panigale-group-crm-documents-production`. Restore rehearsal and identity, authorization, CRUD, document, mobile, health, and unit-isolation checks must pass in a non-production environment before exposing the custom domain. Keep `https://panipay.panigale.tech/crm` available until a deliberate cutover has passed the full checklist. No DNS change, old CRM removal, or data migration is part of local setup.

### Required release checks

- Panigale Auth login, callback, logout, session expiry, and denied/unverified identity behavior.
- Unit grants, cross-unit/tenant denial, financial-field restrictions, and append-only access audit events.
- Contacts, companies, opportunities, projects, tasks, proposals/version history, invoices/payments, document upload/download, and archive behavior.
- Responsive desktop/mobile UI and `/api/health` against the deployed Worker.
- Confirm D1 and R2 backups can be restored before changing DNS.

## Data access model

CRM data is tenant-scoped and business-unit scoped. Cross-unit access requires explicit CRM superadmin authorization. PaniPay merchant-organization memberships do not grant CRM access. SaaS tenant onboarding must be opt-in and must not share records across tenants.

## Contents

- `app/crm/page.tsx` — CRM interface.
- `app/api/crm/` — tenant and unit scoped CRM API handlers.
- `lib/server/crm.mjs` — CRM tenant, access, and resource logic.
- `crm-migrations/` — standalone CRM database migrations. `drizzle/0044_panigale_crm.sql` is retained as historical PaniPay deployment context and is not used by the standalone app.

See [HANDOFF.md](HANDOFF.md) for the continuation prompt and migration checklist.
