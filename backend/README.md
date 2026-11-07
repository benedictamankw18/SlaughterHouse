# Backend structure

The backend is organized by responsibility:

- `server.js` - HTTP bootstrap, middleware, router registration, and error handling
- `config.js` - environment-backed runtime configuration
- `database.js` - PostgreSQL connection and schema initialization
- `services/migrations.js` - versioned PostgreSQL schema migrations
- `session-store.js` - database-backed session creation and authorization middleware
- `services/roles.js` - visitor, customer, administrator, and super-administrator permissions
- `routes/auth.js` - customer and administrator authentication
- `routes/public.js` - health, beats, stream releases, reviews, merchandise, user count, and public uploads
- `routes/admin.js` - administrator dashboard, catalog, withdrawal, and review routes
- `routes/requests.js` - custom beat/merchandise requests and license pricing
- `routes/bookings.js` - booking fees, availability, and booking payment initialization
- `routes/payments.js` - storefront payment initialization and verification
- `routes/downloads.js` - signed beat download routes
- `services/security.js` - password hashing and password verification
- `services/booking.js` - booking fees and slot validation
- `services/uploads.js` - validated image/audio persistence
- `services/storage/` - private local file storage provider and streaming access
- `services/downloads.js` - signed download token generation and verification
- `services/account-tokens.js` - hashed, expiring password-reset and email-verification tokens
- `services/email/` - Resend sender, transactional templates, and retryable email outbox
- `services/audit.js` - safe audit-event recording without passwords or tokens
- `services/rate-limit.js` - endpoint rate limiting for authentication and administration

Run the API from this directory:

```powershell
node server.js
```

## Docker Compose

From the repository root, copy `.env.docker.example` to `.env`, set unique
database passwords and two different stable signing secrets of at least 32
characters, then start the stack:

```powershell
Copy-Item .env.docker.example .env
docker compose up --build -d
docker compose ps
```

Open the site at `http://localhost:5500`; the API is available at
`http://localhost:3000`. PostgreSQL is published only on `127.0.0.1:5433` by default
and is reachable by the API container on the private Compose network. Database
migrations run before the API starts listening. The `postgres-data` and
`app-data` named volumes persist the database, uploaded files, and certificates.
To stop the stack without deleting data, run `docker compose down`. To remove
all persisted database and uploaded data, run `docker compose down --volumes`.

Set `PAYSTACK_SECRET_KEY`, `EMAIL_API_KEY`, and `EMAIL_FROM` in `.env` to enable
payments and email delivery. For deployment behind a reverse proxy, set
`FRONTEND_ORIGIN`, `FRONTEND_ORIGINS`, `API_PUBLIC_URL`,
`PAYMENT_CALLBACK_URL`, and `TRUST_PROXY` to the actual trusted public
configuration before starting the services. Deployments whose filesystem does
not survive redeploys must set `STORAGE_DRIVER=s3` with the `S3_*` variables so
uploads and generated certificates live in an S3-compatible bucket; see
`docs/operations.md`. Do not commit `.env`.

Initialize or validate the database connection separately:

```powershell
node database.js
```

All application tables and schema changes are defined in ordered migrations in
`services/migrations.js`. Migration 0 creates the baseline entities, including
users and roles, beats and per-license prices, orders, bookings, merchandise,
and requests. Later migrations add the marketplace features and constraints.
`database.js` only runs pending migrations; it no longer creates tables or
alters columns outside the migration history. Existing rows are preserved.
Migration 20 seeds the existing curated stream releases into `stream_releases`;
the public catalog is served by `GET /api/stream-releases`. Administrators can
create and update releases, delete them, and activate or deactivate publication
from the dashboard; newly created releases remain unpublished until activated.
New beat licenses and download access expire one year after purchase. Existing
licenses retain their original terms and are not given a retroactive expiry.
Access is available only while the order is fully paid and the license is
unexpired and unrevoked; a new paid purchase renews an expired license.
Merchandise remains physical and has no customer download files.

## PostgreSQL and Render setup

The backend requires PostgreSQL. Set `DATABASE_URL` to a PostgreSQL connection
string (`postgresql://...`) in the hosting provider's secret environment
settings. For Neon, use the pooled connection string for the running web
service. Do not put database credentials in source control or chat. Render's
health-check path should be `/api/health`.

For local development, create a database and application user using `psql`:

