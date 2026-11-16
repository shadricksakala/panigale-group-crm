# Production operations and recovery

This runbook applies to the standalone CRM Worker, its production D1 database, and the R2 document bucket. Production contains live CRM data. Do not use restore, export, or migration commands casually.

## Resources and safeguards

- Worker and custom domain: `panigale-group-crm` at `https://crm.panigale.tech`.
- D1 binding/database: `CRM_DB` / `panigale-group-crm-production`.
- Document storage: `CRM_DOCUMENTS` / `panigale-group-crm-documents-production`.
- PaniPay-hosted CRM: `https://panipay.panigale.tech/crm` remains the application rollback path. It is a separate deployment and does not roll back writes made to the standalone CRM database.
- No local checkout path is used by the production Worker.

The Worker has two operational controls:

- `CRM_READ_ONLY_MODE=true` returns HTTP 503 for CRM mutation requests and PaniPay webhooks. Sign-out remains available. Reads remain enabled.
- `CRM_SCHEDULED_JOBS_ENABLED=false` pauses reminder queuing, Gmail sync and retention work, and mail delivery.

Both controls are `false` / `true` respectively in the checked-in production configuration. They do not replace a backup, and enabling read-only mode does not suspend external Auth callback/session writes.

## D1 point-in-time recovery

Cloudflare D1 Time Travel is enabled automatically; it does not require a separate setting. [Cloudflare documents](https://developers.cloudflare.com/d1/reference/time-travel/) up to 30 days of recovery on Workers Paid and 7 days on Workers Free. Confirm the account entitlement before relying on the full window. The current production database successfully returned a Time Travel bookmark on 2026-11-16. This confirms the recovery API is available, not that a restore has been rehearsed.

Before every production migration or other risky database change, capture a fresh bookmark and include it in the release record:

```powershell
npx wrangler d1 time-travel info panigale-group-crm-production --config wrangler.production.jsonc --json
```

Record the bookmark and UTC capture time. Do not put CRM table exports, user data, or secrets in GitHub. D1 Time Travel is the immediate point-in-time recovery path; encrypted long-term D1 exports are not configured yet.

### Restore procedure

Restoring a bookmark overwrites the live database. The Wrangler command has no dry-run mode. Use a reviewed incident/recovery decision and confirm the target timestamp with the CRM owner before proceeding.

1. Notify CRM users and pause writes and scheduled processing by deploying with the two maintenance overrides below. Confirm the Worker reports a new version before continuing.
2. Capture the current bookmark as a forward recovery point. Record the proposed restore timestamp/bookmark and the expected data-loss window in the incident record.
3. Check the target point with `wrangler d1 time-travel info ... --timestamp <RFC3339>` and review the returned bookmark. Do not restore from an estimate alone.
4. Restore only after the owner authorizes the exact bookmark:

   ```powershell
   npx wrangler d1 time-travel restore panigale-group-crm-production --config wrangler.production.jsonc --bookmark <bookmark>
   ```

5. Verify production health, Auth sign-in, tenant/unit access, and representative CRM records with authorized staff. Do not rely on `/api/health` alone to prove data correctness.
6. Resume scheduled processing and writes with the normal checked-in values. Verify another Worker version deployed, then monitor logs and CRM health. Preserve both pre-restore and post-restore bookmarks in the incident record.

Maintenance override example (build the app before invoking `wrangler deploy` if deploying the generated Worker directly):

```powershell
npx wrangler deploy --config wrangler.production.jsonc --var CRM_READ_ONLY_MODE:true --var CRM_SCHEDULED_JOBS_ENABLED:false --keep-vars
```

To resume normal operation:

```powershell
npx wrangler deploy --config wrangler.production.jsonc --var CRM_READ_ONLY_MODE:false --var CRM_SCHEDULED_JOBS_ENABLED:true --keep-vars
```

For the normal application build, use `npm run build` before either Wrangler command. Keep the two `--var` values and `--keep-vars`; the latter preserves any Worker variables managed outside the checked-in config. Never set either override without recording the maintenance window and checking the resulting deployment.

## Migration procedure

1. Inspect `git status`, migration ordering, and the exact SQL diff. Do not change or delete old migrations that have been applied.
2. Capture a fresh D1 Time Travel bookmark as above. Use synthetic/local data to validate the migration; never copy production data into local or staging environments without an approved masking and access plan.
3. Confirm the migration is additive or otherwise has a reviewed rollback/forward-repair plan. D1 Time Travel is a recovery mechanism, not a substitute for understanding the data impact.
4. Apply one migration at a time and inspect the result. Do not combine migration deployment with a hostname cutover or removal of the PaniPay CRM.
5. Verify expected schema and application behavior. Keep the captured bookmark available through the recovery window.

## Backup gaps to close before removing rollback

- Configure an encrypted, access-controlled long-term D1 export outside the Worker deployment if retention beyond Cloudflare Time Travel is required. This is not yet automated.
- Establish a separate backup/restore plan for `CRM_DOCUMENTS` in R2 and rehearse it with non-production documents. No independent R2 backup has been verified.
- Rehearse recovery in a non-production environment using synthetic or approved masked data. Current Time Travel restore is in-place; do not rehearse against the active production database.
- Keep the PaniPay CRM rollback deployment until the standalone recovery drill, mobile verification, auth/integration checks, and tenant isolation checks are complete. Remember that the PaniPay CRM cannot restore standalone CRM writes.
