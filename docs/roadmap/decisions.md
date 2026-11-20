# Plus tier decisions (WS0 options memo)

Status: **open — awaiting owner decisions.** This memo lists options and trade-offs only; nothing here is decided. Record each decision in the "Decision" line of its section (owner only).

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

Decision: _(owner)_

## 2. Free trial allowance

| Option | Pros | Cons |
| --- | --- | --- |
| A. N free requests, lifetime (brief's example: 20) | Lets users feel all three helpers; cost is capped per account | Needs a server-side counter tied to an account (WS3 already plans this) so clearing the browser can't reset it |
| B. Time-boxed trial (e.g. 7 or 14 days of Plus) | Familiar; Stripe Checkout supports trial periods | Uncapped model cost during the trial; usually needs a card up front to limit abuse |
| C. Small monthly free quota (e.g. N per month) | Ongoing hook; free users keep seeing value | Permanent cost; weaker push to upgrade |
| D. No trial | Simplest | Hard to judge an AI helper without trying it |

Notes: any option except D needs sign-in before the first request (ties to decision 5). Count a request when the server calls the model, not on validation failures, so errors don't burn the allowance.

Decision: _(owner)_

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

Decision: _(owner)_

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

Decision: _(owner)_

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

Decision: _(owner)_

## 6. Stripe account setup

Not a choice between options but a set of owner-only actions (agents never create accounts or enter keys):

1. Create or choose the Stripe account and business details; accept Stripe's terms.
2. Create the Plus Product and Price(s) from decision 1 (test mode first).
3. Enable the customer portal (cancel, update card, switch monthly/annual).
4. Decide on Stripe Tax.
5. Provide **test-mode** keys and a webhook signing secret to WS3 through the host's secret store (never in the repo); live keys only at WS9 go-live.

Decision / status: _(owner)_

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
