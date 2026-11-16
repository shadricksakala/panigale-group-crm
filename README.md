# Panigale Group CRM

Dedicated source repository and workspace for the Panigale Group relationship CRM. Production is **https://crm.panigale.tech**.

The CRM provides tenant and business-unit scoped contacts, leads, activities, projects, proposals, invoice tracking, memberships, and audit events. This repository is the canonical home for CRM implementation. Other Panigale project repositories remain accessible as integration references; do not copy unrelated products into this repository.

## Current state

The standalone CRM is deployed at `https://crm.panigale.tech` on its own Cloudflare Worker, D1 database, and R2 document bucket. Sign-in uses Panigale Auth OIDC, and the owner confirmed a successful login. The existing PaniPay-hosted CRM at `https://panipay.panigale.tech/crm` remains the rollback path until the remaining integration, data recovery, mobile, and full isolation checks have passed and the cutover is deliberately closed out.

## Source workspace access

The dedicated CRM repo is the workspace for CRM changes. Related source repositories remain available in the shared local workspace:

- PaniPay: `C:\Users\WINDOWS1\GitHub\PaniPay\work\panipay` — existing CRM, authentication, SSO, D1, and deployment integration reference.
- EUROZA: `C:\Users\WINDOWS1\GitHub\EuroZambia` — consultancy integration and group context.
- PaniPay product source and other group projects can be inspected when a connector is needed; make changes in their own repositories only when that product's source must change.

Keep integration contracts explicit and avoid coupling the new CRM deployment to arbitrary files in another checkout. The independent runtime must not assume those local folders exist in production.

## Standalone runtime

The standalone runtime uses React 19, Next-compatible routes on Vinext/Vite, and Cloudflare Workers, following the PaniPay application stack. Authentication is an OIDC client integration with Panigale Auth; credentials and identity lifecycle stay in that provider. The CRM verifies ID tokens and owns only its app session, tenant memberships, relationship data, and audit trail. The CRM does not bind to the PaniPay D1 database or read PaniPay identity tables.

### Panigale Auth contract

The CRM is a public OIDC client using authorization code with PKCE S256; it does not use a client secret. Its active Panigale Auth app is `PANIPAY-CRM`, with the exact callback URL `https://crm.panigale.tech/api/auth/callback` and scopes `openid profile email`. The public client ID is configured as the non-secret `PANIGALE_AUTH_CLIENT_ID` Worker variable. The CRM uses these issuer endpoints directly:

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

The checked-in `wrangler.production.jsonc` points to the provisioned standalone D1 database `panigale-group-crm-production` and R2 bucket `panigale-group-crm-documents-production`. The active Worker uses a non-secret OIDC client ID; bootstrap ownership and the Google token-encryption key are Cloudflare secrets. The CRM does not bind to PaniPay `DB` or read its user tables. Production relationship assistance is enabled through the Cloudflare Workers AI binding, limited to the signed-in user's authorized CRM context, with up to 12 requests per user per hour; proposed tasks and notes remain pending until the user confirms them. General company mail delivery remains disabled. Support replies and opt-in acknowledgements can use the restricted Cloudflare Email Service binding for `panipay@panigale.tech` and `euroza@panigale.tech`; other sender identities and general company email still require the company mailer service binding. Google OAuth credentials and the company mailer service binding are not configured.

Before a production migration, record a fresh D1 Time Travel bookmark and follow [the production recovery runbook](docs/production-operations.md). Native point-in-time recovery has been verified for the production database; encrypted long-term D1 exports and a separate R2 document backup have not yet been configured or restore-rehearsed. Restore rehearsal and identity, authorization, CRUD, document, mobile, health, and unit-isolation checks must pass before removing the rollback path. Do not treat production CRM data as disposable.

### Required release checks

- Panigale Auth login, callback, logout, session expiry, and denied/unverified identity behavior.
- For a failed callback, use the `reference` returned by the CRM and find its `crm_auth_callback_rejected` or `crm_auth_callback_unexpected_error` Worker log entry. The log records only the callback stage/status or error class; never log callback URLs, OAuth codes, verifiers, tokens, or ID-token claims.
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
- `docs/production-operations.md` — D1 point-in-time recovery, maintenance mode, migration, and remaining backup requirements.

See [HANDOFF.md](HANDOFF.md) for the continuation prompt and migration checklist.
