# Swarm brief: Zen Frame task helpers

## Mission

Build three AI task helpers for ADHD and autistic users in Zen Frame (`astro-zen-frame`), to ship together as the paid **Plus** tier:

| Helper | What it does |
|---|---|
| **Breakdown** | Splits one task into a checklist of steps at a chosen detail level: 1–3, 3–4, about 5, or 7+ |
| **Brain dump** | Turns free text into clusters and tasks, each with an estimate |
| **Estimate** | Minutes per task with a range, totals per cluster, and block lengths for the schedule and Auto-plan |

The engine is a hosted AI model behind Zen Frame's own server. Rule-based helpers and on-device model downloads were tried and rejected. The human roadmap is `docs/roadmap/neuro-tools.md`; this brief splits it into parallel workstreams.

## Launch bar

Nothing ships until all of these hold:

- Breakdown and Brain dump answers are rated useful for at least 90% of a test set of 50+ real tasks and 10+ real brain dumps.
- Median response under 3 seconds, with a visible working state and Cancel.
- Accessibility pass (screen reader, keyboard only, reduced motion) and a security review are done.

## Ground rules for every agent

These are hard constraints. Breaking one fails the workstream.

- **Stack:** Astro 7.4.12, Alpine.js 3.17.5, Tailwind CSS 3.4.19, Flowbite 2.5.2, TypeScript 7.0.2. Don't upgrade Tailwind to v4 or Flowbite past v2.
- **Dependencies:** no new npm packages without human approval. Server code calls the AI provider with plain `fetch`, not an SDK.
- **XSS:** no `x-html`, `innerHTML`, `outerHTML`, `eval` or `new Function`. Model output goes through `src/lib/assist/sanitize.ts` and renders only with `x-text`.
- **Network:** the client may call only the same-origin `/api/assist/*` endpoints, and only for consented Plus users. No third-party origins in the CSP in `src/layouts/Layout.astro`. Keep `public/_headers` intact.
- **Secrets:** API keys and signing secrets live only on the server. Never in client code or in env values Vite exposes (`PUBLIC_*`, `import.meta.env`).
- **Privacy:** never log, store or send task or brain-dump text anywhere except the model request itself.
- **Model output is untrusted:** validate it on the server and again in the client. It never decides colors, ids, URLs, classes or actions. The model gets no tools.
- **Preview, never auto-apply:** every helper shows an editable preview; only the user's Accept writes to `$store.todos`.
- **Conventions:** stores are `init*Store()` factories in `src/stores/`, registered in `Layout.astro`. `localStorage` goes through `loadJson` and `saveJson` in `src/lib/storage.ts`. Dates use `src/lib/dates.ts`. New components are `PascalCase.astro`, with logic in typed `.ts` modules.
- **Human-only actions:** agents never create accounts, enter real keys or credentials, make payments, accept terms, change billing, or deploy. Ask through Chief of Staff.
- **Git:** never commit `.astro/`, `.env`, `.claude/` or `AGENTS.md`.
- **Verification:** run `npm run type-check && npm run build` after every change, plus `npm audit --omit=dev` if dependencies change. A workstream is done only with 0 errors.

## Coordination protocol

- **Chief of Staff** assigns workstreams, tracks status, merges in the order below, and routes human-gate questions to the owner.
- **One agent per workstream, one branch per workstream:** `swarm/<ws-id>`, cut from `main` after WS1 merges (WS1 cuts from `main` directly).
- **File ownership:** edit only the files your workstream owns (table below). If you need a change in another workstream's file, ask its owner through Chief of Staff instead of editing it.
- **Contracts first:** WS1 freezes the shared types and API contract. Others build against them and propose changes to WS1 rather than changing them.
- **Escalate instead of guessing:** if a decision is missing (pricing, host, provider, copy), stop and ask. Don't invent it.
- **Report format:** each status update is Goal → Context → Constraints → Done-when → Report (one line per changed file), followed by the verification output.

## Order of work

| Workstream | Depends on | Can start |
|---|---|---|
| WS0 Decisions (human) | — | Now |
| WS1 Contracts and foundations | — | Now |
| WS2 AI server | WS1; WS0 for deploy | After WS1 |
| WS3 Accounts and entitlement | WS1; WS0 for live setup | After WS1 |
| WS4 Estimate UI | WS1 | After WS1 |
| WS5 Breakdown UI | WS1 | After WS1 |
| WS6 Brain dump UI | WS1 | After WS1 |
| WS7 Quality evaluation | WS1; WS2 for real runs | After WS1 |
| WS8 Integration and QA | WS2 to WS7 | When they merge |
| WS9 Launch | WS8, WS0 | Last |

WS2 to WS7 run in parallel. Merge order: WS1, then WS4, WS5 and WS6, then WS2 and WS3, then WS7, then WS8.