```sql
CREATE USER ultbigboy_app WITH PASSWORD 'change-this-password';
CREATE DATABASE ultbigboy OWNER ultbigboy_app;
```

From `backend\`, copy `.env.example` to `.env` and set `DATABASE_URL`.
`PORT` and `NODE_ENV` configure the API runtime.
Payment and download configuration uses `PAYSTACK_SECRET_KEY`,
`PAYMENT_CALLBACK_URL`, `API_PUBLIC_URL`, `FRONTEND_ORIGIN`, and
`DOWNLOAD_SIGNING_SECRET`. Production requires distinct, stable values of at
least 32 bytes for `DOWNLOAD_SIGNING_SECRET` and
`CERTIFICATE_SIGNING_SECRET`, plus an independent 32-byte
`ADMIN_MFA_ENCRYPTION_KEY` to encrypt administrator authenticator secrets.
Keep all three keys stable across deployments; keep the certificate secret stable so issued
certificate QR codes remain verifiable. Local development may omit these values,
but generated secrets are not stable across server restarts.
Set `FRONTEND_ORIGIN` and, when needed, comma-separated `FRONTEND_ORIGINS` to
the trusted browser origins. Set `TRUST_PROXY` only to the backend's known
reverse-proxy hop count or trusted proxy addresses.

## Vercel deployment

The repository root contains `vercel.json`; Vercel serves `frontend\` as the
static output and routes `/api` requests through the Express serverless
handlers. The handlers wait for the database initialization promise and do not
start a persistent HTTP listener. Vercel sets `VERCEL_URL`; set
`FRONTEND_ORIGIN` to the production custom-domain origin and configure a
pooled PostgreSQL `DATABASE_URL` plus the signing and payment secrets in the
Vercel project environment.

Production configuration requires `STORAGE_DRIVER=s3` and the
`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`
settings. Use a private bucket for master audio, stems, samples, and
certificates. Set `PUBLIC_MEDIA_BASE_URL` only to a CDN or public prefix for
catalogue artwork and preview audio. The project fails startup if production
would otherwise use ephemeral local storage. Do not set
`ALLOW_EPHEMERAL_STORAGE=true` on a deployment that stores customer media.
Before switching an existing installation from local storage, run
`npm run storage:migrate` from `backend\` while the source files and destination
bucket are both accessible. The copy is resumable and verifies the checksum of
objects already present. Do not run multiple copies concurrently; pause uploads
for the final copy and run `npm run storage:audit` before cutover.

Vercel functions do not run the email polling worker. Run
`npm run email:worker --prefix backend` in a persistent worker service with
the same database and email environment variables. Web startup only queues
messages. The worker claims messages through the database outbox, so multiple
worker instances can safely compete for pending work.

Run `node backend/database.js` as a deployment migration step before routing
traffic to a release. Startup also applies pending migrations under a
PostgreSQL advisory lock as a safety net. Deployments must retain the
`api/` handlers and static `frontend/` directory; do not configure a separate
API origin in the browser. The shared rate limiter requires the migrated
`rate_limit_buckets` table. The PostgreSQL pool defaults to three connections
per Vercel function instance; tune `DB_POOL_MAX` only with the database
provider's aggregate connection limit in mind.

The platform's function request-size limits may be lower than the API's
configured upload limits. Verify large administrator uploads against the
selected Vercel plan; if they exceed the provider's limit, use a direct
object-storage upload flow rather than increasing Express body limits.

## Route integration tests

The route integration suite requires a local PostgreSQL server and a dedicated
`slaughterhouse_route_test` database. It applies the backend migrations and
clears application tables in that database before exercising every registered
API route method. Never point `TEST_DATABASE_URL` at a development or production
database; the suite refuses non-local hosts and other database names.

In PowerShell, configure the test connection and run the suite:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://ultbigboy_app:local-test-password@127.0.0.1:5432/slaughterhouse_route_test'
npm run test:integration
```

The ordinary `npm test` run skips the integration case when `TEST_DATABASE_URL`
is not set.
Email delivery uses `EMAIL_API_KEY` and
`EMAIL_FROM`. The Paystack and email settings can remain unset for local
database-only development.

Apply pending migrations (also safe to repeat) from `backend\`:

```powershell
node database.js
```

The command reports success only after every pending migration completes.
Inspect applied versions with:

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY version;
```

