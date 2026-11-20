# Assist server (WS2)

Contracts, prompts and sanitizers come from WS1's `src/lib/assist/` modules.
`validation.ts` rejects unusable sanitized answers on both sides of the network;
an explicitly empty brain-dump cluster list is valid, but all tasks discarded by cleaning is not.
WS3 integration is deliberately fail closed: the Pages adapter rejects all tokens until
`createEntitlementService(env)` is wired from `server/auth/entitlement.ts`.

## Owner configuration

- Secret: `ANTHROPIC_API_KEY` (server only).
- Optional Workers rate-limiting binding: `ASSIST_RATE_LIMITER` (not documented for Pages; see findings below).
- D1 binding: `PLUS_DB` (used for rate limiting when the optional binding is absent).
- WS3 integration secret: `PLUS_SIGNING_KEY`.
- Human gates: provision accounts/secrets, confirm provider zero data retention, deploy.

## Pages binding findings

The documented Pages deployment path is D1, not the Workers rate-limit binding.
Research checked the following Cloudflare sources:

- [Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/):
  "Pages Functions only support a subset of all bindings, which are listed on this page."
  Rate limiting is not listed. D1 is: "To bind your D1 database to your Pages Function,
  you can configure a D1 database binding in the Wrangler configuration file or the Cloudflare dashboard."
- [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/):
  "First, add a binding to your Worker that gives it access to the Rate Limiting API:"
  The TOML example uses `[[ratelimits]]` with `simple.limit` and `simple.period`.
  "The duration of the rate limit window, in seconds. Must be either `10` or `60`."
  These are Workers instructions, not a documented Pages configuration.
- [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/):
  "The configuration fields do not match exactly between Pages Functions Wrangler file and the Workers equivalent."
  "Some functionality supported by Workers, such as module aliasing cannot yet be used by Cloudflare Pages projects."
  Pages supports TOML, but this does not imply Workers-only keys are supported.
- [Cloudflare docs issue 14186](https://github.com/cloudflare/cloudflare-docs/issues/14186):
  maintainer dario-piotrowicz: "Rate limit bindings are indeed not supported by Pages applications" (2024-05-02).
- [Workers SDK PR 10541](https://github.com/cloudflare/workers-sdk/pull/10541):
  "Rate Limiting in Workers is now generally available. We can now remove `ratelimit` from unsafe bindings."
  "Old unsafe bindings should continue to work as before for now."
  This promotes Workers syntax; it does not document Pages support for `unsafe.bindings` or `[[ratelimits]]`.

Conclusion: do not rely on either syntax to provision a Pages rate limiter. The historical
maintainer statement explicitly excludes Pages, and the current Pages docs do not document support.
No live deployment was attempted to independently test platform acceptance.

## Rate limiting and migration

The adapter prefers `ASSIST_RATE_LIMITER` if supplied by a supported host. Otherwise it uses
`PLUS_DB` with `createD1RateLimiter`; without either binding, or without the model key, it returns 503.
Binding errors fail closed rather than silently switching to a separate counter.

Both paths are configured for **10 requests per account per 60 seconds**, shared across all
three helper endpoints. For a Workers deployment, configure the optional binding with
`simple.limit = 10` and `simple.period = 60`; no Wrangler file is added here and this is not
a claim of Pages support. D1 uses UTC-aligned fixed windows and an atomic
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`; rejected attempts saturate the
counter at 11. Each account has one row, overwritten on rollover. Backdated windows are denied.
The Workers API is approximate/per-location; D1 serializes this counter globally. Fixed
windows can permit up to 20 calls straddling a boundary. Rate limits count authenticated
attempts, independently of the trial reservation which counts only usable answers.

Apply `server/assist/migrations/0001_assist_rate_limits.sql` to the same database bound as
`PLUS_DB`, in both preview and production, before enabling the fallback. It follows WS3's
`server/auth/migrations/0001_plus.sql` convention, but stays in the WS2-owned migration
directory. No WS3 migration or table is changed. With an already-installed Wrangler CLI
and configured `PLUS_DB` binding, the owner can apply it explicitly:

```sh
wrangler d1 execute PLUS_DB --local --file=server/assist/migrations/0001_assist_rate_limits.sql
wrangler d1 execute PLUS_DB --remote --file=server/assist/migrations/0001_assist_rate_limits.sql
```

Run each migration once per target database; the remote command is a human deployment action,
not part of local verification. The table stores only account identifiers, window numbers
and counters, never task text. Its lifecycle can follow account deletion during WS3 integration.

## Checks

With Node 24 active:

```sh
node server/assist/handler.check.ts
npm run type-check && npm run build
```

Also run the brief's forbidden-pattern git search; it should produce no matches (exit 1).

## Security checklist

- Met: key is adapter-injected, sent only in server-to-provider headers, never returned/logged.
- Met: 32,768-byte streaming body limit, 6,000-character text limit, bounded schemas and same-user rate limit.
- Met: authenticated account reservation before inference; complete only on validated output; release on every unsuccessful outcome.
- Met: no request/response text logging or storage; fixed error codes only.
- Met: exact Origin required; cross-site fetch metadata rejected; no CORS headers, including OPTIONS.
- Met: both server and client sanitize output; extra properties dropped; no model tools.
- Met: all JSON responses are no-store and nosniff.
- Pending integration: WS3 real authentication/reservation service.
- Pending human/WS8 gates: independent security review, live retention configuration, quality and latency evaluation.
