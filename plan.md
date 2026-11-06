# SlaughterHouse / UltBigBoy Implementation Plan

Source: [SRS](./srs)

## 1. Current Baseline

The project currently has:

- A consolidated static frontend in `frontend/`.
- An Express backend in `backend/`.
- MySQL schema initialization in `backend/database.js`.
- Modular API routers under `backend/routes/`.
- Modular services for authentication, pricing, bookings, uploads, downloads, and security.
- Customer and administrator login flows.
- Database-backed users, beats, merchandise, orders, bookings, reviews, and settings.
- Paystack payment initialization and verification.
- Signed download links for paid beat orders.

The existing implementation should be preserved while the SRS features are completed.

## 2. Delivery Principles

- MySQL is the production source of truth; do not hardcode business data.
- Keep HTTP routes in `backend/routes/`, business logic in `backend/services/`, and schema changes in `backend/database.js` or migrations.
- Validate every request at the API boundary.
- Never trust prices, ownership, permissions, payment status, or file names from the browser.
- Do not expose master audio files through public routes.
- Keep customer and administrator authorization separate.
- Prefer incremental migrations and backwards-compatible API changes.
- Add automated tests before changing payment, download, authentication, or booking behavior.
- Keep the current frontend functional during each phase.

## 3. Phase 1 — Foundation and Data Model

### Tasks

- [x] Add explicit database migrations for all SRS entities:
  - [x] Users and roles.
  - [x] Beats and per-license pricing.
  - [x] Merchandise variants and categories.
  - [x] Orders and order items.
  - [x] Payments and provider references.
  - [x] Booking availability.
  - [x] Reviews.
  - [x] Licenses.
  - [x] Audit logs.
  - [x] Notifications.
  - [x] Wishlists.
  - [x] Password-reset and email-verification token storage.
- [x] Add foreign keys, indexes, unique constraints, and timestamps to the new tables.
- [x] Add a migration/version table so schema changes are repeatable.
- [x] Replace schema-altering startup logic with ordered migrations where practical.
- [x] Document local MySQL setup, environment variables, and migration commands.

### Acceptance

- A new database can be initialized from zero.
- Existing data survives migrations.
- Database constraints prevent duplicate emails, duplicate order references, invalid relationships, and duplicate booking slots.

## 4. Phase 2 — Authentication and Authorization

### Tasks

- [x] Keep customer and administrator login routes distinct.
- [x] Reject administrator accounts from customer login.
- [x] Add secure session persistence suitable for multiple backend instances.
- [x] Add secure, HttpOnly, SameSite session cookies while retaining temporary bearer compatibility.
- [x] Use a reviewed, memory-hard scrypt implementation for new password hashes while retaining legacy scrypt verification.
- [x] Add password reset flow with expiring, single-use tokens.
- [x] Add email verification storage and verification endpoint with expiring, single-use tokens.
- [x] Add customer profile viewing and editing with field validation.
- [x] Add role and permission middleware for visitor, customer, admin, and super-admin access.
- [x] Add rate limiting for login, signup, reset, and sensitive administrator routes.
- [x] Record login, logout, failed-login, password-reset, and email-verification audit events.
- [x] Record role-change audit events when role-management endpoints are added.

### Acceptance

- Customers cannot access administrator endpoints.
- Administrators cannot authenticate through the customer login route.
- Passwords and reset tokens are never logged or returned.
- Expired, reused, and invalid tokens are rejected.

## 5. Phase 3 — Beat Marketplace

### Tasks

- [x] Create database-backed beat listing and detail APIs.
- [x] Replace hardcoded `beats.html` cards with database-loaded results.
  The catalog markup now ships a loading placeholder and pagination is rendered from
  the `/api/beats` pagination metadata.
- [x] Add search, genre, mood, BPM, key, sorting, pagination, and empty-state data.
- [x] Return per-beat license prices with database defaults as fallback.
- [x] Add preview metadata including duration and preview-file URL.
- [x] Add persistent audio-player state for preview position and volume.
- [x] Replace homepage featured beats with database-loaded results.
- [x] Add wishlist support for authenticated customers.
- [x] Add exclusive-license locking so an exclusively licensed beat cannot be sold again.
- [x] Add admin create, publish, unpublish, and archive operations.
- [x] Add admin beat editing.
- [x] Add administrator dashboard controls for beat metadata, pricing, and catalog status.

