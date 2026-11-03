# Backend structure

The backend is organized by responsibility:

- `server.js` - HTTP bootstrap, middleware, router registration, and error handling
- `config.js` - environment-backed runtime configuration
- `database.js` - MySQL connection and schema initialization
- `services/migrations.js` - versioned MySQL schema migrations
- `session-store.js` - database-backed session creation and authorization middleware
- `routes/auth.js` - customer and administrator authentication
- `routes/public.js` - health, reviews, merchandise, user count, and public uploads
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

Database initialization creates the legacy tables required by the current
application, then applies numbered migrations recorded in `schema_migrations`.
Run `node database.js` after pulling schema changes; existing rows are preserved.

Login sessions, password reset tokens, and email verification tokens are stored
hashed and are single-use or expiry-controlled. Login responses also set
HttpOnly, SameSite cookies; bearer tokens remain temporarily supported during
the frontend migration.

Authenticated customers can read and update their profile through
`GET /api/auth/profile` and `PATCH /api/auth/profile`. Email and role changes
remain restricted to administrator workflows.

Beat catalog data is served by `GET /api/beats` with search, genre, mood, key,
BPM, sorting, and pagination filters. `GET /api/beats/:id` returns beat details
and server-side license-price fallbacks from MySQL settings.

Authenticated wishlist endpoints are `GET /api/wishlists`, `POST
/api/wishlists/:beatId`, and `DELETE /api/wishlists/:beatId`.

Exclusive beat licenses are checked against paid orders both when checkout is
initialized and again before payment verification marks an order paid.

Administrators may provide `previewDurationSeconds` when uploading a beat.
Catalog responses include that duration and a server-generated `previewUrl`.

Administrators can manage catalog visibility with
`PATCH /api/admin/beats/:id/status`, using `published`, `unpublished`, or
`archived`. Only published beats appear in public catalog endpoints.
Beat metadata and prices can be edited with `PATCH /api/admin/beats/:id`.

The frontend stores only the selected preview position and volume locally. It
does not autoplay restored previews.

New passwords use Node's built-in asynchronous scrypt implementation with
memory-hard parameters. Existing legacy scrypt hashes remain readable during
the migration and are not exposed in API responses.
Email delivery is not configured yet; local development responses expose a token
when `NODE_ENV` is not `production`, while production responses never expose tokens.

Authentication and administrator routes are rate-limited by client IP. The limiter
is intentionally local to each process; deploy behind a shared gateway or move
the bucket store to a shared service when running multiple instances.

Administrator accounts are stored in the MySQL `users` table. Set a user's
`role` to `admin` to allow access to the administrator login; administrator
credentials are not read from environment variables. Withdrawal confirmation
uses the authenticated administrator's MySQL password.