Starting the API with `node server.js` also applies pending migrations before
serving requests. Keep schema changes in a new, incrementing migration; never
edit a migration that has already been applied to a shared database. The
legacy SQLite import utility reads `SQLITE_SOURCE_PATH` and imports rows into
PostgreSQL after the schema migrations have run.

Automated tests cover the pure service layer (booking rules, download tokens,
input validation, password hashing, pricing, and migration structure) with
Node's built-in test runner, so no extra dependency is required:

```powershell
node --test "test/*.test.js"
```

Use `npm test` instead when local PowerShell script execution is enabled.

## Browser workflow tests

The Playwright suite serves the static frontend on `127.0.0.1:4173` and mocks
API responses in the browser. It exercises signup, login, search, cart,
checkout, booking, reviews, and administrator review approval without using a
database, real customer accounts, or a payment provider.
It also runs axe-core WCAG 2.1 A/AA scans on key storefront pages, the
administrator dashboard, and account dialog, and checks storefront and
administrator layouts for horizontal overflow at 360, 768, 1024, and 1440 px.

Install the Chromium test browser once, then run from `backend\`:

```powershell
npx playwright install chromium
npm run test:browser
```

The browser suite is separate from `npm test` and the PostgreSQL route integration
suite.

Login sessions, password reset tokens, and email verification tokens are stored
hashed and are single-use or expiry-controlled. Login responses also set
HttpOnly, SameSite cookies; bearer tokens remain temporarily supported during
the frontend migration. Customer sign-in and customer sessions require a
verified email address; unverified customers can request another verification
email from the sign-in form. Administrator sign-in is unchanged.

Authorization middleware distinguishes visitors, customers (`artist` and
`non_artist` accounts), administrators, and super-administrators. Existing
administrator routes permit both admin roles; license-definition changes
require the `admin:manage_license_rights` permission, and staff-role and
business-price changes require super-admin permissions. Public health and
catalog routes identify anonymous requests as visitors. Bootstrap the first
trusted `super_admin` through a controlled database administration process;
public signup cannot create administrator roles. Super-admin staff changes
are audited, cannot change the active super-admin's own role or demote the last
super-admin, and revoke the target user's existing sessions.

Transactional email uses Resend over HTTPS without an additional package. Set
`EMAIL_API_KEY` and a Resend-verified `EMAIL_FROM` address in `backend/.env`.
Run `node database.js` to apply migration 15, which creates the durable
`email_outbox` table. The server polls queued messages every five seconds,
retries delivery with exponential backoff up to eight attempts, and records
permanent failures without marking them sent. With email credentials unset, the
worker remains idle and queued messages are preserved. Verification and reset
links expire from the outbox when their corresponding tokens expire; successful,
expired, and permanently failed records have their message payload cleared.
Pending message payloads contain the one-time action URL needed for delivery,
so keep database access restricted.

Verification and password-reset links open the frontend and submit the token
through the existing POST account endpoints. New accounts receive separate
welcome and verification messages. Beat buyers receive a license-issued email
in addition to their receipt after payment settlement. Receipt and booking-
confirmation messages are queued with payment settlement; refund messages and
manual-review alerts are queued with refund processing. Admin booking
cancellations also queue a customer cancellation notice. Delivery is performed
by the outbox worker after the business transaction commits. Administrators can
review the latest delivery states and sanitized errors through
`GET /api/admin/email-deliveries`.

Administrator alerts cover paid orders and bookings, new reviews, low
merchandise stock, failed Paystack payments, and refunds requiring review.
`GET /api/admin/notifications` returns the signed-in administrator's inbox and
unread count. `PATCH /api/admin/notifications/:id/read` and
`PATCH /api/admin/notifications/:id/unread` toggle read state; customer
notifications support the same read/unread state. Migration 16 adds an optional
unique deduplication key so retried webhooks do not duplicate alerts.

Authenticated customers can read and update their profile through
`GET /api/auth/profile` and `PATCH /api/auth/profile`. Customer profile APIs
cannot change account email addresses or roles.

Beat catalog data is served by `GET /api/beats` with search, genre, mood, key,
BPM, sorting, and pagination filters. `GET /api/beats/:id` returns beat details
and server-side license-price fallbacks from PostgreSQL settings.

Authenticated wishlist endpoints are `GET /api/wishlists`, `POST
/api/wishlists/:beatId`, and `DELETE /api/wishlists/:beatId`.

Exclusive beat licenses are checked against paid orders both when checkout is
initialized and again before payment verification marks an order paid.

Administrators may provide `previewDurationSeconds` when uploading a beat.
Catalog responses include that duration plus server-generated `coverUrl` and
`previewUrl` values that point at the configured media provider, and
`GET /api/merchandise` returns a matching `photoUrl`.

The purchasable merchandise catalog is served from PostgreSQL through
`GET /api/merchandise`; the storefront loads titles, descriptions, prices,
images, and stock from this API. Featured coming-soon artwork is promotional
content and is not offered for purchase as a catalog product.

Administrators can manage catalog visibility with
`PATCH /api/admin/beats/:id/status`, using `published`, `unpublished`, or
`archived`. Only published beats appear in public catalog endpoints.
Beat metadata and prices can be edited with `PATCH /api/admin/beats/:id`.
License definitions use the `license_rights` table for rights and
`license_definition_status` for availability. Administrators can view them with
`GET /api/admin/license-definitions`. A super-administrator can update a
definition with
`PUT /api/admin/license-rights/:type` (`basic`, `premium`, `unlimited`, or
`exclusive`), including allowed formats, commercial-use and distribution
flags, named non-negative integer usage limits (`null` means unlimited), and
distribution rules. The same administrator can activate a built-in tier with
`POST /api/admin/license-definitions`, deactivate it with
`PATCH /api/admin/license-definitions/:type/status`, or delete its custom
rights and deactivate it with `DELETE /api/admin/license-definitions/:type`.
Only active tiers are shown in the public beat catalog and accepted at checkout.
Changes apply to new purchases; each purchased license keeps its `rights_json`
snapshot, which remains authoritative for its downloads and certificate.

Verified payments populate normalized order items, provider payment records, and
customer-linked beat licenses with rights metadata. Customers can retrieve
`GET /api/customer/purchases`, `GET /api/customer/licenses`, and
`GET /api/customer/downloads`. Download links require the signed token, a paid
order, and the matching authenticated customer account; authorized downloads
are recorded in `download_events`.
Paid customers can download a reproducible PDF certificate for an owned license
through `GET /api/customer/licenses/:id/certificate`.

Authenticated customers can also retrieve order history, booking history, and
in-app notifications through `GET /api/customer/orders`,
`GET /api/customer/bookings`, and `GET /api/customer/notifications`. Notification
records are created idempotently for verified payments, issued licenses, booking
confirmation, and administrator booking-status changes.

Custom requests submitted with an account email are linked to that customer.
Customers can retrieve them through `GET /api/customer/requests`; administrators
can transition requests through `PATCH /api/admin/requests/:id/status` with an
optional quote and internal notes. Status changes are audited and create an
in-app customer notification when the request belongs to a registered account.

Customer reviews require an authenticated customer session and are rate limited.
Administrators can approve, reject, or remove reviews with
`PATCH /api/admin/reviews/:id/status`; only approved reviews are public. Review
moderation actions are recorded in the audit log.
Migration 17 explicitly defines the customer review schema and adds an index
for status-filtered review listings. Migration 0 creates the baseline review
table for new installations; the numbered upgrades preserve existing records.

Administrators can review recent activity through the protected
`GET /api/admin/audit-logs` endpoint, optionally filtered by an action name and
limited to 100 records.

Administrators can export up to 5,000 orders as CSV through the protected
`GET /api/admin/orders.csv` endpoint.

The admin dashboard includes customer and staff views, database-backed business
pricing settings, and date-filtered reports. `GET /api/admin/reports` and
`GET /api/admin/reports.csv` accept optional `from` and `to` dates in
`YYYY-MM-DD` format (maximum 366 days when both are supplied); CSV exports
contain up to 5,000 orders. Super-admins manage user roles through
`GET /api/admin/staff` and `PATCH /api/admin/staff/:id/role`. Business settings
are read through `GET /api/admin/settings` and edited by super-admins with
`PUT /api/admin/settings`; only the known booking fees, custom-beat license
prices, and default beat license prices are writable. Audit history supports
exact action, text, and date filters through `GET /api/admin/audit-logs`.
Destructive review removal, beat archival, booking cancellation, slot removal,
role changes, and business-price edits prompt for confirmation in the admin UI;
the API independently enforces role permissions and validates each change.

Customers can view payment and fulfillment status in `GET
/api/customer/orders`. Each order includes its line items and fulfillment
status history. Administrators update merchandise fulfillment through
`PATCH /api/admin/orders/:reference/fulfillment`; changes and actor IDs are
recorded transactionally in `order_fulfillment_history` (migration 18).

Paystack `POST /api/payments/webhook` validates the `x-paystack-signature`
HMAC, records webhook deliveries idempotently, and reconciles successful
non-booking orders. Booking payments use an atomic slot reservation from
initialization through verification. A booking slot is reserved with its pending
order before Paystack initialization, and each reservation expires after 30 minutes.
Failed or abandoned payments release their holds immediately; timed-out holds
are released when availability is checked or another booking attempts the slot.
Successful payment consumes the matching hold. Pending provider payments are
recorded during initialization, and non-success webhook events update
payment/order status without unlocking paid entitlements. Successful orders write one sales row per order line, keyed by
`order_reference` and `line_index`, so retried verifications or webhook
deliveries cannot double-count revenue.

The server initializes Paystack transactions from database-validated catalog
items and verifies completion directly with Paystack before changing order,
license, booking, stock, sales, or notification state. Failed and abandoned
events mark eligible orders accordingly and notify customers with registered
accounts and administrators. Processed refund events and reversed charges
update refund totals; full refunds/reversals revoke licenses, restore stock only
for unfulfilled merchandise, and free booking slots. Partial refunds retain
entitlements. Late success events cannot re-settle refunded or already-settled
orders.

Administrators can transition paid bookings with
`PATCH /api/admin/bookings/:id/status` using `paid`, `confirmed`, `completed`,
`cancelled`, or `rescheduled`, with optional notes; each change is audited
with the previous and new status.

Administrators can reserve or block public booking slots with
`POST /api/admin/bookings/availability` and remove unreserved overrides with
`DELETE /api/admin/bookings/availability`. Paid slots cannot be overwritten.

Merchandise stock is nullable: `NULL` means unlimited stock. Public merchandise
responses expose `stockQuantity`; administrators can update it with
`PATCH /api/admin/merchandise/:id/inventory`. Verified orders decrement finite
stock atomically and fail when inventory is exhausted.

The frontend stores only the selected preview position and volume locally. It
does not autoplay restored previews.

New passwords use Node's built-in asynchronous scrypt implementation with
memory-hard parameters. Existing legacy scrypt hashes remain readable during
the migration and are not exposed in API responses.
When email delivery is not configured, local development responses expose a token
when `NODE_ENV` is not `production`, while production responses never expose tokens.

Authentication and administrator routes are rate-limited by client IP. The limiter
is intentionally local to each process; deploy behind a shared gateway or move
the bucket store to a shared service when running multiple instances.

Administrator accounts are stored in the PostgreSQL `users` table. Set a user's
`role` to `admin` to allow access to the administrator login; administrator
credentials are not read from environment variables. Withdrawal confirmation
uses the authenticated administrator's account password.

## Production secret rotation checklist

- Never put production secret values in source control, support tickets, or logs.
  Update the deployment's secret store and restart the API after each change.
- **Paystack:** create or rotate the API key in Paystack, update
  `PAYSTACK_SECRET_KEY`, verify a test transaction and webhook, then revoke the
  old key.
- **Email:** create a replacement provider API key, update `EMAIL_API_KEY`, send
  a test transactional email, then revoke the old key. Update `EMAIL_FROM` only
  when the verified sender changes.
- **Database:** create a replacement database credential with the same required
  privileges, update `DATABASE_URL`, verify the API and
  migrations connect, then revoke the old credential.
- **Downloads:** replace `DOWNLOAD_SIGNING_SECRET` with a distinct value of at
  least 32 bytes. Existing signed download links will stop validating; issue
  fresh links as needed.
- **Certificates:** replace `CERTIFICATE_SIGNING_SECRET` with a value distinct
  from the download secret and at least 32 bytes. Existing certificate
  verification signatures will no longer validate, so plan certificate
  reissuance before rotating it.
- Confirm all new values are in the deployment secret store, not a checked-in
  `.env` file, and remove old values from the provider after the new
  configuration is verified.

## Health, monitoring, and recovery

The public liveness and readiness endpoints, administrator-only dependency and
metrics endpoints, and database backup/restore/verification procedures are
documented in [`docs/operations.md`](../docs/operations.md).
Security headers, CORS, CSRF, access-control, storage, and verification details
are documented in [`docs/security.md`](../docs/security.md).
