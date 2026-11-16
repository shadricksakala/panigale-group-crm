# Continuation handoff

This repository is `C:\Users\WINDOWS1\GitHub\panigale-group-crm`. Continue CRM work here:

> Continue the Panigale Group CRM in this dedicated repository. The production target is **https://crm.panigale.tech**. This repo is the canonical CRM workspace. Other group source repositories remain available for reading and integration reference: PaniPay at `C:\Users\WINDOWS1\GitHub\PaniPay\work\panipay` and EUROZA at `C:\Users\WINDOWS1\GitHub\EuroZambia`. Keep CRM implementation here; change other repos only when an integration genuinely requires their product source to change. Do not make production depend on local checkout paths.
>
> Inspect `README.md`, this handoff, current git status/history, and the CRM implementation in this repo. Read PaniPay source when an integration reference is needed. Do not break the existing CRM at `https://panipay.panigale.tech/crm`; preserve it as rollback until the dedicated deployment passes all remaining cutover checks and data recovery is rehearsed.
>
> Product decisions already made: the CRM serves Panigale Group companies, with an internal deployment and future SaaS foundation; it is a relationship CRM that links to product systems rather than replacing them; records are private to each business unit unless a CRM superadmin explicitly authorizes sharing. Preserve strict tenant isolation and explicit unit access.
>
> The standalone app now uses Panigale Auth OIDC with PKCE, a CRM-owned D1 database, explicit tenant/unit access, its own app sessions, Cloudflare runtime bindings, and audit/observability. Continue hardening production operations, backups/restores, integrations, and the remaining acceptance checks. Never trust caller-supplied user or tenant IDs. Do not treat current production D1 or R2 data as disposable.
>
> Production hosting and `crm.panigale.tech` DNS/TLS are configured, and the dedicated Worker is healthy. Relationship assistance is enabled on Cloudflare Workers AI after synthetic-data inference, citation, and tenant/unit denial checks; AI task/note suggestions still require user confirmation. General email delivery remains disabled. Google OAuth client credentials, the CRM mailer binding, long-term encrypted D1 exports, and a separate R2 backup/restore rehearsal remain outstanding. Do not remove the PaniPay CRM until authentication, authorization, core CRUD, tenant isolation, email/SSO, mobile layout, production health, and data recovery are fully verified.
>
> The public GitHub repository is `https://github.com/shadricksakala/panigale-group-crm`; CI workflow is checked in. Commit and push relevant changes and deploy safely to `crm.panigale.tech`; verify publication and health. Do not commit credentials, API keys, webhook secrets, or production data.

## Extraction notes

- Source of truth at extraction: PaniPay branch `codex/panigale-group-crm`, commit `d347fd7` (`Build Panigale Group CRM foundation`).
- Standalone repository initial commit: `6bf4a35` (`Extract Panigale Group CRM source`).
- Production PaniPay Worker had deployed the CRM and applied `0044_panigale_crm.sql` to `panipay-production`.
- The PaniPay CRM at `/crm` was previously verified; unauthenticated CRM API calls returned 401. Preserve it until standalone cutover is complete.
- Standalone CRM health returned `ok`, login redirected to Panigale Auth, and the owner confirmed sign-in. Production database is standalone and actively used; see README for current activation limits and the operations runbook for recovery controls.
- Do not copy production identities, credentials, or bootstrap access into source.
- Preserve unrelated marketing assets and scratch files in both workspaces.
