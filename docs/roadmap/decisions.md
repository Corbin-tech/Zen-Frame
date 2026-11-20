# Plus tier decisions (WS0 options memo)

Status: **decided on 2026-11-19 by the owner.** Each section's Decision line records the pick and the reason. The options stay below for reference.

Context: the swarm brief (`docs/roadmap/neuro-tools-swarm.md`, not on `main` yet) needs six human decisions before WS2 (AI server) and WS3 (accounts and entitlement) can deploy, and before WS9 can launch. Hard constraints from the brief that every option below must satisfy:

- Server calls the AI provider with plain `fetch` (no SDK); no new npm packages without approval.
- Client calls only same-origin `/api/assist/*`; no third-party origins added to the CSP in `src/layouts/Layout.astro`; `public/_headers` kept intact.
- Keys and signing secrets live only on the server; task text is never logged or stored; provider data retention set to none.
- The model gets no tools; its output is validated on the server and the client.
- Launch bar: median response under 3 s.

Prices and limits below were checked on 2026-11-19 against the vendors' public pages where linked; re-check before committing, they change.

---

## 1. Price and billing model

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| A. Monthly subscription only | One Plus price per month | Simplest to build (one Stripe Price, one portal flow); predictable revenue | Higher churn; some users balk at monthly commitment |
| B. Monthly + annual (discounted) | Two Prices on one Product | Annual cuts churn and per-charge fees; standard pattern | Slightly more UI copy and testing; refunds/proration questions |
| C. Pay-per-use credit packs | Buy N requests one-off | Maps cost to usage; no subscription anxiety | Needs a server-side balance ledger (more WS3 work); worse fit for "Plus until X" token |
| D. One-time lifetime unlock | Single payment | Attractive to users wary of subscriptions | Ongoing model cost with no ongoing revenue; risky with a hosted model |

