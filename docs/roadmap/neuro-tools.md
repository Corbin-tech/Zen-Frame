# Roadmap: neuro-friendly task helpers

**Status: planned, not started.** Nothing here is in the app yet. These helpers launch together, and only when they're good enough that a user's first try feels helpful. Rule-based versions were prototyped and judged not good enough, especially for Breakdown, so the launch depends on a real AI model.

Three helpers for ADHD and autistic users, modeled on goblin.tools' Magic ToDo, Compiler, and Estimator:

| Helper | goblin.tools equivalent | What it will do in Zen Frame |
|---|---|---|
| **Breakdown** | Magic ToDo | Splits one task into a checklist of steps at a chosen detail level: 1–3, 3–4, about 5, or 7+ |
| **Brain dump** | Compiler | Turns free text into clusters and tasks, each with an estimate |
| **Estimate** | Estimator | Gives minutes per task (with a range), totals per cluster, and block lengths for the schedule and Auto-plan |

## 1. How it will work

- **Engine:** a hosted AI model behind Zen Frame's own server, offered as a paid **Plus** feature. Asking users to download a multi-gigabyte on-device model was ruled out as too much friction, and built-in rules weren't good enough.
- **Bonus later, not at launch:** Chrome's built-in model (Gemini Nano, Prompt API) could serve users who already have it. It is never something users are asked to download.
- **One interface:** every engine implements the same `AssistProvider` interface, so the UI and stores never depend on which one answered.

## 2. Design principles for ADHD and autistic users

- **Preview, never auto-apply.** Every helper shows its suggestion first. The user edits, then accepts or discards. Nothing changes without a click.
- **Literal, concrete wording.** Steps start with a verb and name one action. No idioms, filler, or encouragement.
- **One request at a time, cancellable.** Starting a new run aborts the last one.
- **Steps live inside the task.** Breakdown writes a checklist on the task (`Todo.steps`), so the board, schedule, and Zen mode still see one task.
- **Ranges over false precision.** "About 25 min (20–45)", leaning long, because time blindness usually means underestimating.
- **Remember choices.** The last detail level is saved.
- **Accessible by default.** Keyboard-reachable, `aria-live="polite"` announcements, `prefers-reduced-motion`, and the existing Lexend and Atkinson fonts and text sizes.

## 3. Launch quality bar

All of these must hold before the helpers ship:
- A test set of at least 50 real tasks and 10 real brain dumps (from you and testers, with permission). Breakdown and Brain dump answers are rated useful for at least 90% of them.
- Estimates land within the given range for most tasks testers actually time.
- Median response under 3 seconds, with a visible "working" state and Cancel.
- Accessibility pass (screen reader, keyboard only, reduced motion) and a security review of the server and client.

## 4. Phases

### P0: Decisions
- Validate demand: the app has no analytics, so ask in the Feedback panel whether people would pay for these helpers.
- Pick a small, fast model (for example Claude Haiku 5.5, `claude-haiku-5-5`) and work out the cost per request from current provider pricing.
- Pick the pricing: a monthly subscription or a one-time purchase with a request allowance. Consider a **free trial allowance** (for example 20 requests) so every new user gets a good first experience before paying.

### P1: Backend (the first server Zen Frame has)
- A serverless function on the same host as the site (Cloudflare Workers or Netlify Functions, matching `public/_headers`). It holds the API key; the browser never sees it.
- Endpoints: `POST /api/assist/{breakdown,compile,estimate}`. Each checks the user's entitlement, caps input (6,000 characters), applies a per-user rate limit, calls the model with a JSON Schema for the answer, and re-validates the answer before returning it.
- No logging or storage of task text. Use a provider setting that doesn't retain or train on requests.
- Requests accepted only from the app's own origin.

### P2: Accounts and payments
- A hosted payment provider (for example Stripe Checkout and its customer portal), so the app never handles card details.
- Sign-in by email magic link or passkey. The server issues a short-lived signed token that says "Plus until date X" (or "N trial requests left"). The client keeps only that token.
- Task data stays in `localStorage`. Accounts exist only for billing and entitlement, not sync.

### P3: Estimate chips and cluster totals
- **Data:** `Todo.estimateMinutes`, validated when tasks load, included in backups, always rendered with `x-text`.
- **Estimate chip** (`TaskRow.astro`):
  - With no estimate, a dashed "+ Estimate" chip. With one, "25 min" in the accent color.
  - Clicking opens quick picks (5, 15, 25, 45, 60, 90 min), Custom, and Clear. Fully keyboard-usable, and Esc closes it. Manual picks work without Plus.
  - The Plus "Suggest" button shows a range ("About 45 min (35–80)") and fills the chip only after the user accepts.
