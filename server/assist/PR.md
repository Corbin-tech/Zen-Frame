# PR #33: pre-auth IP protection

Adds a fail-closed, pre-authentication rate limit to all three AI helper endpoints.
The existing per-account limit remains 10/minute; the new IP limit is 60/minute to
allow headroom for shared networks.

Request order: route/method/origin/content-type → hashed IP gate → bearer parsing
and authentication → account gate → input validation → reservation → model →
answer validation → complete. Cheap protocol checks precede database writes, while
unauthenticated attempts cannot reach entitlement verification without passing the IP gate.

`CF-Connecting-IP` is required. Both optional Workers bindings are preferred when
available (`ASSIST_IP_RATE_LIMITER` and `ASSIST_RATE_LIMITER`, distinct namespaces),
otherwise each uses D1 on `PLUS_DB`. Pages should use the documented D1 path.
Missing IP/limiter or a limiter error returns `503 unavailable`; IP exhaustion
returns `429 rate_limited`. Blocked requests never authenticate, reserve, complete,
or call the model. Only SHA-256 IP digests enter limiter keys/storage; no raw IP logging.

Owner action: apply `server/assist/migrations/0002_assist_ip_rate_limits.sql` after
`0001_assist_rate_limits.sql` in preview and production. No existing WS3 tables are changed.
Cloudflare must be the trusted ingress setting the IP header. Hashes are pseudonymous;
expired rows belong in the deployment's data-retention cleanup policy.

Regression checks cover allowed/blocked attempts, missing IP/limiter, limiter errors,
zero entitlement/model calls on blocks, distinct IPs, independent account/IP counters,
binding selection, digest-only persistence and D1 window rollover.

Checks: `node server/assist/handler.check.ts`, `npm run type-check`, `npm run build`,
and the brief's forbidden-pattern search.