## Workstreams

Suggested models follow the routing in `AGENTS.md`: `mistral-large-4-0` for visual UI and security work, `zai-glm-5-3` for multi-file and terminal-heavy work.

### WS0: Decisions (human owner)

- **Decide:** price and billing model, free trial allowance (for example 20 requests), host (Cloudflare Pages Functions or Netlify Functions), AI provider and model, sign-in method, and Stripe account setup.
- **Agents may:** draft an options memo with trade-offs in `docs/roadmap/decisions.md`. Never pick for the owner.
- **Output:** recorded decisions that unblock deploys in WS2 and WS3.

### WS1: Contracts and foundations

- **Suggested model:** `zai-glm-5-3`.
- **Start:** apply `docs/roadmap/neuro-tools-scaffold.patch` on `swarm/ws1-contracts` (checked against main at d9e6b72 on 2026-11-19).
- **Scope:** freeze `AssistProvider`, the result types and `DETAIL_LEVELS`. Add `src/lib/assist/api.ts` with request and response types and JSON Schemas shared by client and server. Delete the rejected rules provider (`localProvider.ts`) and park `chromeProvider.ts` (not wired in). Add `sessionStorage` helpers to `storage.ts` for WS6. Keep the `Todo.estimateMinutes` and `Todo.steps` fields with their load-time validation.
- **Owns:** `src/lib/assist/types.ts`, `prompts.ts`, `sanitize.ts`, `api.ts`, `index.ts`; `src/stores/assistStore.ts`; the `Todo` fields and validation in `src/stores/todoStore.ts`; `src/lib/storage.ts`; `src/lib/autoPlan.ts`; the store registration in `src/layouts/Layout.astro`.
- **Done when:** the contracts type-check and build, `sanitize.ts` has script-runnable checks (Node type stripping, no test-runner dependency), and the branch is merged first.

### WS2: AI server

- **Suggested model:** `zai-glm-5-3` to build, `mistral-large-4-0` for the security review.
- **Scope:** a host-agnostic handler in `server/assist/handler.ts`, plus a thin adapter for the host WS0 picks. Endpoints are `POST /api/assist/breakdown`, `/compile` and `/estimate`. Each one:
  - checks the entitlement token through WS3's interface
  - caps input at 6,000 characters and applies a per-user rate limit
  - calls the model with the schemas from `prompts.ts` and `api.ts`
  - re-validates the answer with `sanitize.ts`
  - accepts same-origin requests only and logs no request text
- Also writes the client `src/lib/assist/cloudProvider.ts`, implementing `AssistProvider` against these endpoints.
- **Owns:** `server/assist/**`, the host adapter folder (`functions/**` or `netlify/**`), and `src/lib/assist/cloudProvider.ts`.
- **Done when:** local runs pass with a mock model and a mock entitlement, no secret is in the repo, and the security checklist (key handling, limits, logging, CORS) is signed off.
- **Human gates:** provisioning the API key, setting provider data retention to none, and deploying.

### WS3: Accounts and entitlement

- **Suggested model:** `mistral-large-4-0`.
- **Scope:**
  - sign-in by the method WS0 picks
  - Stripe Checkout, customer portal and a webhook handler that verifies signatures
  - a short-lived signed entitlement token ("Plus until X" or "N trial requests left")
  - a server-side trial counter, so clearing the browser can't reset it
  - the client token holder `src/stores/plusStore.ts` and a `PlusPanel.astro` UI to subscribe or manage
- **Owns:** `server/auth/**`, `server/billing/**`, `src/stores/plusStore.ts`, `src/components/PlusPanel.astro`.
- **Done when:** the full flow works on localhost or staging against Stripe test mode with test keys a human supplies, and tests show a tampered or expired token is rejected.
- **Human gates:** the Stripe account, live keys, the email or sign-in provider account, and the terms of service.

### WS4: Estimate chips and cluster totals

- **Suggested model:** `mistral-large-4-0`.
- **Estimate chip:**
  - With no estimate, a dashed "+ Estimate" chip. With one, "25 min" in the accent color.
  - Clicking opens quick picks (5, 15, 25, 45, 60, 90 min), Custom, and Clear. Fully keyboard-usable, and Esc closes it.
  - "Suggest" (Plus) calls `$store.assist.estimate()`, shows a range such as "About 45 min (35–80)", and fills the chip only on Accept. Hide it until Plus is available.