### Acceptance

- Every displayed beat comes from MySQL.
- Checkout uses server-side prices only.
- Preview files are accessible, but master files are protected.
- Exclusive beats cannot be purchased after an exclusive sale.

## 6. Phase 4 — Licensing, Orders, and Downloads

### Tasks

- [x] Add normalized order and order-item records.
- [x] Add license records linked to customer, beat, order, and license type.
- [x] Move license rights, formats, usage limits, and distribution rules out of the
  hardcoded `licenseRights` map in `routes/payments.js` into database-backed,
  super-admin-editable definitions. Purchased definitions remain snapshotted in
  `licenses.rights_json`.
- [x] Generate a license certificate/PDF after verified payment.
- [x] Add customer purchase history, license history, and download history.
- [x] Make download authorization verify:
  - [x] Signed token.
  - [x] Paid order.
  - [x] Customer ownership.
  - [x] Product and license match.
  - [x] Allowed format.
  - [x] Token expiry.
- [x] Add download audit events and rate limits.

### Acceptance

- Failed or pending payments never unlock downloads.
- A token cannot be reused for another order, product, license, or format.
- Customers only receive formats included in their license.
- License records and certificates are reproducible from database data.

## 7. Phase 5 — Paystack Payments

### Tasks

- [x] Keep payment initialization and verification server-side.
- [x] Add Paystack webhook endpoint with signature verification.
- [x] Make webhook processing idempotent (`payment_webhook_events` unique key plus the
  order status guard).
- [x] Make verification-path writes idempotent — sales rows are keyed by
  `order_reference` and `line_index` (`uq_sales_order_line`) and written with
  `ON DUPLICATE KEY UPDATE`, so a retried verify cannot duplicate sales rows.
- [x] Store provider reference, request status, response status, amount, currency, and timestamps.
- [x] Reject placeholder or missing Paystack credentials before external requests.
- [x] Reconcile order amount and currency against the verified transaction.
- [x] Handle abandoned, failed, reversed, and refunded payments.
  Failed and abandoned events update pending order/payment state; processed
  refunds and reversals update refund totals and revoke access/restore eligible
  stock/free booking slots on full reversal. Partial refunds retain entitlements.
- [x] Send payment events to order, license, booking, analytics, and notification workflows.

### Acceptance

- A payment cannot be marked paid from browser input alone.
- Replaying a webhook does not duplicate orders, licenses, bookings, or sales.
- Invalid signatures and mismatched amounts are rejected and logged.

## 8. Phase 6 — Studio Booking

### Tasks

- [x] Add database-backed service definitions and booking fees.
- [x] Add availability and blocked-slot management for administrators.
- [x] Add availability API for the frontend calendar.
- [x] Validate service, duration, date, time, timezone, artist count, and slot structure.
- [x] Prevent double booking with a database uniqueness constraint during verified payment.
- [x] Add deposit/payment status and booking status transitions.
- [x] Add admin confirmation, cancellation, rescheduling, and notes.
- [x] Send customer booking confirmations and admin notifications.

### Acceptance

- Two concurrent requests cannot reserve the same slot.
- Unavailable slots cannot be selected.
- Paid bookings have a linked order/payment reference.
- Rescheduling preserves an audit trail.

## 9. Phase 7 — Merchandise Store

### Tasks

- [x] Move purchasable merchandise catalog items to the database-backed catalog API.
- [x] Add categories, variants, stock, SKU, shipping status, and product images.
- [x] Wrap merchandise stock reservation and order completion in a transaction.
  Payment verification and webhooks call order completion through the
  connection-scoped transaction runner, so stock, order, sales, payment, and
  entitlement writes roll back together on failure.
- [x] Prevent checkout when stock is insufficient.
- [x] Add admin inventory and fulfillment management.
- [x] Add customer order status and fulfillment history.

### Acceptance

- Product prices and stock are validated server-side.
- Concurrent orders cannot oversell inventory.
- Admins can update inventory without editing frontend code.

## 10. Phase 8 — Custom Requests and Reviews

### Tasks

- [x] Add request status workflow: new, reviewing, quoted, accepted, rejected, completed.
- [x] Store reference links, audio samples, preferred license, quote, and admin notes.
- [x] Add request ownership for authenticated customers.
- [x] Add review moderation workflow including removal.
- [x] Restrict public reviews to approved records.
- [x] Add spam/rate-limit controls.

