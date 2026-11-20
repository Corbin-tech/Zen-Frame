# Assist server (WS2)

Provisional contract: replace `contract.ts` imports with WS1's shared modules on rebase.
WS3 integration is deliberately fail closed: the Pages adapter rejects all tokens until
`createEntitlementService(env)` is wired from `server/auth/entitlement.ts`.

## Owner configuration

- Secret: `ANTHROPIC_API_KEY` (server only).
- Workers rate-limiting binding: `ASSIST_RATE_LIMITER`.
- WS3 integration bindings: `PLUS_DB`, `PLUS_SIGNING_KEY`.
- Human gates: provision accounts/secrets, confirm provider zero data retention, deploy.

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
- Pending integration: WS1 final contracts and WS3 real authentication/reservation service.
- Pending human/WS8 gates: independent security review, live retention configuration, quality and latency evaluation.
