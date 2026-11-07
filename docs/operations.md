# Operations

## Health and metrics

- `GET /api/health` is a liveness check and does not query the database.
- `GET /api/ready` checks required database configuration, the database connection, and writable upload and certificate directories. It returns `503` when any dependency is unavailable and omits internal error messages.
- Authenticated administrators can use `GET /api/admin/health/dependencies` for detailed dependency errors and `GET /api/admin/metrics` for process-local counters.
- Counters reset when the backend restarts and are not a durable monitoring system. Send structured JSON logs to the deployment platform and alert on sustained 5xx responses, payment verification failures, database errors, upload failures, and unusual 401/403 spikes.

## HTTP security configuration

Set `FRONTEND_ORIGIN` to the primary frontend origin and optionally set
`FRONTEND_ORIGINS` to a comma-separated allowlist for additional trusted
frontends. Production rejects opaque `Origin: null` requests. Configure
`TRUST_PROXY` only when the API is behind a known reverse proxy; use the
smallest correct hop count or explicit trusted proxy addresses, not `true`
unless every client reaches the app exclusively through the trusted proxy.

Cookie-authenticated unsafe requests require the server-verified
`X-CSRF-Token` returned by login. Existing sessions without a token hash must
sign in again before cookie-authenticated mutations; bearer-authenticated
requests and the HMAC-verified payment webhook are exempt. JSON bodies are
limited to 256 KB by default, 35 MB on admin beat/merchandise upload routes,
and 20 MB for custom requests. URL-encoded bodies are not accepted.

## Database backups

Configure `DATABASE_URL` with a PostgreSQL connection string. Install `pg_dump`
and `pg_restore`, and set `PGDUMP_PATH` / `PGRESTORE_PATH` if they are not on
`PATH`. The backup tools pass the database password through `PGPASSWORD`, not
as a command-line argument.

Create a full custom-format PostgreSQL backup and JSON manifest (table row
counts, byte size, and SHA-256 checksum):

```powershell
cd backend
npm run backup
```

By default, backups are written to `backend/data/backups/`. An optional first argument selects a different output directory:

```powershell
npm run backup -- "D:\Backups\ultbigboy"
```

Schedule this command at least daily, and after major data changes. Keep at least 30 daily backups and 12 monthly backups in encrypted storage separate from the application host. Restrict access to backup files because they contain customer and business data. Verify each scheduled backup before it is considered recoverable.

## Restore and verification

Restore only into a new, empty PostgreSQL database. Create the target database
through your normal DBA process first. The target must be explicitly confirmed,
and the script refuses to restore into a database containing relations. It does
not drop or overwrite existing data.

```powershell
npm run restore -- "D:\Backups\ultbigboy\backup.dump" --database recovery_db --confirm-database recovery_db
```

Create a separate empty scratch database first, then verify a backup by restoring it there and comparing every base table's row count with the backup manifest:

```powershell
npm run verify:backup -- "D:\Backups\ultbigboy\backup.dump" --database backup_verify_scratch
```

The scratch database must differ from the configured source database. Verification populates it and does not delete it; remove the scratch database through the normal DBA process after inspecting the result. Perform and record a restore test at least quarterly, including a check that the application can read the restored data.

## File storage

The local storage provider keeps uploads and generated certificates in the
backend's `data\uploads` and `data\certificates` directories, outside the
frontend web root. Grant the backend process write access to both directories
and include them in the protected backup and restore plan as appropriate.
`GET /api/uploads/:filename` exposes only `cover-`, `merchandise-`, and
`preview-` files; master audio remains behind the authenticated, signed
customer download route, and request sample audio remains admin-authenticated.
The storage interface is provider-ready, but object storage is not configured
or used by this deployment.

## Migration recovery

Database migrations are forward-only. Do not edit or remove an applied migration to roll it back. For a failed deployment, stop writes if necessary, restore the latest verified backup into a separate database, and use a reviewed forward migration to reconcile schema or data. Promote a restored database only after application-level validation and an explicit operational approval. Preserve the failed database and logs for investigation.