### Acceptance

- Uploaded samples remain protected according to their access policy.
- Customers can view their own requests and statuses.
- Rejected or removed reviews never appear publicly.

## 11. Phase 9 — Customer Dashboard and Notifications

### Tasks

- [x] Build customer dashboard sections:
  - [x] Profile.
  - [x] Purchases.
  - [x] Orders.
  - [x] Licenses.
  - [x] Downloads.
  - [x] Bookings.
  - [x] Wishlist.
  - [x] Notifications.
- [x] Add verification, password-reset, order receipt, booking confirmation, refund/cancellation, and refund-review admin emails through a retryable Resend outbox.
- [x] Add separate welcome and license-issued emails.
- [x] Add admin notifications for orders, bookings, reviews, low stock, and failed payments.
- [x] Add notification read/unread state and admin email-delivery status.

### Acceptance

- Customers only see their own account data.
- Email failures are logged and do not falsely mark a message delivered.
- Important payment and booking events have an in-app record.

## 12. Phase 10 — Admin and Super-Admin Operations

### Tasks

- [x] Complete dashboard overview metrics and charts.
- [x] Add beat, license, merchandise, booking, order, customer, review, and settings modules.
- [x] Add date-filtered reports and CSV export.
- [x] Add super-admin staff management.
- [x] Add configurable business settings through the database.
- [x] Add audit-log search and administrator action history.
- [x] Add confirmation and authorization checks for destructive actions.

### Acceptance

- Admin dashboard uses live database data.
- Sensitive actions are audited with actor, target, action, and timestamp.
- Super-admin-only operations cannot be performed by regular admins.

## 13. Phase 11 — Frontend and UX

### Tasks

- [x] Replace remaining hardcoded catalog and content data with APIs.
- [x] Move the existing curated stream-release catalog into the database and serve it from `GET /api/stream-releases`.
- [x] Add administrator create, update, delete, activate, and deactivate workflows for stream releases.
- [x] Require fully paid orders for beat downloads, expire new beat licenses and downloads after one year, preserve existing license durations, and allow renewal through a new paid purchase.
- [x] Keep merchandise physical; no merchandise download access is provided.
- [x] Keep dark premium visual language, glass surfaces, typography, and artwork hierarchy.
- [x] Add responsive layouts for mobile, tablet, laptop, and desktop.
- [x] Fix the produced-page horizontal overflow found during narrow viewport checks.
- [x] Add keyboard navigation, visible focus, screen-reader labels, and reduced-motion behavior.
- [x] Add loading, empty, retry, and error states to every data-driven section. (Public storefront and customer account pages; admin dashboard states deferred.)
- [ ] Add SEO metadata, Open Graph tags, sitemap, canonical URLs, and structured data. (Descriptions, Open Graph/Twitter tags, structured data, robots rules, and runtime canonical URLs are done; XML sitemap and absolute canonical URLs are pending a production domain.)
- [x] Add page descriptions and basic Open Graph title/description metadata to the storefront catalog, stream, booking, and merchandise pages.
- [x] Optimize images, audio loading, caching, and lazy loading. (WebP hero images, lazy-loaded images with intrinsic dimensions, `preload="none"` audio, and upload `Cache-Control`.)
- [x] Use animation libraries only where they improve usability and performance. (No animation library added; hero rotation respects reduced motion and pauses on hidden tabs.)

### Acceptance

- No horizontal scrolling at supported viewport sizes.
- Core pages remain usable with keyboard and reduced motion.
- Page performance meets the under-three-second target on representative connections.
- No production page depends on hardcoded localhost URLs.

## 14. Phase 12 — Security, Reliability, and Operations

### Stage 1 — Repository and secret hygiene

- [x] Untrack uploads and certificates while preserving local files and `data/.gitkeep`.
- [x] Ignore local uploads, certificates, backups, logs, and environment files.
- [x] Move `sqlite3` to development dependencies and apply compatible audit fixes.
- [x] Require distinct production download and certificate signing secrets of at least 32 bytes.
- [x] Add the tracked-file secret scan and production secret-rotation checklist.
- [x] Restrict public uploads to approved assets and require admin authentication for sample audio.

### Stage 2 — Request hardening

