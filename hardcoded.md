# Hardcoded values and rules

This inventory covers fixed business rules, runtime defaults, security limits,
and third-party endpoints found in the application source. It does not attempt
to catalog every UI phrase, HTML attribute, protocol constant, CSS dimension,
test fixture, generated asset, or database-schema value. Those literals are
not runtime configuration. Values described as "configurable" still have
fixed bounds or fallback behavior noted here.

## Money and currency

| Fixed value or rule | Where it is used | Notes |
| --- | --- | --- |
| Beat prices use USD as the base currency. The storefront conversion map is `USD: 1`, `GHS: 10`, `GBP: 0.79`. | [`frontend/script.js`](./frontend/script.js#L914) | These display conversion rates are hardcoded. GHS `10` is not the Admin-managed USD/GHS rate and can show an inaccurate storefront price. Merchandise prices in GHS are divided by the same GHS rate when added to cart. |
| Storefront display currency options are GHS, USD, and GBP; default cart display is USD. | [`frontend/index.html`](./frontend/index.html#L90), [`frontend/beats.html`](./frontend/beats.html#L67), [`frontend/script.js`](./frontend/script.js#L932) | Currency symbols are also fixed in `frontend/script.js`. |
| Paystack checkout and booking charges use GHS. | [`backend/routes/payments.js`](./backend/routes/payments.js), [`backend/routes/bookings.js`](./backend/routes/bookings.js) | The actual USD/GHS checkout rate is read from Admin Settings, required to be greater than zero and less than 1,000,000, and must be at most six decimal places. |
| The Admin-managed USD/GHS rate expires after 24 hours; update timestamps up to 5 minutes in the future are tolerated. | [`backend/services/pricing.js`](./backend/services/pricing.js#L16) | Stale or missing rates block beat checkout. Orders keep the exchange-rate snapshot. |
| The integration-test fixture seeds an exchange rate of `10`. | [`backend/test/routes.integration.test.js`](./backend/test/routes.integration.test.js#L338) | Test data only; it is not the production checkout rate. |
| EP/Album booking price is full-production fee × song count × `0.8` (20% discount); song count is 1–12. | [`backend/services/booking.js`](./backend/services/booking.js#L12), [`backend/routes/bookings.js`](./backend/routes/bookings.js#L60) | Base service fees are Admin-managed. The discount percentage and maximum song count are fixed in code. |
| Merchandise low-stock notification threshold is 5 units. | [`backend/routes/payments.js`](./backend/routes/payments.js#L22) | Fixed alert threshold. |

## Booking policy

| Fixed value or rule | Where it is used | Notes |
| --- | --- | --- |
| Reservation hold duration is 30 minutes. | [`backend/services/booking-reservations.js`](./backend/services/booking-reservations.js#L1) | An order can confirm only slots still held by that order and not yet expired. |
| Booking timezone is `Africa/Accra`; each session must be 140 minutes. | [`backend/routes/bookings.js`](./backend/routes/bookings.js#L57), [`frontend/booking.html`](./frontend/booking.html#L243) | Both values are validated by the backend. |
| Booking days are Sunday, Tuesday, Wednesday, Thursday. | [`backend/services/booking.js`](./backend/services/booking.js#L22) | The weekday set is fixed. |
| Booking hours are 11:00–21:00; slots must end by 21:00. | [`backend/services/booking.js`](./backend/services/booking.js#L29) | Start/end policy is fixed. |
| An EP/Album booking requires `ceil(song count / 2)` slots. | [`backend/routes/bookings.js`](./backend/routes/bookings.js#L62) | Fixed slot-count rule. |
| Booking payment methods are `card` and `mobile_money`. | [`backend/routes/bookings.js`](./backend/routes/bookings.js#L55) | Paystack channel selection is restricted to these options. |
| Booking service identifiers and labels are fixed in backend configuration. | [`backend/config.js`](./backend/config.js#L134) | Fees for supported services are settings-managed; adding a new service requires code changes. |

## Authentication and security limits

| Fixed value or rule | Where it is used | Notes |
| --- | --- | --- |
| Session lifetime is 8 hours. | [`backend/config.js`](./backend/config.js#L128) | Cookie lifetime is derived from this value. |
| Admin MFA uses 6-digit TOTP codes, a 30-second period, SHA-1, and a ±1 period acceptance window. | [`backend/services/admin-mfa.js`](./backend/services/admin-mfa.js#L4), [`backend/routes/auth.js`](./backend/routes/auth.js) | Protocol and tolerance values are fixed. |
| MFA challenges last 10 minutes; at most 5 failed code attempts are allowed. | [`backend/routes/auth.js`](./backend/routes/auth.js#L33) | The challenge is deleted at the attempt limit. |
| Shared rate limits: signup 30 requests per 15 minutes; customer/admin login 10 per 15 minutes; verification/resend/reset 5 per 15 minutes; admin MFA verification/completion 10 per 15 minutes. | [`backend/routes/auth.js`](./backend/routes/auth.js#L27) | Limits are fixed in code. The additional per-process login failure counter also blocks at 10 failed logins per IP per 15 minutes. |
| Shared rate limits: payment initialization 20 per 15 minutes; payment verification 30 per minute; webhook 300 per minute. | [`backend/routes/payments.js`](./backend/routes/payments.js#L23) | Fixed in code. |
| Shared rate limits: booking payment initialization 20 per 15 minutes; certificate routes 60 per minute. | [`backend/routes/bookings.js`](./backend/routes/bookings.js#L14), [`backend/routes/certificates.js`](./backend/routes/certificates.js#L25) | Fixed in code. |
| Download authorization tokens expire after 15 minutes. | [`backend/services/downloads.js`](./backend/services/downloads.js#L12) | Token lifetime is fixed. |
| Email verification tokens expire after 24 hours; password reset tokens after 1 hour. | [`backend/services/account-tokens.js`](./backend/services/account-tokens.js#L3) | Fixed in code. |

## Uploads, requests, and email delivery

| Fixed value or rule | Where it is used | Notes |
| --- | --- | --- |
| JSON/request body limits: webhook 1 MB, admin media 150 MB, custom requests 20 MB, general requests 256 KB. | [`backend/middleware/request-body.js`](./backend/middleware/request-body.js#L3) | Fixed parser limits. |
| Image uploads: JPG/JPEG, PNG, WebP; maximum 5 MB. Audio uploads: MP3, WAV, OGG, M4A, MP4; maximum 25 MB. | [`backend/services/uploads.js`](./backend/services/uploads.js#L29) | Both filename extension/MIME and file signatures are checked. |
| Email worker: 8 attempts maximum, batches of 10, polls every 5 seconds, and reclaims a processing lease after 10 minutes. | [`backend/services/email/outbox.js`](./backend/services/email/outbox.js#L6) | Retry delay starts at 30 seconds, doubles per attempt, and caps at 1 hour. |
| Email verification messages expire after 24 hours; password reset messages after 1 hour. | [`backend/services/email/outbox.js`](./backend/services/email/outbox.js#L29) | Matches the account-token lifetimes. |
| Generic text length defaults to 255 characters; phone strings allow 7–30 characters. | [`backend/services/input-validation.js`](./backend/services/input-validation.js#L2) | Many individual routes override field limits. |

## Runtime defaults and external endpoints

| Fixed value or rule | Where it is used | Notes |
| --- | --- | --- |
| Local API port defaults to 3000; local frontend origin defaults to `http://localhost:5500`; API URL also falls back to `http://localhost:<PORT>`. | [`backend/config.js`](./backend/config.js#L5), [`frontend/api-config.js`](./frontend/api-config.js#L4) | Environment variables override the backend defaults. The browser fallback is for local development. |
| Storage defaults to `local`; production requires `s3` unless `ALLOW_EPHEMERAL_STORAGE=true`. | [`backend/config.js`](./backend/config.js#L73) | The default is not suitable for durable production uploads. |
| Paystack API origin is `https://api.paystack.co`. | [`backend/routes/payments.js`](./backend/routes/payments.js) | API host is fixed; credentials are environment-configured. |
| Currency flags are fetched from `flagcdn.com`; stylesheet fonts are fetched from Google Fonts. | [`frontend/index.html`](./frontend/index.html#L91), [`frontend/beats.html`](./frontend/beats.html#L68), [`frontend/style.css`](./frontend/style.css#L1) | Third-party URL references are embedded in frontend source. |
| CORS recognizes `localhost` and `127.0.0.1` as local aliases. | [`backend/services/cors-origin.js`](./backend/services/cors-origin.js#L1) | Local-development behavior. |

## Highest-priority cleanup

1. Replace the storefront's hardcoded currency conversion map with a
   server-provided display-rate source (or clearly label it as an approximate
   display-only conversion). Its GHS value currently differs from the
   Admin-managed checkout rate.
2. Decide which business/security policies should be editable configuration:
   booking hours, weekdays, session length, hold duration, EP/Album discount,
   currency display rates, rate limits, and low-stock threshold.
3. Keep protocol/security requirements (for example TOTP format, upload
   signature checks, and token signing algorithms) fixed unless a deliberate
   standards change is made.
