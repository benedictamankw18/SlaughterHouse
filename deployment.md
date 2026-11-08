# Deployment guide

This guide covers deploying SlaughterHouse (UltBigBoy) to staging and
production. It assumes the repository as-is: an Express API backed by
PostgreSQL, a static frontend, an S3-compatible media store, and a separate
email outbox worker.

Operational backup and recovery details live in
[`docs/operations.md`](docs/operations.md); security controls live in
[`docs/security.md`](docs/security.md).

## Contents

1. [Deployment topologies](#1-deployment-topologies)
2. [Prerequisites](#2-prerequisites)
3. [Environment variables](#3-environment-variables)
4. [Option A: Docker Compose on a VPS](#4-option-a-docker-compose-on-a-vps)
5. [Option B: Vercel + Neon + S3](#5-option-b-vercel--neon--s3)
6. [Database setup and migrations](#6-database-setup-and-migrations)
7. [Media storage](#7-media-storage)
8. [First super-admin](#8-first-super-admin)
9. [Email worker](#9-email-worker)
10. [Health checks and smoke tests](#10-health-checks-and-smoke-tests)
11. [Backups and restore verification](#11-backups-and-restore-verification)
12. [Staging acceptance checklist](#12-staging-acceptance-checklist)
13. [Production promotion](#13-production-promotion)
14. [Rollback](#14-rollback)
15. [Troubleshooting](#15-troubleshooting)
16. [Pre-deployment verification](#16-pre-deployment-verification)

---

## 1. Deployment topologies

Two supported topologies:

| | Docker Compose on a VPS | Vercel + Neon + S3 |
|---|---|---|
| API runtime | Long-running Node container | Serverless functions |
| Frontend | nginx container | Vercel static output (`frontend/`) |
| Database | PostgreSQL 17 container or managed PostgreSQL | Neon PostgreSQL (pooled runtime URL) |
| Media | Local volume or S3 | S3 required |
| Email worker | Compose `email` profile | Separate persistent worker |
| Large admin uploads | Supported (nginx allows 160 MB) | **Capped at ~4.5 MB per request by Vercel** |
| TLS | External reverse proxy required | Provided by Vercel |

Choose Docker/VPS if administrators must upload 25 MB audio through the admin
UI today. Choose Vercel only if large uploads are moved to direct-to-storage
uploads, or if you accept the platform body limit.

The database is **PostgreSQL only**. MariaDB/MySQL is not supported by the
current code, migrations, tests, or backup scripts.

---

## 2. Prerequisites

- Node.js 22 and npm (build/verification host).
- PostgreSQL 16 or newer. The Compose stack uses `postgres:17-alpine`.
- `pg_dump` and `pg_restore` on the backup host, same major version as the
  server or newer.
- An S3-compatible bucket (Cloudflare R2, AWS S3, Backblaze B2, MinIO, or
  Supabase Storage) for any deployment with ephemeral disks.
- A Paystack account and secret key.
- An email provider API key and verified sender address.
- A stable HTTPS hostname for staging and production. Preview URLs change and
  break Paystack callbacks and webhooks.
- Docker Engine with the Compose plugin (Option A only).

---

## 3. Environment variables

Secrets must live in the hosting provider's secret store or an untracked `.env`
file. Never commit them.

### Required in production

| Variable | Notes |
|---|---|
| `NODE_ENV` | Must be `production`. Enables secure cookies and production guards. |
| `DATABASE_URL` | Pooled PostgreSQL URL for the running API. |
| `DOWNLOAD_SIGNING_SECRET` | Distinct random value, at least 32 bytes. Keep stable. |
| `CERTIFICATE_SIGNING_SECRET` | Distinct random value, at least 32 bytes. Keep stable. |
| `ADMIN_MFA_ENCRYPTION_KEY` | Independent random value, at least 32 bytes. Keep stable. |
| `FRONTEND_ORIGIN` | Public frontend origin, for example `https://example.com`. |
| `API_PUBLIC_URL` | Public API origin, for example `https://example.com`. |
| `PAYMENT_CALLBACK_URL` | Public success page, for example `https://example.com/payment-success.html`. |
| `STORAGE_DRIVER` | `s3` in production. |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Bucket and scoped credentials. |
| `PAYSTACK_SECRET_KEY` | Paystack live key in production; test key in staging. |
| `EMAIL_API_KEY`, `EMAIL_FROM` | Required for transactional email and the worker. |

Production startup fails when the signing secrets are missing, shorter than 32
bytes, or reused. It also fails when `STORAGE_DRIVER` is not `s3`, unless
`ALLOW_EPHEMERAL_STORAGE=true` is explicitly set.

### Optional / tuning

| Variable | Purpose |
|---|---|
| `TRUST_PROXY` | Trusted proxy hops or addresses. Use `1` behind the Compose nginx proxy, `2` with one extra TLS proxy, or leave unset on Vercel. |
| `DATABASE_URL_UNPOOLED` | Direct URL used by migrations, backups, and restores when the runtime URL is pooled (required on Neon). |
| `DB_POOL_MAX` | PostgreSQL pool size per process. Defaults to `3` on Vercel and `10` elsewhere; maximum `50`. |
| `BACKUP_DATABASE_URL` | Explicit direct connection for backups; takes priority over `DATABASE_URL_UNPOOLED`. |
| `BACKUP_DIR` | Persistent backup output directory. Defaults to `backend/data/backups`. |
| `PGDUMP_PATH`, `PGRESTORE_PATH` | Absolute paths to the client binaries when they are not on `PATH`. |
| `S3_ENDPOINT` | Custom endpoint for R2, MinIO, B2, etc. |
| `S3_FORCE_PATH_STYLE` | `true` only for providers that require path-style addressing. |
| `MEDIA_KEY_PREFIX` | Namespace inside the bucket, for example `staging` or `production`. |
| `PUBLIC_MEDIA_BASE_URL` | HTTPS CDN/public prefix for catalogue artwork and previews. Must not expose masters. |
| `FRONTEND_ORIGINS` | Additional comma-separated trusted browser origins. |
| `ALLOW_EPHEMERAL_STORAGE` | Do not set in production. Only for explicitly disposable deployments. |

### Staging versus production

| Variable | Staging | Production |
|---|---|---|
| `NODE_ENV` | `production` | `production` |
| `DATABASE_URL` | Staging database or Neon staging branch (pooled) | Production database (pooled) |
| `DATABASE_URL_UNPOOLED` | Staging direct URL | Production direct URL |
| `STORAGE_DRIVER` | `s3` | `s3` |
| `S3_BUCKET` / `MEDIA_KEY_PREFIX` | Staging bucket / `staging` | Production bucket / `production` |
| `FRONTEND_ORIGIN` | `https://staging.example.com` | `https://example.com` |
| `PAYSTACK_SECRET_KEY` | Test key | Live key |
| `EMAIL_API_KEY` / `EMAIL_FROM` | Staging sender | Production sender |
| Signing and MFA secrets | Distinct from production | Distinct from staging |
| `DB_POOL_MAX` | `3` on serverless | `3` on serverless |

Never share the production database, bucket, signing secrets, or Paystack live
key with staging.

---

## 4. Option A: Docker Compose on a VPS

The Compose stack runs PostgreSQL, the API, the static frontend behind nginx,
and an optional email worker.

### 4.1 Install and configure

From the repository root on the server:

```bash
cp .env.docker.example .env
```

Edit `.env`:

- Set strong, unique `DB_PASSWORD` and signing secrets.
- Set `FRONTEND_ORIGIN`, `API_PUBLIC_URL`, and `PAYMENT_CALLBACK_URL` to the
  public HTTPS hostname.
- Set `PAYSTACK_SECRET_KEY`, `EMAIL_API_KEY`, and `EMAIL_FROM`.
- Set `STORAGE_DRIVER=s3` and the `S3_*` values for durable media, OR leave
  `local` only if the `app-data` volume is durable and you accept host-bound
  storage.
- Set `TRUST_PROXY` to the correct hop count.

The Compose file publishes `postgres` and `backend` on `127.0.0.1` only. The
frontend listens on `127.0.0.1:${FRONTEND_PORT}`. Put a TLS reverse proxy
(Caddy, nginx, Traefik) in front of the frontend port and forward to it.

Example Caddy site block:

```caddy
example.com {
    reverse_proxy 127.0.0.1:5500
}
```

### 4.2 Start

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f backend
```

With email delivery configured, start the worker profile:

```bash
docker compose --profile email up --build -d
docker compose logs -f email-worker
```

### 4.3 Verify

```bash
curl -fsS https://example.com/api/health
curl -fsS https://example.com/api/ready
```

Both must return `200`. `/api/ready` reports database and storage checks.

### 4.4 Persistence

- `postgres-data` holds the database.
- `app-data` holds `data/uploads` and `data/certificates` when using the local
  storage driver.
- `docker compose down` preserves both; `docker compose down --volumes`
  destroys them. Never run the latter in production.

---

## 5. Option B: Vercel + Neon + S3

The repository contains `vercel.json`, `api/index.js`, and
`api/[...path].js`. Vercel serves `frontend/` statically and routes `/api/*`
through the Express serverless handler.

### 5.1 Provision

1. Create a Neon production branch/database and a separate staging branch.
2. Use the **pooled** connection string for `DATABASE_URL`.
3. Use the **direct/unpooled** connection string for `DATABASE_URL_UNPOOLED`
   and migrations/backups.
4. Create private S3 buckets for staging and production (or separate prefixes).
5. Create a stable custom domain for the Vercel project.

### 5.2 Configure Vercel

Set the variables from [section 3](#3-environment-variables) in Project
Settings → Environment Variables, scoped to Production and Preview/Staging as
appropriate.

Set `FRONTEND_ORIGIN` to the custom domain. Do not rely on `VERCEL_URL`, which
changes per deployment.

### 5.3 Deploy

```bash
vercel --prod
```

Or connect the Git repository and let pushes to the production branch deploy.

### 5.4 Migrations

Run migrations from a host with direct database access before routing traffic:

```bash
cd backend
DATABASE_URL="$DATABASE_URL_UNPOOLED" node database.js
```

Startup also applies pending migrations under a PostgreSQL advisory lock, but
run them explicitly as a deployment step so failures are visible.

### 5.5 Vercel constraints

- **Request bodies are capped at roughly 4.5 MB.** The API accepts admin
  catalog bodies up to 150 MB (25 MB audio inside base64 JSON). Large admin
  uploads will fail on Vercel. Use direct-to-object-storage uploads or move the
  API to a container.
- **Vercel does not run the email outbox worker.** Run it on a persistent host.
- Use pooled connections at runtime to avoid exhausting database connections.

---

## 6. Database setup and migrations

### 6.1 Create the database

```sql
CREATE USER slaughterhouse_app WITH PASSWORD 'a-strong-password';
CREATE DATABASE slaughterhouse OWNER slaughterhouse_app;
```

For Compose, the container creates `ultbigboy` automatically using `DB_USER`
and `DB_PASSWORD` from `.env`.

### 6.2 Apply migrations

Migrations live in `backend/services/migrations.js` and are applied in order.

```bash
cd backend
DATABASE_URL="$DATABASE_URL_UNPOOLED" node database.js
```

PowerShell:

```powershell
cd backend
$env:DATABASE_URL = $env:DATABASE_URL_UNPOOLED
node database.js
```

Migrations are forward-only. Do not edit or delete an applied migration. If a
migration fails, stop writes, preserve logs, and follow
[`docs/operations.md`](docs/operations.md#migration-recovery).

### 6.3 Verify schema

```bash
psql "$DATABASE_URL_UNPOOLED" -c "\dt"
psql "$DATABASE_URL_UNPOOLED" -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 5;"
```

---

## 7. Media storage

### 7.1 Bucket configuration

- Keep buckets **private**.
- Use a scoped access key limited to the bucket (read/write/delete objects).
- Enable versioning and server-side encryption.
- Add lifecycle rules for old-version cleanup and accidental-deletion recovery.
- Use separate buckets or `MEDIA_KEY_PREFIX` values for staging and production.

### 7.2 Application settings

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=slaughterhouse-media
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
MEDIA_KEY_PREFIX=production
# Set only for public catalogue artwork/previews:
# PUBLIC_MEDIA_BASE_URL=https://media.example.com
```

Do not set `PUBLIC_MEDIA_BASE_URL` to a prefix that exposes master audio,
stems, samples, or certificates. When unset, public media is streamed through
`/api/uploads/:filename`, and masters remain on authenticated download routes.

### 7.3 Migrating existing media

Run from `backend/` while the local files and destination bucket are both
accessible:

```bash
npm run storage:migrate
npm run storage:audit
```

Pause uploads for the final copy. The migration is resumable and verifies
checksums. Do not run multiple copies at once.

`storage:audit` must report zero missing and zero failed references before
cutover.

### 7.4 Bucket backup

Back up the bucket separately from PostgreSQL (versioning plus replication or a
provider backup). The database stores only file names; a database restore
cannot recreate deleted media.

---

## 8. First super-admin

Administrator accounts are stored in PostgreSQL and are not read from
environment variables. Create the first one with the bootstrap script.

From `backend/`, with the deployment database configured:

```powershell
$env:ADMIN_EMAIL = 'owner@example.com'
$env:ADMIN_NAME = 'Site Owner'
$env:ADMIN_PASSWORD = 'a-strong-unique-passphrase'
npm run admin:create
```

```bash
ADMIN_EMAIL='owner@example.com' \
ADMIN_NAME='Site Owner' \
ADMIN_PASSWORD='a-strong-unique-passphrase' \
npm run admin:create
```

The command:

- Validates the email, name, and password policy.
- Creates a verified `super_admin`.
- Refuses to overwrite an existing account unless `--update` is passed.
- Never prints or stores the plaintext password.

`--update` resets the password and ensures the `super_admin` role:

```bash
npm run admin:create -- --email owner@example.com --name "Site Owner" --password '...' --update
```

After the first login, enroll an authenticator app and save the one-time
recovery codes. All administrators must enroll MFA.

---

## 9. Email worker

The API only queues email in the PostgreSQL outbox. A separate worker sends it.

Docker:

```bash
docker compose --profile email up -d email-worker
docker compose logs -f email-worker
```

Standalone host:

```bash
cd backend
npm run email:worker
```

The worker requires `EMAIL_API_KEY` and `EMAIL_FROM`, and the same
`DATABASE_URL` as the API. Multiple workers can run safely; they claim rows with
row locks and a lease.

On Vercel, run the worker on Render, Railway, Fly.io, a VPS, or another
persistent service.

---

## 10. Health checks and smoke tests

### 10.1 Endpoints

| Endpoint | Expected |
|---|---|
| `GET /api/health` | `200 {"status":"ok"}` |
| `GET /api/ready` | `200 {"status":"ready", ...}`; `503` when a dependency fails |
| `GET /api/beats` | `200` catalogue response |
| `GET /` | `200` storefront HTML |

`/api/ready` checks configuration, database connectivity, uploads storage, and
certificates storage.

### 10.2 Manual smoke test

```bash
curl -fsS https://staging.example.com/api/health
curl -fsS https://staging.example.com/api/ready
curl -fsS "https://staging.example.com/api/beats?page=1&pageSize=1"
curl -fsS -o /dev/null -w "%{http_code}\n" https://staging.example.com/
```

Check response headers:

```bash
curl -sI https://staging.example.com/ | grep -Ei "content-security-policy|strict-transport-security|x-frame-options|referrer-policy"
```

### 10.3 Upload verification

> Only on hosting that accepts large request bodies (Docker/VPS). On Vercel,
> admin audio uploads are capped at the platform's ~4.5 MB request limit.

1. Sign in to the admin dashboard.
2. Upload a cover image, a preview, and a master audio file.
3. Confirm the public cover/preview URL loads.
4. Confirm the master file is **not** reachable without a signed download link.
5. Complete a test purchase and download the file as the customer.
6. Run `npm run storage:audit` from `backend/` and confirm zero missing.

---

## 11. Backups and restore verification

### 11.1 Configure direct access

Backups and restores must use a direct connection, not the pooled runtime URL:

```env
BACKUP_DATABASE_URL=postgresql://...
# or
DATABASE_URL_UNPOOLED=postgresql://...
BACKUP_DIR=/var/backups/slaughterhouse
```

Ensure `pg_dump` and `pg_restore` are installed. If they are not on `PATH`, set
`PGDUMP_PATH` and `PGRESTORE_PATH` to absolute paths. The backend image includes
`postgresql-client`, so backups can also run inside the API container; set
`BACKUP_DIR` to a mounted persistent path rather than the container filesystem.

### 11.2 Create a backup

```bash
cd backend
npm run backup -- /var/backups/slaughterhouse
```

Each backup produces a `.dump` file and a `.manifest.json` with table row
counts, byte size, and SHA-256 checksum.

Schedule this at least daily and after major data changes. Keep at least 30
daily and 12 monthly encrypted copies off-host.

### 11.3 Verify a backup

Create an empty scratch database:

```bash
createdb -h <host> -U <user> backup_verify_scratch
```

On Neon, create a dedicated empty database or branch through the console
instead of `createdb`.

Run verification:

```bash
npm run verify:backup -- /var/backups/slaughterhouse/<file>.dump --database backup_verify_scratch
```

Verification checks the dump checksum, restores into the empty scratch
database, and compares every table's row count with the manifest.

Then remove the scratch database through your normal DBA process.

### 11.4 Recovery drill

At least quarterly, and before launch:

1. Create a separate recovery database.
2. Restore the latest backup:

   ```bash
   npm run restore -- /var/backups/slaughterhouse/<file>.dump \
     --database recovery_db --confirm-database recovery_db
   ```

3. Point a staging API instance at `recovery_db`.
4. Confirm `/api/ready`, catalogue reads, order reads, and certificate checks
   work.
5. Record operator, timestamp, checksum, row counts, restore duration, and
   result.
6. Destroy the recovery database after sign-off.

The scripts refuse to restore into a non-empty database and require an exact
`--confirm-database` match.

---

## 12. Staging acceptance checklist

Run every item against the deployed staging host, not the mocked Playwright
suite.

### Accounts and access

- [ ] Customer signup → email verification → login → logout → password reset.
- [ ] Duplicate signup returns `409`.
- [ ] Admin MFA enrollment, TOTP login, recovery-code login.
- [ ] Five invalid MFA codes lock the challenge.
- [ ] Customer cannot reach admin endpoints (`403`).

### Catalogue and storefront

- [ ] Search, filter, sort, and pagination.
- [ ] Wishlist add/remove.
- [ ] Beat detail and preview playback.
- [ ] Policy pages load and are cross-linked.

### Payments

- [ ] Beat checkout with a Paystack test card.
- [ ] Merchandise checkout.
- [ ] Booking checkout with slot hold.
- [ ] Successful, failed, abandoned, refunded, and reversed payments.
- [ ] Webhook retry and duplicate webhook idempotency.
- [ ] Order amounts use the saved GHS rate snapshot.

### Downloads and licenses

- [ ] Paid-only download works through a signed link.
- [ ] Unpaid or other-customer download is rejected.
- [ ] Expired or revoked license is rejected.
- [ ] Tampered signed token is rejected.
- [ ] Certificate generation, customer retrieval, and public verification.

### Bookings and merchandise

- [ ] Slot hold prevents double booking.
- [ ] Confirmation, reschedule, cancellation, and refund.
- [ ] Expired hold reconciliation appears in Admin → Orders.
- [ ] Finite stock decrements and oversell is prevented.
- [ ] Refund restores stock.
- [ ] Fulfillment history is recorded.

### Email

- [ ] Verification, receipt, booking confirmation, license issued, and admin
      alert emails are delivered.
- [ ] Outbox retries after a provider failure.
- [ ] No verification or reset token appears in production responses.

### Security

- [ ] Missing `X-CSRF-Token` on a cookie-authenticated mutation returns `403`.
- [ ] Disallowed `Origin` returns `403`.
- [ ] Oversized JSON returns `413`.
- [ ] HSTS, CSP, `nosniff`, frame, referrer, and permissions headers present.
- [ ] Session cookies are `Secure`, `HttpOnly`, and `SameSite=Lax`.
- [ ] Master media is not publicly reachable.
- [ ] `npm run check:secrets` passes.

### Storage and backups

- [ ] Admin upload of image, preview, and 25 MB audio succeeds (Docker/VPS;
      Vercel cannot accept 25 MB uploads).
- [ ] `npm run storage:audit` reports zero missing/failed.
- [ ] Staging backup → scratch restore → `verify:backup` passes.
- [ ] Recovery drill restores a database the app can read.

### Observability and UX

- [ ] `/api/ready` reports all dependency checks.
- [ ] 5xx and payment failures are visible in logs/monitoring.
- [ ] Playwright axe checks pass on key pages.
- [ ] Layout fits mobile, tablet, laptop, and desktop without horizontal
      overflow.
- [ ] Representative page load is under the 3-second target.

### Soak

- [ ] Staging runs 24–48 hours without sustained 5xx, readiness failures,
      payment errors, or outbox backlog.

Exit criteria: every item is evidenced, backups and storage audit pass, known
issues are documented, and rollback steps are signed off.

---

## 13. Production promotion

1. Freeze non-essential changes.
2. Run the full pre-deployment verification in
   [section 16](#16-pre-deployment-verification).
3. Take and verify a production backup.
4. Apply pending migrations with the direct URL:

   ```bash
   cd backend
   DATABASE_URL="$DATABASE_URL_UNPOOLED" node database.js
   ```

5. Deploy the new release.
6. Confirm `/api/health` and `/api/ready`.
7. Run the smoke tests in [section 10](#10-health-checks-and-smoke-tests).
8. Verify one real administrator upload and one paid download.
9. Monitor logs, error rates, payment success, and outbox backlog for at least
   30 minutes.
10. Keep the previous deployment available until the new release is stable.

---

## 14. Rollback

### Application rollback

Redeploy the previous known-good release or image. Do not roll back the
database by editing applied migrations.

### Database rollback

Migrations are forward-only. If a release must be reverted:

1. Stop writes if data integrity is at risk.
2. Restore the latest verified backup into a **separate** database.
3. Validate the restored database with the application.
4. Point traffic to the restored database or write a reviewed forward migration
   to reconcile the schema.
5. Preserve the failed database and logs for investigation.

Never restore over the live production database without explicit approval and a
verified backup.

---

## 15. Troubleshooting

### `Production requires STORAGE_DRIVER=s3`

Set `STORAGE_DRIVER=s3` and all required `S3_*` values. Do not set
`ALLOW_EPHEMERAL_STORAGE=true` in production.

### `Set DOWNLOAD_SIGNING_SECRET, CERTIFICATE_SIGNING_SECRET, ADMIN_MFA_ENCRYPTION_KEY`

All three are required in production, must be at least 32 bytes, and must be
different from each other.

### `Could not find pg_dump.exe` / `pg_restore.exe`

Install the PostgreSQL client tools or set absolute `PGDUMP_PATH` and
`PGRESTORE_PATH`.

### `pg_restore: error: could not open input file "-"` on Windows

The restore and verification scripts stream the dump through `pg_restore` using
`-` for stdin. Some Windows `pg_restore` builds reject `-`. Run the drill on
Linux/CI, or invoke `pg_restore` directly with the dump path:

```powershell
pg_restore --exit-on-error --no-owner --no-acl `
  --host $host --port $port --username $user --dbname recovery_db `
  "C:\Backups\slaughterhouse\<file>.dump"
```

### Uploads fail through nginx with `413 Request Entity Too Large`

The Compose nginx config allows 160 MB for `/api/admin/`, 25 MB for
`/api/requests`, and 2 MB elsewhere. If an outer proxy also enforces a body
limit, raise it there too.

### Uploads fail on Vercel

Vercel caps request bodies at roughly 4.5 MB. Move the API to a container or
implement direct-to-object-storage uploads. Raising Express limits does not
help.

### `503 Request protection is temporarily unavailable`

The shared PostgreSQL rate-limit table is unreachable. Check database health
and migrations.

### `FRONTEND_ORIGIN` validation error

Origins must be full origins without a path or trailing slash, for example
`https://example.com`.

### Cookies are not set behind a proxy

Set `TRUST_PROXY` to the correct hop count and ensure the outer proxy forwards
`X-Forwarded-Proto: https`. The Compose nginx preserves an incoming value and
falls back to its own scheme.

### Emails are not delivered

Confirm `EMAIL_API_KEY`, `EMAIL_FROM`, and that the worker is running. Check the
outbox for pending or failed rows and retry.

### Paystack callback lands on the wrong page

`PAYMENT_CALLBACK_URL` must be the public, stable success page URL, for example
`https://example.com/payment-success.html`.

---

## 16. Pre-deployment verification

Run from the repository root unless noted.

```powershell
# Install dependencies
npm ci --prefix backend

# Unit and migration tests
npm test --prefix backend

# PostgreSQL route integration tests (local PostgreSQL only)
$env:TEST_DATABASE_URL = 'postgresql://<user>:<password>@127.0.0.1:5433/slaughterhouse_route_test'
npm run test:integration --prefix backend

# Browser tests (mocked API)
npm run test:browser --prefix backend

# Dependency audit (must run where the lockfile is)
npm audit --omit=dev --prefix backend

# Secret and dump scans
npm run check:secrets --prefix backend
npm run check:database-dumps --prefix backend
```

Expected results:

- Backend suite passes; the PostgreSQL integration test is skipped only when
  `TEST_DATABASE_URL` is unset.
- Integration suite exercises all registered API routes (currently 100).
- 19 Playwright browser tests pass.
- `npm audit --omit=dev --prefix backend` reports 0 vulnerabilities.
- Secret and database-dump scans report no findings.

CI (`.github/workflows/ci.yml`) runs the same checks plus the Vercel deployment
configuration validation.

> Run `npm audit` from `backend/` or with `--prefix backend`. Running it at the
> repository root fails with `ENOLOCK` because the root has no lockfile.
