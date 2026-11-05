# Backend structure

The backend is organized by responsibility:

- `server.js` - HTTP bootstrap, middleware, router registration, and error handling
- `config.js` - environment-backed runtime configuration
- `database.js` - MySQL connection and schema initialization
- `services/migrations.js` - versioned MySQL schema migrations
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
- `services/downloads.js` - signed download token generation and verification
- `services/account-tokens.js` - hashed, expiring password-reset and email-verification tokens
- `services/email/` - Resend sender, transactional templates, and retryable email outbox
- `services/audit.js` - safe audit-event recording without passwords or tokens
- `services/rate-limit.js` - endpoint rate limiting for authentication and administration

Run the API from this directory:

```powershell
node server.js
```

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
the public catalog is served by `GET /api/stream-releases`.

## Local MySQL setup

Install and start MySQL 8 or a compatible MariaDB server. Create a database and
a dedicated local application user using the MySQL client:

```sql
CREATE DATABASE ultbigboy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ultbigboy_app'@'localhost' IDENTIFIED BY 'change-this-password';
GRANT ALL PRIVILEGES ON ultbigboy.* TO 'ultbigboy_app'@'localhost';
```

From `backend\`, copy `.env.example` to `.env` and set `DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_PASSWORD`, and `DB_NAME`. Use either these `DB_*` values or
`MYSQL_URL`, not both. `PORT` and `NODE_ENV` configure the API runtime.
Payment and download configuration uses `PAYSTACK_SECRET_KEY`,
`PAYMENT_CALLBACK_URL`, `API_PUBLIC_URL`, `FRONTEND_ORIGIN`, and
`DOWNLOAD_SIGNING_SECRET`. Set a separate stable `CERTIFICATE_SIGNING_SECRET`
for certificate verification links and keep it unchanged so issued certificate
QR codes remain verifiable; `DOWNLOAD_SIGNING_SECRET` is used as a fallback.
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
legacy SQLite import utility reads `SQLITE_SOURCE_PATH` and is separate from
MySQL schema migration.

Automated tests cover the pure service layer (booking rules, download tokens,
input validation, password hashing, pricing, and migration structure) with
Node's built-in test runner, so no extra dependency is required:

```powershell
node --test "test/*.test.js"
```

Use `npm test` instead when local PowerShell script execution is enabled.

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
and server-side license-price fallbacks from MySQL settings.

Authenticated wishlist endpoints are `GET /api/wishlists`, `POST
/api/wishlists/:beatId`, and `DELETE /api/wishlists/:beatId`.

Exclusive beat licenses are checked against paid orders both when checkout is
initialized and again before payment verification marks an order paid.

Administrators may provide `previewDurationSeconds` when uploading a beat.
Catalog responses include that duration and a server-generated `previewUrl`.

The purchasable merchandise catalog is served from MySQL through
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
non-booking orders. Booking payments continue through the slot-reserving
verification path. Pending provider payments are recorded during initialization,
and non-success webhook events update payment/order status without unlocking
the order. Successful orders write one sales row per order line, keyed by
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

Administrator accounts are stored in the MySQL `users` table. Set a user's
`role` to `admin` to allow access to the administrator login; administrator
credentials are not read from environment variables. Withdrawal confirmation
uses the authenticated administrator's MySQL password.
