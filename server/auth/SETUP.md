# Plus accounts and entitlement (WS3)

This branch does not provision or deploy anything. Checkout accepts only Stripe sandbox keys. Email addresses are used for sign-in and Stripe billing; no helper inputs or outputs are stored by WS3.

## Verify locally without credentials

Use the repo's Node version (Node 24 recommended for the built-in SQLite test adapter).

```sh
npm run type-check && npm run build
node --disable-warning=ExperimentalWarning --test server/auth/plus.test.mjs
# Until the WS2 tsconfig includes Pages Functions:
./node_modules/.bin/tsc --ignoreConfig --noEmit --strict --allowImportingTsExtensions \
  --module esnext --moduleResolution bundler --target es2024 \
  'functions/api/assist/account/[action].ts' 'functions/api/assist/billing/[action].ts'
```

The suite runs the actual handlers and migration against SQLite, with an in-process mailer and mocked Stripe API. It does not prove delivery, redirects through Stripe, or that Stripe can reach the webhook. The Pages adapters own only the nested account and billing routes; WS2 owns the helper routes.

## Owner setup for a real sandbox run

1. Create a sandbox [Stripe Product and Prices](https://dashboard.stripe.com/test/products): Zen Frame Plus, USD 4.99 monthly and USD 39.99 annually. Configure the [sandbox customer portal](https://dashboard.stripe.com/test/settings/billing/portal) to update payment methods, switch between the two plans, and cancel at period end. No live keys or payments.
2. Configure a verified sending domain with SPF/DKIM in Postmark or Resend. Select that vendor in the bindings; neither is enabled by default.
3. In the Cloudflare Pages project, bind a D1 database as `PLUS_DB`. Apply the migration in [migrations/0001_plus.sql](migrations/0001_plus.sql); use local D1 or a dedicated sandbox/preview database, not a production database.
4. Set non-secret bindings `PLUS_ORIGIN` (canonical URL, with no path), `PLUS_EMAIL_PROVIDER` (`postmark` or `resend`), `PLUS_EMAIL_FROM` (verified sender), `STRIPE_MONTHLY_PRICE` and `STRIPE_ANNUAL_PRICE`. If sandbox Stripe Tax is configured, set `STRIPE_AUTOMATIC_TAX=true`; the owner must enable it and resolve registration/terms before go-live.
5. Set secrets in Cloudflare's secret store (or an **untracked** `.dev.vars` for local-only Pages development): `PLUS_SIGNING_KEY` (random, at least 32 bytes; e.g. output of `openssl rand -hex 32`), `PLUS_EMAIL_KEY`, `STRIPE_SECRET_KEY` (sandbox only), and `STRIPE_WEBHOOK_SECRET`. Never share values in chat, Vite variables, or git.
6. Register the Stripe webhook at `<origin>/api/assist/billing/webhook`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, and `customer.subscription.created`, `updated`, `deleted`, `paused`, `resumed`. Locally, use [Stripe CLI forwarding](https://docs.stripe.com/stripe-cli/use-cli#forward-events-to-a-local-endpoint) and the listener's signing secret, not the dashboard endpoint secret.

For local Pages development, run `npm run build`, then run Wrangler from the repo root with a local config binding `PLUS_DB`, and matching `PLUS_ORIGIN` (e.g. `http://localhost:8788`). Apply the migration with `wrangler d1 execute PLUS_DB --local --file=server/auth/migrations/0001_plus.sql`, then run `wrangler pages dev dist --port 8788` so the functions and app share an origin. Do not use `astro dev` alone for real API calls. With the panel mounted, get a code, sign in and check the free allowance; finish sandbox Checkout, refresh Plus after Stripe delivers the webhook, then switch plans or cancel through Manage billing. Deleting site data and signing in again must preserve usage.

Run behind Cloudflare in staging; the IP limit uses its `CF-Connecting-IP` header. Include periodic D1 cleanup of expired codes, sessions and usage holds and past-hour auth limit buckets in the launch runbook. Never clean up the lifetime trial meter while its account exists.

## WS2 and WS8 integration

- WS2: use `createEntitlementService(env)` from [entitlement.ts](entitlement.ts). Authenticate the bearer, then validate input and apply WS2's per-user rate limit **before** reserving. Send a validated answer only if `complete()` succeeds; call `release()` on failed, canceled, refused or unusable responses. A hold expires after two minutes if the handler is interrupted. D1, not the token or browser, enforces the lifetime or UTC calendar month cap. Trial usage is preserved through upgrade/downgrade.
- WS8: mount `PlusPanel.astro` from the settings UI (this workstream does not edit the settings or layout). The panel registers the `plus` Alpine store. Use `getToken()` only after assist consent and refresh the store after requests to update the displayed allowance. The bearer is memory-only; token refresh, sign-out, Checkout and portal use an HttpOnly session cookie. There is no backup or localStorage entry.
- Webhooks use Stripe's current subscription state and the configured Price IDs, not success URLs or event arrival order. Only active subscriptions with a known Price grant access, until the period end. Retrying a signed event is safe.
- If a delivery fails, check Pages Functions logs for `stripe_webhook_not_configured` (missing or malformed secret), `stripe_signature_mismatch` (wrong signing secret or changed payload), or `stripe_reconciliation_failed` (check Stripe API access and the D1 binding). Logs include only fixed diagnostic codes, not request data or raw exceptions.
