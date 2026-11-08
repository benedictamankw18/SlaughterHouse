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
On Vercel, the API trusts the platform proxy by default. `TRUST_PROXY=false`
overrides that behavior; otherwise set an explicit value only when deployment
topology requires it.

Cookie-authenticated unsafe requests require the server-verified
`X-CSRF-Token` returned by login. Existing sessions without a token hash must
sign in again before cookie-authenticated mutations; bearer-authenticated
requests and the HMAC-verified payment webhook are exempt. JSON bodies are
limited to 256 KB by default, 150 MB on admin beat/merchandise/stream-release
upload routes, and 20 MB for custom requests. URL-encoded bodies are not accepted.

## Database backups

Configure `DATABASE_URL` with a PostgreSQL connection string. Install `pg_dump`
and `pg_restore`, and set `PGDUMP_PATH` / `PGRESTORE_PATH` if they are not on
`PATH`. The backup tools pass the database password through `PGPASSWORD`, not
as a command-line argument.

Backup and restore prefer `BACKUP_DATABASE_URL`, then `DATABASE_URL_UNPOOLED`,
then `DATABASE_URL`. Point them at a direct (unpooled) connection when the API
uses a pooled endpoint, and set `BACKUP_DIR` to a persistent directory when the
default `backend/data/backups` path is ephemeral.

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

Set `STORAGE_DRIVER` to choose the media backend.

- `local` (default) keeps uploads and generated certificates in the backend's
  `data\uploads` and `data\certificates` directories. Use it only when those
  directories survive restarts and redeploys: local development, or Docker with
  the persistent `app-data` volume. The Docker Compose stack sets
  `ALLOW_EPHEMERAL_STORAGE=true` because that volume is durable.