- **Cluster total** (cluster headers in `taskManager.astro` and `Board.astro`): adds up open tasks only and counts the ones without an estimate instead of guessing ("About 1 hr 10 min · 1 not estimated").
- **Schedule:** the `schedule.astro` block modal fills in the end time from the estimate, rounded to the schedule grid.
- **Auto-plan:** sizes each task's block from its estimate, falling back to the planning default.
- **Done when:** clusters show totals, the schedule fills in end times from estimates, and Auto-plan gives a 90-minute task a 90-minute block.

### P4: Breakdown
- Data: `Todo.steps` (id, text, done, minutes), validated when tasks load.
- `BreakdownPanel.astro`: a detail-level picker, editable step rows (reorder, delete, add), and Accept and Discard buttons.
- `TaskRow.astro`: a step checklist ("2 of 5 steps"). Zen mode shows the next unchecked step.
- "Promote steps to cluster" for big tasks.

### P5: Brain dump
- `BrainDump.astro`: a textarea, a "Sort it out" button, and an editable preview of clusters and tasks. Users can rename clusters, move tasks, and untick tasks to skip. Offer "Add to existing cluster" when a name matches one.
- The draft is kept in `sessionStorage` only, never in backups.
- Entry points: QuickAdd and a Dashboard widget.

### P6: Learning your pace
- Record actual minutes on completion, from linked focus sessions or the time from start to completion.
- Adjust new estimates by the user's median actual-to-estimate ratio, and show "You usually take 1.4× longer" in Insights.
- A time-blindness buffer setting (1.0×, 1.25×, 1.5×).

### P7: Launch
- Consent screen the first time: "Plus sends the text you give a helper to Zen Frame's server and our AI provider. Nothing is stored."
- A privacy policy and terms naming the AI provider, what is sent, retention (none), and how to cancel.
- Unit tests for output validation and estimate math (needs a test runner such as `vitest`, which needs dependency approval).

## 5. Security rules for this feature

Add these to AGENTS.md when P1 starts, not before:
- Change "no outbound requests" to "no outbound requests except the app's own `/api/assist` endpoint, used only for users who consented." `connect-src 'self'` already allows a same-origin API; keep third-party origins out of the CSP.
- API keys and secrets live only on the server, never in client code or in env values Vite exposes (`PUBLIC_*`, `import.meta.env`).
- Model output is untrusted input: validate it on the server and again in the client, render it only with `x-text`, and never let it decide colors, ids, URLs, classes, or actions. The model gets no tools.
- `importBackup()` checks shape; each store validates fields on load. Every new saved field (`estimateMinutes`, `steps`) must be validated there.
- Never write task or brain-dump text to the console or to server logs.

## 6. Prototype code

A working prototype of the client side is saved in [`neuro-tools-scaffold.patch`](neuro-tools-scaffold.patch). It includes the `AssistProvider` interface, detail levels, prompts and JSON Schemas, an output sanitizer, a Chrome on-device provider, a rules provider, estimate math, `$store.assist` with preview and accept, and the `Todo.estimateMinutes` / `Todo.steps` fields with Auto-plan support. Reuse what fits. A Plus provider would be one new file (`cloudProvider.ts`) beside the others.

To apply it on a fresh branch (checked against main at d9e6b72 on 2026-11-19; it may need updating if those files change):

```bash
git apply docs/roadmap/neuro-tools-scaffold.patch
```

## 7. Open questions
1. **Recursive breakdown:** allow breaking a step down again, or keep one level plus "Promote to cluster"?
2. **Pricing:** subscription or one-time purchase, and how big a free trial allowance?

## 8. Prior art reviewed
- [goblin.tools](https://goblin.tools/About): the hosted-model approach and detail control this plan adapts.
- [flippinhutt/adhd-brain](https://github.com/flippinhutt/adhd-brain) (MIT): goblin-style prompts and a provider layer, a useful reference for P1.
- [getaltair/altair](https://github.com/getaltair/altair) and [shaneplunkett/auri](https://github.com/shaneplunkett/auri): other ADHD planners with AI breakdown, both server-based.
- [Chrome Prompt API docs](https://developer.chrome.com/docs/ai/prompt-api): the possible on-device bonus.