- **Cluster total:** adds up open tasks only and counts the ones without an estimate ("About 1 hr 10 min · 1 not estimated"), in both the task list and the board.
- **Schedule and Auto-plan:** the block modal fills in the end time from the estimate, rounded to the schedule grid, and Auto-plan sizes each block from its estimate.
- **Owns:** `src/components/TaskRow.astro`, a new `src/components/EstimatePicker.astro`, `src/lib/estimates.ts`, the cluster headers in `taskManager.astro` and `Board.astro`, the block modal in `schedule.astro`, and the copy in `AutoPlanPanel.astro`.
- **Done when:** clusters show totals, the schedule fills in end times from estimates, Auto-plan gives a 90-minute task a 90-minute block, and manual picks work without Plus.

### WS5: Breakdown UI

- **Suggested model:** `mistral-large-4-0`.
- **Scope:**
  - `BreakdownPanel.astro`: a detail-level picker, editable step rows (reorder, delete, add), and Accept and Discard buttons.
  - `TaskSteps.astro`: the step checklist ("2 of 5 steps") with `toggleStep`.
  - The next unchecked step shown in the Zen mode task view (find it from the `zenmode` tab in `tabs.astro`).
  - "Promote steps to cluster".
- **Owns:** `src/components/BreakdownPanel.astro`, `src/components/TaskSteps.astro`, and the Zen mode task view.
- **Does not edit** `TaskRow.astro`. WS8 adds the one-line `TaskSteps` include.
- **Done when:** a task can be broken down, edited, accepted and ticked step by step, and it survives reload and backup/restore.

### WS6: Brain dump UI

- **Suggested model:** `mistral-large-4-0`.
- **Scope:**
  - `BrainDump.astro`: a textarea, a "Sort it out" button, and an editable preview. Users can rename clusters, move tasks between them by keyboard and by mouse, untick tasks to skip, and add to an existing cluster when the name matches.
  - The draft lives in `sessionStorage` (through WS1's helpers) and never goes into backups.
  - Entry points: QuickAdd and a Dashboard widget.
- **Owns:** `src/components/BrainDump.astro`, the entry point in `QuickAdd.astro`, the widget in `DashboardWidget.astro`, and the widget entry in `DASHBOARD_WIDGETS` in `src/stores/settingsStore.ts`.
- **Done when:** a messy paragraph becomes reviewed clusters with estimates, and moving tasks works with a screen reader and keyboard only.

### WS7: Quality evaluation

- **Suggested model:** `zai-glm-5-3`.
- **Scope:** an evaluation harness in `eval/`. It contains:
  - a dataset format and consent notes
  - a runner that calls WS2's handler with a mock model or a real one
  - a rating rubric (useful, literal, one action per step, realistic minutes)
  - a report that compares results against the 90% bar
- Use plain Node scripts (type stripping), with no new dependencies.
- **Owns:** `eval/**`. Never commit real user text; datasets stay outside git unless contributors consent.
- **Done when:** the harness runs end to end with the mock model and produces a report. Real runs use a key the human sets locally.
- **Human gates:** recruiting testers, consent, and collecting the dataset.

### WS8: Integration and QA

- **Suggested model:** `zai-glm-5-3` to integrate, `mistral-large-4-0` for the accessibility and security audits.
- **Scope:**
  - merge the branches in order and add the cross-file includes (for example `TaskSteps` in `TaskRow.astro`)
  - point `pickProvider()` at `cloudProvider`
  - run full verification
  - do the accessibility pass and the security review (CSP unchanged, `_headers` intact, no sinks, backup validation, token handling)
- Also draft the `AGENTS.md` rule updates for the human to apply. `AGENTS.md` is not committed.
- **Owns:** merge commits and integration-only edits. Anything larger goes back to the owning workstream.
- **Done when:** all branches are merged, checks show 0 errors, both audits pass, and the launch bar is met in WS7's report.

### WS9: Launch

- **Suggested model:** `mistral-large-4-0` for drafts.
- **Scope:**
  - the consent screen `src/components/PlusConsent.astro`: "Plus sends the text you give a helper to Zen Frame's server and our AI provider. Nothing is stored."
  - privacy policy and terms drafts naming the provider, what is sent, no retention, and how to cancel
  - release notes
- **Owns:** `src/components/PlusConsent.astro` and `docs/legal/**` drafts.
- **Human gates:** legal review and sign-off, pricing go-live, and the production deploy.

## Human gates, in one list

- Pricing, trial allowance, host, AI provider and sign-in method (WS0)
- The AI provider account, API key and retention setting (WS2)
- The Stripe account, live keys and the email or sign-in provider (WS3)
- Testers, consent and the dataset (WS7)
- Applying the `AGENTS.md` updates (WS8)
- Legal sign-off, go-live and deploy (WS9)

## References

- `docs/roadmap/neuro-tools.md`: the human roadmap, design principles and launch bar
- `docs/roadmap/neuro-tools-scaffold.patch`: prototype client code (types, prompts, sanitizer, store, estimate math, `Todo` fields)
- `AGENTS.md`: project rules and model routing (local only, not in git)
