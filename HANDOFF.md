# Continuation handoff

Paste this prompt into the next Codex chat with `C:\Users\WINDOWS1\GitHub\EuroZambia\panigale-group-crm` as the workspace:

> Continue the Panigale Group CRM in this dedicated repository. The production target is **https://crm.panigale.tech**. This repo is the canonical CRM workspace. Other group source repositories remain available for reading and integration reference: PaniPay at `C:\Users\WINDOWS1\GitHub\PaniPay\work\panipay` and EUROZA at `C:\Users\WINDOWS1\GitHub\EuroZambia`. Keep CRM implementation here; change other repos only when an integration genuinely requires their product source to change. Do not make production depend on local checkout paths.
>
> First inspect `README.md`, this handoff, the git status/history, and current CRM implementation in both this repo and PaniPay. Do not break the existing CRM at `https://panipay.panigale.tech/crm`; preserve it as the rollback path until the dedicated deployment at `crm.panigale.tech` passes the cutover checks.
>
> Product decisions already made: the CRM serves Panigale Group companies, with an internal deployment and future SaaS foundation; it is a relationship CRM that links to product systems rather than replacing them; records are private to each business unit unless a CRM superadmin explicitly authorizes sharing. Preserve strict tenant isolation and explicit unit access.
>
> The extracted source still uses PaniPay `pp_session`, PaniPay D1 (`DB`) and the PaniPay `users`/`platform_staff` tables, plus PaniPay CSRF/trusted-origin behavior and Cloudflare/Next runtime APIs. Make the standalone app deployable at `crm.panigale.tech`: choose and implement an explicit identity/SSO contract, least-privilege tenant and unit authorization, database ownership and migration strategy, runtime configuration, secrets, backups/restores, audit and observability. Never trust caller-supplied user or tenant IDs. Decide deliberately whether CRM data will be migrated or the CRM will temporarily access a shared DB through a restricted connection. Do not treat the current production D1 data as disposable.
>
> Configure the production hosting and custom domain for `crm.panigale.tech`, including DNS/Cloudflare Worker or Pages route, TLS, environment bindings and secrets, health checks, and rollback. Do not cut over DNS or remove the PaniPay CRM until the new host's authentication, authorization, core CRUD, tenant isolation, email/SSO flows, mobile layout, and production health are verified. Then cut over deliberately and remove the old copy in a separate reviewed change.
>
> Create/use the GitHub repository `shadricksakala/panigale-group-crm`, push this local repository, and set up CI. The previous environment's GitHub CLI credential was invalid and the connected GitHub app showed no repositories; first check whether GitHub access is now available. Do not commit credentials, API keys, webhook secrets, or production data. After remote access is available, push the commits and report the public repo URL. Commit and push relevant changes and deploy to `crm.panigale.tech` after the standalone implementation is production-ready; verify publication and health.

## Extraction notes

- Source of truth at extraction: PaniPay branch `codex/panigale-group-crm`, commit `d347fd7` (`Build Panigale Group CRM foundation`).
- Standalone repository initial commit: `6bf4a35` (`Extract Panigale Group CRM source`).
- Production PaniPay Worker had deployed the CRM and applied `0044_panigale_crm.sql` to `panipay-production`.
- The PaniPay CRM at `/crm` was previously verified; unauthenticated CRM API calls returned 401. Preserve it until standalone cutover is complete.
- Do not copy production identities, credentials, or bootstrap access into source.
- Preserve unrelated marketing assets and scratch files in both workspaces.