- [x] Add security headers, production HSTS, and no-store for authenticated JSON.
- [x] Enforce a configurable frontend-origin CORS allowlist and mutation Origin/Referer checks.
- [x] Add session-bound, server-verified CSRF tokens for cookie-authenticated unsafe methods.
- [x] Add explicit global and route-specific JSON limits, disable URL-encoded input, and set server timeouts.
- [x] Configure Express proxy trust through the explicit `TRUST_PROXY` setting.
- [x] Add centralized JSON-body validation and error codes/request IDs.

### Tasks

- [x] Add centralized request validation and consistent error responses.
- [x] Add security headers, strict CORS, CSRF protection where cookies are used, and request limits.
- [x] Add structured logging with secret redaction and request IDs.
- [x] Add liveness, readiness, database, and admin-only dependency checks.
- [x] Add database backup/restore/verification scripts and forward-only migration recovery guidance; restore-to-scratch verification passed against the dedicated local route-test database.
- [ ] Move production file storage to private object storage.
- [x] Add process-local monitoring for payment failures, database errors, upload failures, and unauthorized/forbidden responses.
- [x] Review tracked files for secrets and rotate any exposed credentials (none detected).

### Stage 4 — Storage hardening (provider deferred)

- [x] Add a local storage provider with save, stream, delete, stat, and public-URL operations.
- [x] Route uploads, certificates, and licensed downloads through the storage interface.
- [x] Keep local files outside the frontend web root and restrict public access to approved artwork/preview prefixes.
- [x] Keep customer sample audio admin-authenticated and licensed masters behind authenticated download checks.
- [ ] Configure a private object-storage provider for production.

### Stage 5 — Verification and documentation

- [x] Test security headers, CORS, CSRF, JSON limits, readiness, log redaction, upload allowlisting, and the role permission matrix.
- [x] Document security controls and update the backend README.
- [x] Run JavaScript syntax checks, `npm test`, `npm audit --omit=dev`, and the tracked-file secret scan.
- [x] Resolve the development-dependency advisories by upgrading the dev-only SQLite migration dependency; `npm audit` reports 0 vulnerabilities.
- [x] Rerun MySQL route integration tests with `TEST_MYSQL_URL` set to the dedicated local test schema; all 90 registered API route methods passed.

### Acceptance

- Security review finds no unauthenticated admin/data access.
- Secrets are absent from source control and logs.
- Production uploads and downloads are private by default.
- Recovery procedures are documented and tested.

## 15. Testing Strategy

- [x] Unit-test validators, pricing fallback, booking slot validation, password hashing, and download token signing.
- [x] Unit-test database-backed license rights, editable definitions, and purchase snapshots.
- [x] Integration-test every registered API route method with the dedicated MySQL test database.
- [x] Unit-test customer/admin/super-admin permission boundaries.
- [x] Test duplicate signup, invalid JSON, malformed uploads, invalid payment methods, and invalid IDs.
- [x] Test Paystack success, failure, mismatch, duplicate webhook, and refund scenarios.
- [x] Test concurrent booking and inventory operations against MySQL.
- [x] Unit-test download token scoping across orders, products, licenses, formats, and expiry.
  Route-level authorization against a test database remains covered by the integration item above.
- [x] Add browser tests for signup, login, search, cart, checkout, booking, reviews, and admin workflows.
- [x] Run accessibility checks and responsive visual checks.

## 16. Recommended Execution Order

1. Database migrations and normalized order/license/payment tables.
2. Authentication/session hardening and role authorization.
3. Beat APIs and dynamic frontend catalog.
4. Payment webhooks, idempotency, orders, and licenses.
5. Protected downloads and license certificates.
6. Booking availability and conflict prevention.
7. Merchandise inventory and fulfillment.
8. Customer dashboard and notifications.
9. Admin reports, settings, and super-admin features.
10. UX, SEO, accessibility, performance, deployment, and final security review.

## 17. Definition of Done

The platform is ready for production when:

- All SRS-in-scope pages and API workflows are implemented.
- Authentication, authorization, payments, downloads, and bookings pass integration tests.
- All business data and prices come from MySQL or controlled migrations.
- The admin dashboard manages real records without hardcoded catalog data.
- Paystack webhooks are verified and idempotent.
- Master files are private and downloads verify ownership.
- Booking conflicts and inventory overselling are prevented transactionally.
- Accessibility, responsive, performance, and security acceptance checks pass.
- Deployment, environment, migration, backup, and recovery documentation is complete.