- `s3` stores the same files in an S3-compatible bucket (Cloudflare R2, AWS S3,
  Supabase Storage, Backblaze B2, MinIO) and keeps customer media out of the
  application filesystem. Configure `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. `S3_FORCE_PATH_STYLE` is for
  providers that require path-style addressing. `MEDIA_KEY_PREFIX` namespaces
  the bucket, and `PUBLIC_MEDIA_BASE_URL` is the public/CDN base for catalogue
  artwork and previews. When `PUBLIC_MEDIA_BASE_URL` is unset, public media URLs
  use `/api/uploads/:filename` on the API, which streams the object from the
  bucket instead of the local disk.

Production startup requires `STORAGE_DRIVER=s3`, unless
`ALLOW_EPHEMERAL_STORAGE=true` explicitly opts into disposable local storage.
Do not use that override for a production store. Ephemeral hosting platforms
delete local files on deploy, restart, and idle shutdown. Media that is already
lost cannot be recreated from the database: re-upload it through the admin
screens and run `npm run storage:audit` to list database references whose
files are missing from the configured provider.

To migrate files before changing the deployment's `STORAGE_DRIVER`, make the
local `data\uploads` and `data\certificates` directories available to a backend
process configured with the destination S3 credentials, then run
`npm run storage:migrate` from `backend\`. The command copies files without
overwriting objects and verifies matching objects by SHA-256, so it can safely
resume after interruption. Do not run multiple copies concurrently. Pause media
uploads during the final copy, then run `npm run storage:audit` against the S3
configuration before routing production traffic to the new provider.

`GET /api/uploads/:filename` exposes only `cover-`, `merchandise-`, and
`preview-` files, supports byte ranges for audio seeking, and caches public
media immutably. Master audio remains behind the authenticated, signed customer
download route, and request sample audio remains admin-authenticated. Generated
certificates stay private and are streamed only through the authenticated
certificate routes.

## Serverless deployment and background work

Vercel serves the static frontend from `frontend\` and routes `/api/*` to the
Express handlers in `api\`. The app module does not listen on a port when
imported as a serverless function. Configure `DATABASE_URL` as a pooled
PostgreSQL connection string, production signing secrets, `STORAGE_DRIVER=s3`,
and the bucket credentials in project environment settings. The frontend uses
same-origin `/api` requests by default.

Vercel functions do not run the email outbox poller. Run
`npm run email:worker --prefix backend` in a persistent worker service. The
worker and web functions may share the same database; outbox claims use row
locks and a lease. PostgreSQL migrations take an advisory lock so concurrent
function cold starts cannot apply the same migration simultaneously.

The rate-limit table is also shared through PostgreSQL. Expired buckets are
pruned opportunistically in batches by API requests. Monitor table growth and
schedule a cleanup task if deployment traffic is too low to regularly trigger
pruning. Signup, login, password-reset, booking-payment initialization,
payment initialization, verification, and signed Paystack webhook endpoints
use shared database-backed request limits.

All administrator accounts must enroll an authenticator app at their next
login. TOTP secrets are encrypted using the stable
`ADMIN_MFA_ENCRYPTION_KEY`; production startup requires this independent key to
be at least 32 bytes. Administrators must save the one-time recovery codes
shown during enrollment. MFA challenges expire after 10 minutes and allow at
most five code attempts.

Booking checkout reserves every selected slot in the same PostgreSQL
transaction that creates the pending order. Holds expire after 30 minutes;
payment failure or abandonment releases them immediately, while expired holds
are cleared lazily when availability is read or another checkout tries to
claim the slot. A successful payment converts only its own unexpired hold into
a booked slot. If a payment arrives after the hold expires, the order is marked
paid and flagged for reconciliation in Admin > Orders even if the slot has not
yet been claimed by another customer. An administrator can reserve and assign
replacement sessions or request a full Paystack refund. Refund requests stay
pending until Paystack confirms them; the confirmed full refund clears the
reconciliation flag. Both resolution paths are audited and notify the customer.

Beat checkout uses the USD-to-GHS rate maintained by a super-admin in
Admin > Settings. Update the rate at least once every 24 hours; beat checkout
is blocked if the rate is missing, invalid, or stale. Each order records the
applied rate and rounded GHS amount for every beat line, and paid order items
retain that snapshot for reporting. Do not recalculate existing orders when
the current rate changes.

Back up the bucket (or the local media directories when the local driver is
used) separately from the PostgreSQL backups. The database stores only file
names, so a database restore cannot recreate missing media.

## Migration recovery

Database migrations are forward-only. Do not edit or remove an applied migration to roll it back. For a failed deployment, stop writes if necessary, restore the latest verified backup into a separate database, and use a reviewed forward migration to reconcile schema or data. Promote a restored database only after application-level validation and an explicit operational approval. Preserve the failed database and logs for investigation.

## Staging and production promotion

Use a separate staging database, object-storage bucket or key prefix, signing
secrets, Paystack key, email sender, and stable HTTPS hostname. Do not use a
Neon production branch or a shared bucket for staging tests, and do not run the
integration suite against staging or production.

1. Provision the staging database and bucket, then configure secrets in the
   hosting provider rather than a tracked file.
2. Run migrations with a direct connection (`DATABASE_URL` set to the unpooled
   URL on the migration host).
3. Deploy the API and static frontend, then confirm `GET /api/health` and
   `GET /api/ready` succeed.
4. Create the first super-admin with `npm run admin:create`, enroll MFA, and
   configure the USD-to-GHS rate, booking services, license definitions, and
   business settings.
5. Run the acceptance checks against the deployed host, including a real
   administrator upload, a paid download, a Paystack test checkout and webhook
   retry, and the email outbox worker.
6. Create a staging backup, restore it into an empty scratch database, and run
   `verify:backup` before treating backups as recoverable.
7. Run `npm run storage:audit` against the staging bucket and confirm there are
   no missing or failed references.

For promotion, take and verify a production backup first, apply pending
migrations with the direct URL, deploy, and repeat the smoke checks. Keep the
previous deployment available for rollback. If a forward migration or data
change fails, restore the verified backup into a separate database and follow
the migration-recovery procedure instead of editing applied migrations.

The Compose nginx proxy allows 160 MB admin upload bodies and 25 MB custom
requests. Deployments on other hosting must verify the platform request-body
limit before accepting administrator audio uploads.
