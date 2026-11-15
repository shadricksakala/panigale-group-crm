# Continuation handoff

Paste the prompt below into the next Codex chat with `C:\Users\WINDOWS1\GitHub\EuroZambia\panigale-group-crm` as the workspace:

> Continue the Panigale Group CRM from this standalone repository. First inspect `README.md`, `HANDOFF.md`, the source, git status, and the existing PaniPay CRM at `C:\Users\WINDOWS1\GitHub\PaniPay\work\panipay`. The live CRM is currently at `https://panipay.panigale.tech/crm`; do not break or remove it during the split.
>
> Product decisions already made: the CRM is for all Panigale Group companies, with an internal deployment and a future SaaS foundation; it is a relationship CRM that links to product systems rather than replacing them; records are private to each business unit unless a CRM superadmin explicitly authorizes sharing. Preserve strict tenant isolation and explicit unit access.
>
> The current implementation is only extracted source. It still authenticates with PaniPay `pp_session`, uses PaniPay D1 (`DB`) and the PaniPay `users`/`platform_staff` tables, and relies on PaniPay CSRF/trusted-origin behavior. Design and implement the standalone app boundary: independent identity/SSO, least-privilege roles and tenant provisioning, database ownership and migration strategy, runtime/deployment configuration, secrets, backups, audit and observability. Prefer a documented PaniPay SSO integration or another explicit identity provider; never trust caller-supplied user or tenant IDs. Preserve PaniPay CRM until standalone authentication, authorization, data migration or shared-database access, and production smoke checks all pass. Then cut over deliberately and remove the PaniPay copy in a separate reviewed change.
>
> Create the GitHub repository `shadricksakala/panigale-group-crm`, push this local repository, and set up CI. The previous environment's GitHub CLI credential was invalid and the connected GitHub app did not list repositories, so check whether GitHub access is now available before trying to create the remote. Do not put credentials, API keys, or webhook secrets in git. Once remote access is available, push the initial commit and report the public/remote URL. Before deploying, complete the independent runtime/auth/data work and use the production health checks in the deployment plan.

## Extraction notes

- Source of truth at extraction: PaniPay branch `codex/panigale-group-crm`, commit `d347fd7` (`Build Panigale Group CRM foundation`).
- The production PaniPay Worker had already deployed that commit's CRM and applied migration `0044_panigale_crm.sql` to `panipay-production`.
- The deployed CRM was verified at `/crm`; unauthenticated API calls returned 401. Do not treat the production D1 data as disposable or run migration rollback casually.
- The first active PaniPay platform superadmin was identified in the prior implementation session; do not copy user identifiers or bootstrap access into source.
- Existing unrelated marketing assets and scratch files in either workspace must be preserved.