Cost notes:
- [Stripe card fee](https://stripe.com/pricing): 2.9% + 30¢ per successful US card charge. The fixed 30¢ is a large share of a small monthly price (e.g. ~9% of a $3.99 charge), which favors annual billing or a higher monthly price.
- [Stripe Billing](https://stripe.com/billing/pricing) (subscriptions) adds 0.7% of billing volume on pay-as-you-go.
- Model cost per request depends on decision 4; size the price so a heavy user's monthly model cost stays well under it.

Questions for the owner: price point(s); currency/regions; whether to collect sales tax/VAT (Stripe Tax is an extra fee).

Decision: **B. Monthly + annual, in USD: $4.99 a month or $39.99 a year (33% off).**

- Why: the model cost is tiny next to the price. Decision 4 puts it under $0.001 per request, so even 1,000 requests a month costs under $1. That makes Stripe's fixed 30¢ the main cost: about 9.6% of a $4.99 charge, but about 4.4% of a $39.99 one. So annual is offered, at a discount.
- Fair use: a server-side cap of 1,000 helper requests per account per month, shown in the Plus panel. That's far above normal use.
- Tax: turn on Stripe Tax before go-live. Which tax registrations to file is for the owner's accountant (WS9 gate).
- The prices live only in Stripe and in the Plus panel copy, so they can change before launch without code changes.

## 2. Free trial allowance

| Option | Pros | Cons |
| --- | --- | --- |
| A. N free requests, lifetime (brief's example: 20) | Lets users feel all three helpers; cost is capped per account | Needs a server-side counter tied to an account (WS3 already plans this) so clearing the browser can't reset it |
| B. Time-boxed trial (e.g. 7 or 14 days of Plus) | Familiar; Stripe Checkout supports trial periods | Uncapped model cost during the trial; usually needs a card up front to limit abuse |
| C. Small monthly free quota (e.g. N per month) | Ongoing hook; free users keep seeing value | Permanent cost; weaker push to upgrade |
| D. No trial | Simplest | Hard to judge an AI helper without trying it |

Notes: any option except D needs sign-in before the first request (ties to decision 5). Count a request when the server calls the model, not on validation failures, so errors don't burn the allowance.

Decision: **A. 20 free helper requests per account, for life, with no card required.**

- Sign-in comes first (decision 5). The counter lives on the server (D1, decision 3), so clearing the browser doesn't reset it.
- A request counts only when the server returns a usable answer. Rejected input, timeouts, refusals and answers that fail validation don't use the allowance.
- Manual estimate picks (WS4) stay free for everyone and don't count.
- A trial account costs under 2¢ in model use, so the allowance can grow later if conversion data says so.

## 3. Host for the server functions

The site is a static Astro build (`output: 'static'`) and `public/_headers` is already written for Netlify / Cloudflare Pages, so both brief options keep the current deploy shape and add functions beside it.

| | Cloudflare Pages Functions | Netlify Functions |
| --- | --- | --- |
| Folder | `functions/**` | `netlify/functions/**` |
| Runtime | Workers (V8 isolates, web `fetch`/`Request`/`Response`) | Node (web `Request`/`Response` handlers supported) |
| Free tier | Shares the [Workers Free quota](https://developers.cloudflare.com/pages/functions/pricing/): 100,000 requests/day, static asset requests free | Credit-based plans; check current function allowances on Netlify's pricing page |
| Limits that matter | Free: 10 ms CPU per request — but [waiting on `fetch` doesn't count](https://developers.cloudflare.com/workers/platform/limits/), so proxying a model call fits; Paid: 30 s default CPU | Synchronous functions have a short default timeout (verify current value); fine for <3 s target, tight for slow models |
| Storage for trial counter / rate limit | KV, D1 or Durable Objects on the same account | Netlify Blobs, or an external DB |
| Secrets | Encrypted env vars / secrets per project | Env vars per site, scoped to functions |
| Lock-in | Workers APIs (KV/D1) if used | Netlify Blobs if used |

Notes: the brief requires a host-agnostic `server/assist/handler.ts` with a thin adapter, so switching later costs one adapter folder plus whatever storage was used. Cloudflare's per-request rate limiting and a durable counter are available in-platform; on Netlify an atomic counter may need an external store. If the site is already deployed somewhere, staying there is the cheapest path — owner to confirm where it is hosted today.

Decision: **Cloudflare Pages with Pages Functions.**

- `public/.htaccess` suggests the site may be on Apache shared hosting today (Namecheap or similar), which can't run the server functions. So the site moves to Cloudflare Pages, with the functions beside it. The domain can stay registered where it is; only its DNS points to Pages. `public/_headers` already works there.
- Storage: D1 for accounts, sign-in codes, trial counters and subscription state. The trial counter uses one atomic SQL update. Per-user limits use the Workers rate-limiting binding.
- Plan: start on Workers Free, since waiting on the model's response doesn't count toward the 10 ms CPU limit. Move to Workers Paid (currently $5 a month; re-check) before go-live, for headroom.
- Lock-in stays small: `server/assist/handler.ts` is host-agnostic, and only `functions/**` and the D1 and rate-limit bindings are specific to Cloudflare.
- Owner action (human gate): create the Cloudflare account and Pages project, and connect the GitHub repo.

## 4. AI provider and model

Requirements from the brief: plain REST via `fetch`; JSON output constrained by the schemas in `prompts.ts`/`api.ts` **without giving the model tools**; median under 3 s; provider data retention set to none; a server-side key.

| Check | Why it matters |
| --- | --- |
| JSON-schema-constrained output without tool calling | The brief forbids tools; some providers' structured output is implemented through tool use — confirm a non-tool path exists |
| Zero / no data retention available on the account | Brief and consent copy ("Nothing is stored") depend on it; on some providers this needs an approved request or a specific plan |
| No training on API data by default | Privacy promise in WS9's policy |
| Latency of a small/fast model tier | <3 s median for Breakdown (short output) and Brain dump (longer output) |
| Price per 1M input/output tokens | Drives decision 1; inputs are capped at 6,000 characters |
| Region / data residency | Matters if selling in the EU |

Options (all offer REST APIs callable with `fetch`; verify current models, prices and retention terms before choosing):

| Option | Pros | Cons / things to verify |
| --- | --- | --- |
| A. OpenAI API | Mature JSON-schema "structured outputs" in the response format (no tools needed); fast small models | Zero data retention is not default — verify eligibility and how to request it |
| B. Anthropic API | Strong instruction following for literal, one-action steps | Verify a schema-constrained JSON mode that doesn't use tools; verify retention terms / ZDR availability |
| C. Google Gemini API | Response schema support; low-cost fast tiers | Free tier may use data for product improvement — must use a paid tier; verify retention |
| D. Model router / aggregator (e.g. OpenRouter) | Swap models without code changes; good for WS7 comparisons | Adds a second data processor to the privacy policy; retention depends on the routed provider |

Suggestion for process (not a pick): let WS7 run the same 50-task set against 2 shortlisted models with the mock-free runner before the owner locks this in; the 90% usefulness bar and latency are measurable there.

Decision: **B. Anthropic API with Claude Haiku 5.5 (`claude-haiku-5-5`)**, checked against one alternative in WS7 before launch.

- It meets every constraint. The server calls the Messages API with plain `fetch`. JSON-schema output comes through `output_config.format`, which uses no tools. Under zero data retention, prompts and outputs aren't stored; only the JSON schema is cached, for up to 24 hours after last use.
- Cost: $0.10 per million input tokens and $0.50 per million output tokens for prompts up to 100K tokens (checked 2026-11-19). That's under $0.001 for a request capped at 6,000 characters.
- Latency: send `thinking: {type: "disabled"}` with `output_config.effort: "low"` (Haiku 5.5 allows disabling thinking at `high` effort or below). WS7 measures the 3-second median.
- Retention: zero data retention is an arrangement with Anthropic, not the default. The owner requests it before WS9. Until it's confirmed, the consent copy must not say "Nothing is stored".
- Check: WS7 runs the 50-task set on Haiku 5.5 and on one alternative (a small OpenAI model). If Haiku misses the 90% usefulness bar or the latency target and the alternative meets both, switch. The handler keeps the provider call in one function to make that cheap.
- Disclosure: this pick was drafted with Claude, an Anthropic model. The WS7 comparison guards against that bias.

## 5. Sign-in method

Sign-in is needed to tie a subscription and the trial counter to a person across devices. Zen Frame has no accounts today (data is local).

| Option | Pros | Cons |
| --- | --- | --- |
| A. Email magic link | No passwords to store; works for everyone; low cognitive load (good for the target users) | Needs an email-sending provider account (human gate); link-in-another-tab friction; deliverability work |
| B. Email one-time code | Same as A, but user stays in the tab | Same provider need; code entry step |
| C. OAuth (Google / Apple / GitHub) | One click; no email infra | Each provider is an account + app review (human gates); adds redirects; some users avoid big-tech sign-in |
| D. Stripe-only identity (Checkout email + customer portal, no separate login) | Least to build; Stripe already verifies the payer | Weak for trial (no account before paying), weak for new devices; recovery relies on Stripe's portal emails |
| E. Hosted auth service | Offloads security | New vendor, likely a client SDK and third-party origin — conflicts with the no-new-packages and CSP rules |

Notes: options A/B keep everything same-origin. Whatever is picked, WS3 issues its own short-lived signed entitlement token, so the sign-in method only affects WS3's `server/auth/**`.

Decision: **B. Email one-time code.** Passkeys may come later as an optional extra.

- The user stays in the tab. There's no switching to an email app and back through a link, which matters for the people this is built for.
- Everything stays same-origin, with no client SDK. The Worker sends a 6-digit code through a transactional email API called with `fetch`. The code expires after 10 minutes and allows 5 attempts, with rate limits per email address and per IP.
- Owner action (human gate): choose and set up the email-sending account (for example Postmark or Resend), plus the SPF and DKIM records for the sending domain. WS3 builds against a small `sendEmail()` function so the vendor can change.

## 6. Stripe account setup

Not a choice between options but a set of owner-only actions (agents never create accounts or enter keys):

1. Create or choose the Stripe account and business details; accept Stripe's terms.
2. Create the Plus Product and Price(s) from decision 1 (test mode first).
3. Enable the customer portal (cancel, update card, switch monthly/annual).
4. Decide on Stripe Tax.
5. Provide **test-mode** keys and a webhook signing secret to WS3 through the host's secret store (never in the repo); live keys only at WS9 go-live.

Decision / status: **The owner does these in test mode first. Nothing is set up yet.**

1. Create the Stripe account, enter the business details, and accept Stripe's terms.
2. Create the Product "Zen Frame Plus" with two Prices: $4.99 monthly and $39.99 yearly (decision 1).
3. Turn on the customer portal: cancel at the end of the period, update the card, and switch between monthly and yearly.
4. Turn on Stripe Tax, with registrations as the accountant advises.
5. Put the test-mode secret key and the webhook signing secret into the Cloudflare Pages project's secrets (decision 3), never the repo. Live keys come only at WS9 go-live.

## 7. Approved runtime dependency: pragmatic-drag-and-drop

Decision: **Approve `@atlaskit/pragmatic-drag-and-drop` (`^1.5.0` in `package.json`) as a runtime dependency, pinned to the 1.x major, on 2026-11-20.**

- Why: it powers the Kanban/board drag and drop and predates the dependency rules.
- Updates: Dependabot ignores semver-major updates; minor and patch updates remain allowed within 1.x.
- A major upgrade needs migration evidence and its own decision.

---

## What each decision unblocks

| Decision | Unblocks |
| --- | --- |
| 1 Price/billing | WS3 Stripe Prices and token contents; WS9 copy and terms |
| 2 Trial | WS3 trial counter; WS4–WS6 "Plus available" gating copy |
| 3 Host | WS2 adapter folder and deploy; WS3 storage for counters/tokens |
| 4 Provider/model | WS2 request format and key; WS7 real runs; WS9 privacy policy |
| 5 Sign-in | WS3 `server/auth/**`; email/OAuth provider account |
| 6 Stripe setup | WS3 test-mode end-to-end flow; WS9 go-live |
