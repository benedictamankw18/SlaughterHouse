# Security controls

This document describes the security controls implemented by the API and the
operational settings required to use them safely. Operational recovery
procedures are in [`operations.md`](operations.md); local setup and test
commands are in [`../backend/README.md`](../backend/README.md).

## Request boundary

- The API emits a restrictive Content Security Policy, frame protections,
  `nosniff`, same-origin opener policy, same-site resource policy, referrer and
  permissions policies. HSTS is enabled in production.
- CORS allows only `FRONTEND_ORIGIN` and the optional `FRONTEND_ORIGINS` list.
  Production rejects opaque `Origin: null` requests. Mutations with an Origin
  or Referer must match the configured frontend allowlist.
- Cookie-authenticated unsafe methods require `X-CSRF-Token` matching the
  hash stored for the session. Login responses return the token; the browser
  stores it in session storage. Bearer-authenticated requests do not rely on
  ambient cookies and do not require this header. Paystack webhooks are
  authenticated by their HMAC signature.
- JSON request bodies are limited to 256 KB by default, 35 MB for administrator
  catalog uploads, 20 MB for custom requests, and 1 MB for the raw payment
  webhook. URL-encoded bodies are not enabled. HTTP request and header timeouts
  are set by the server bootstrap.
- Configure `TRUST_PROXY` only for the known proxy path. Do not set it to
  `true` unless every request is guaranteed to pass through the trusted proxy.

## Authentication and authorization

Session and CSRF tokens are random values; only their SHA-256 hashes are stored
in the database. Customer sessions require verified email. Administrator
accounts must be provisioned by a trusted operator; public signup cannot
assign administrator roles. Ordinary administrators can use admin read/write
permissions, while role, license-rights, and business-setting management is
restricted to super-admins.

The route integration suite executes the registered API methods with anonymous
requests and test sessions against a dedicated local MySQL database. Unit tests
assert the visitor/customer/admin/super-admin permission matrix. Do not use
production or development databases for integration tests.

## File access

Uploads and certificates are stored outside the frontend web root. The public
uploads endpoint serves only uniquely named `cover-`, `merchandise-`, and
`preview-` assets. Master audio and stems are served only through
customer-authenticated, signed download flows. Request sample audio requires
administrator authentication. Do not expose the backend data directories
through a reverse proxy or static-file server.

The current provider is local filesystem storage. A private object-storage
provider has not been configured; secure the host filesystem and backups
accordingly.

## Secrets and logging

Provide credentials through the deployment secret store or an untracked local
environment file. Production requires distinct `DOWNLOAD_SIGNING_SECRET` and
`CERTIFICATE_SIGNING_SECRET` values, each at least 32 bytes. Rotating the
download key invalidates signed downloads; rotating the certificate key
invalidates existing certificate verification signatures. Follow the
[`backend README rotation checklist`](../backend/README.md#production-secret-rotation-checklist)
before rotating them.

Structured logs redact common credential fields and token/key patterns. Avoid
logging request bodies, raw cookies, authorization headers, payment secrets,
or customer-upload contents. The tracked-file scan is a regression check, not
a replacement for reviewing secret-store access or scanning repository
history.

## Verification commands

Run from `backend\`:

```powershell
npm test
npm run test:integration
npm run test:browser
npm audit
npm run check:secrets
```

`test:integration` requires `TEST_MYSQL_URL` to point to a dedicated local
`slaughterhouse_route_test` schema. The suite rejects non-local hosts and other
schema names; it clears application tables in the test schema.

Browser tests stub API responses and payment redirects. The accessibility
suite runs axe-core checks for WCAG 2.1 A/AA on key storefront and admin
surfaces. Responsive checks assert no horizontal overflow at representative
mobile, tablet, laptop, and desktop viewport widths.

## Remaining deployment decisions

- Configure private object storage before moving user data to a deployment
  where local disk is ephemeral or shared across multiple instances.
- Use a shared rate-limit store or trusted gateway when running multiple API
  instances; the in-process limiter does not coordinate across replicas.
- Configure regular encrypted backups and perform documented scratch-database
  restore tests before relying on backups for recovery.
