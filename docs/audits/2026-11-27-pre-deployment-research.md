# Zen Frame Pre-Deployment Research — 2026-11-27

- **Produced by:** `research` agent (report-only)
- **Audited state:** `fix/close-day-focus-checkins-keys` @ `691dda7`, plus the security-audit hardening that landed as PR #151 and the bug-audit fixes in PR #153.
- **Method:** end-to-end read of the goals/check-in/close-day/recap code paths and their tests, plus `planning/pre-deployment-audits-2026-11-27.md`, `planning/brand-refresh-plan-2026-11-20.md`, the 2026-11-20 PR-review/security-audit docs, `astro.config.mjs`, `package.json`, `playwright.config.ts`, `public/_headers`, `.github/`.

---

# Part A — High-value pre-deployment improvements for GOALS and CHECK-INS

## A.0 What the flows do today (baseline)

- **Data model** (`src/stores/goalsStore.ts`): four localStorage keys — `goals[]` (id, title, why, obstaclePlan, celebration, clusterId, progress, targetDate, done, reachedAt, createdAt), `checkIns{}` keyed by Monday `YYYY-MM-DD` (energy, wins, blockers, nextFocus, weeklyIntentions[≤3], checkInPerson(+TaskId), recharge, mindfulPrompt/Answer/Dismissed, savedAt), `notes[]`, `wins[]`. All reads go through `loadJson()` → `normalizeStoredData()`; writes through `saveJson()` with a "Storage full" toast. Multi-tab sync is a `storage` event → `loadList(key, merge=true)` with three-way `mergeLists`; the open check-in draft gets field-level merging via `mergeCheckInDraft` (`src/lib/checkInMerge.ts`) wired in `Goals.astro`; focused inputs are protected by `syncDraft`/`resetDraft` + frozen orders.
- **Goals UI** (`src/components/Goals.astro`): add/edit/delete goals, done-checkbox → celebration card → optional "Save to wins", cluster-linked progress (`progressOf` → `goalProgress` → `todoStore.clusterProgress`, which keeps cleared tasks counted via `history`), manual progress slider when unlinked, target-date chip, weekly check-in with week navigation (future weeks blocked, dirty drafts confirmed), Weekly Big 3 intentions, check-in-person → "Add as a task" (mid-week due date for the current week only), rotating mindful prompt, wins archive, notes with pin/autosize, past check-ins list.
- **Close the day** (`CloseDay.astro`): stats, carry-over of unfinished due≤today tasks to tomorrow, one win, pick/add tomorrow's 1–3 focus tasks (`DAILY_FOCUS_LIMIT=3`), sets `settings.lastClosedDay`, focus trap + focus return (PR #150).
- **Recap** (`Recap.astro`): monthly story built once at `open()` from completions/sessions/checkIns/wins/goals; marks `settings.recapSeenMonths`.
- **Reminders** (`src/lib/notifications.ts`): weekly check-in, people check-in, close-day nudges — all local-date based.
- **Export/import**: `exportBackup`/`importBackup` (`storage.ts`), version 1, per-key type checks + `normalizeStoredData`, rollback on failed write, `__proto__` week keys skipped (PR #150) and further hardened by PR #151.

## A.1 Concrete weaknesses found (with file:line)

### A.1.1 Data-model / validation gaps (load + backup import)

1. **`goals` normalization was partial** — only `id`/`title` checked; `progress`, `done`, `clusterId`, `targetDate`, `createdAt` passed through raw → "banana%", "Invalid Date" chips, silent drops from the Recap. *(Hardened by PR #151 for history/notes/planning/dueDate; the goals/wins/checkIns sweep below is still open.)*
2. **`win.date` is any string** — never checked with `isDateKey`; garbage dates mis-bucket wins in the check-in and Recap.
3. **`checkIns` week keys, `savedAt`, `energy` unvalidated** — any string accepted as a week key; `energy` not clamped 0–5 (inflates `averageEnergy`); bad `savedAt` renders "Saved Invalid Date".
4. **In-flight hardening needed committing with tests** — resolved by PR #151 (validation for `notes`, `history.at`, `availability` windows, `dueDate`, pomo session timer) with regression tests.

### A.1.2 Edge cases

5. **DST bug in the rotating mindful prompt** — `mindfulPromptForWeek` (`goalsStore.ts:51-56`) computes `Math.floor(fromDateKey(week).getTime() / 86_400_000) / 7`; local midnights are 23h/25h apart across DST changes, so adjacent weeks can show the *same* prompt or skip one. Fix: `Math.floor(daysBetween("1970-01-05", week) / 7)` (`daysBetween` is `Math.round`-based and DST-safe).
6. **Dangling `goal.clusterId`** — after a backup import or a cross-tab cluster delete, a goal can point at a nonexistent cluster → progress shows 0 and " · 0/0 tasks". `unlinkClusters` only handles same-tab deletion.
7. **Unsaved check-in drafts and Close-Day inputs are lost on reload/crash** — the draft lives only in Alpine component state; cross-tab saves merge, but a reload/tab crash silently discards a dirty draft. Same for Close-Day `winText`/`nextStepText`.
8. **Wins/check-ins don't count as "showed up" days** — `activeDays` (`insights.ts:70-73`) uses only completions + pomo sessions; streaks and the Recap "days you showed up" slide ignore win-only and check-in-only days.
9. **No automatic goal-reached detection** — a cluster-linked goal at 100% (or a manual slider at 100) does not set `done`; the celebration card only fires from the manual checkbox.
10. **`weekStats` "current goal progress" is all-time** — `Goals.astro:806-820` shows done/total over *all* goals for any viewed week; `reachedGoalsInRange` exists but is unused there.
11. **Whole-entry last-write-wins for goals across tabs** — unlike check-ins (field-level merge), two tabs saving different fields of the same goal can lose one field.
12. **Clearing a note deletes it on blur with no confirm** (`Goals.astro:657-663`).
13. **Unbounded growth** — `history`, `wins`, `notes`, `checkIns` grow forever; no pruning policy.
14. **Backup format has no migration path** — `importBackup` hard-rejects `version !== 1`.
15. **Recap slides are a snapshot** — built once at `open()`; wins added in another tab while open don't appear.
16. **Cosmetic:** after your own save, the draft watcher can reset `saveState` to `'clean'`, so `saveStatus` shows "Saved today" instead of "Saved".

## A.2 Ranked recommendations

Impact = user-facing value (data loss, correctness, trust); Effort = S (<1 day), M (1–3 days), L (>3 days). All changes are additive/defaulted, so **no one-time localStorage migration script is needed** — normalize-on-load plus `hydrateGoal`/`hydrateCheckIn` defaults are the migration path. If a future change alters shapes structurally, bump `version` in `exportBackup` and add a step to a migrations map in `importBackup`.

### Must fix before deploy (correctness / crash / data-integrity in these flows)

| # | Item | Why must-fix | Effort | Files to touch | Data-shape / migration |
|---|---|---|---|---|---|
| M-A1 | **Commit + test the validation hardening** (notes/history/planning/dueDate/pomo session) | Uncommitted work would ship untested | S | **Done by PR #151** | none — normalize-on-load only |
| M-A2 | **Validation sweep for `goals`/`wins`/`checkIns`**: clamp `progress` to 0–100, coerce `done` to boolean, `clusterId` to string\|null, `targetDate`/`win.date`/week keys to `isDateKey`, `energy` to 0–5, timestamps to `isTimestamp` | Prevents "banana%", "Invalid Date", garbage win buckets, inflated energy averages from hand-edited/imported backups | S | `storedData.ts` goals/wins/checkIns cases + `cleanWin`; mirror in `hydrateGoal`/`hydrateCheckIn`; tests in `tests/storedData.test.ts`, `tests/goalsStore.test.ts` | none — coercion only drops malformed values |
| M-A3 | **Prune dangling `goal.clusterId` links** (A.1.2 #6): `pruneDanglingClusters()` in `goalsStore`, called after both stores init and on `todos` storage merges | Prevents silent progress reset to 0 and "0/0 tasks" after backup import or cross-tab cluster delete | M | `goalsStore.ts`, `Layout.astro`, `todoStore.ts` storage handler; new tests in `tests/goal-progress.test.ts` + a multitab spec | none — `clusterId` set to null, `progress` frozen |

### Fast-follow (ranked by impact ÷ effort)

| # | Item | Impact | Effort | Implementation sketch |
|---|---|---|---|---|
| F1 | **Persist in-progress check-in drafts and Close-Day win/next-step text** (#7) | High — silent loss of typed content on reload/crash | S–M | Save `{week, draft}` via `saveSessionJson('checkInDraft:'+week)` when dirty; restore in `init()`; delete on `saveCheckIn()`. Persist `winText`/`nextStepText` in CloseDay. Tests: reload-mid-draft, reopen-keeps-text |
| F2 | **Auto-detect goal reached at 100%** (#9) | High — celebration + win capture is the emotional payoff | M | Watch `progressOf(goal)`; on transition to 100 with `!done`, call `updateGoal(id,{done:true})` and show the celebration card; only fire on transitions, not pre-existing 100% goals on load |
| F3 | **Count win/check-in days as activity** (#8) | Med-high — Recap/streaks tell the truth on quiet-but-meaningful days | S | Extend `activeDays(completions, sessions, wins=[], checkInDays=[])` with optional params; pass at the 3 call sites (`Dashboard.astro:501`, `Insights.astro:335`, `Recap.astro` buildSlides). No storage change |
| F4 | **DST fix for `mindfulPromptForWeek`** (#5) | Low-med, real bug | S | Replace epoch-ms division with `Math.floor(daysBetween("1970-01-05", week) / 7)`; vitest cases around 2026-03-08 / 2026-11-01 |
| F5 | **Field-level multi-tab merge for goals** (#11) | Med | M | Generalize `checkInMerge.ts` into a per-field LWW merge for `Goal`; keep whole-entry LWW as fallback. Tests: extend `tests/multitab-goals.spec.ts` |
| F6 | **Per-week "goals reached" in check-in stats + label fix** (#10) | Med | S | Use `reachedGoalsInRange(week, addDays(week,6))` for the third stat in `Goals.astro:806-820`; relabel "goals reached"; update `tests/goals-check-in.spec.ts` expectations |
| F7 | **Confirm before clearing a note deletes it** (#12) | Low-med — accidental data loss | S | `confirm(...)` in `saveNoteText` when new text is empty and old wasn't |
| F8 | **Backup migration map** (#14) | Low now, saves pain later | S | `MIGRATIONS: Record<number, (data) => data>` applied in `importBackup` before the version check; reject only `version > CURRENT` |
| F9 | **Storage-growth policy** (#13) | Low-med | M | Optional pruning of `history` older than 24 months (keep cluster progress intact), plus a "back up your data" hint in Settings before import/reset |
| F10 | **Recap live refresh + saveStatus cosmetic** (#15, #16) | Low | S | Rebuild slides on `storage` events while open; skip watcher reset when the change came from this tab's own save |

---

# Part B — Pre-deployment senior-dev agent roster

Built from `planning/pre-deployment-audits-2026-11-27.md` (gaps 1–9, milestones M1–M7, audits A1–A10) plus static-host specifics for a zero-backend Astro site on Cloudflare Pages / Netlify. Confirmed current gaps: (1) no CI — `.github/` has only `dependabot.yml`; (2) `site` unset in `astro.config.mjs`, so no canonical/`og:url`/`og:image` and `public/og-image.png` is unused; (3) no `404.astro`, `robots.txt`, or sitemap; (4) `public/_headers` has no `Cache-Control`; (5) all deps use `^` ranges, incl. `@playwright/test ^1.65.1` despite the AGENTS.md exact-pin rule; (6) no LICENSE and `README.md` is gitignored; (7) `feedbackEmail` empty in `src/data/site.json` — Feedback falls back to copy-to-clipboard, acceptable but should be a decision; (8) `playwright.config.ts` `webServer` runs `npm run dev`, which omits the CSP — E2E never exercises the production CSP (use `npm run preview`); (9) no hosting target chosen.

**Hosting recommendation:** Cloudflare Pages. Zero-backend static site, `_headers` supported, automatic HTTPS, per-PR preview deployments, one-click rollback, free tier, custom domain. Netlify is the viable alternative. Either way: both serve `404.html` with a real 404 status; `_headers` only takes effect on the host, never in `astro dev`/`preview`. Consider `build.format: 'directory'` so canonical URLs are `/principles` on both hosts.

## B.1 Roster (run in this order)

| Order | Role (model per AGENTS.md) | Check | Done-when criteria |
|---|---|---|---|
| R0 | **Owner decisions (human, not an agent)** | Pick host + production domain; set `site`; decide LICENSE + README; decide `feedbackEmail`; HSTS stance; confirm "no analytics/tracking" is a stated feature | Written decisions recorded |
| R1 | Release-prep agent (`zai-glm-5-3`) | **M1 green main:** merge/park open PRs (#149, #150, #151, #153); run `npm ci`, type-check, build, `npm test`, and `npx playwright test` **against `npm run preview`** (dev omits the CSP — gap 8) | All five commands pass on `main`; zero console errors/CSP violations during E2E |
| R2 | CI/infra agent (`zai-glm-5-3`) | **M3:** one `.github/workflows/ci.yml` — SHA-pinned actions, `permissions: contents: read`, npm cache keyed on lockfile, Node ≥22.23.4; steps: `npm ci` → type-check → build → `npm test` → Playwright against a **preview** server (fix gap 8) → `npm audit --omit=dev` + `npm audit signatures`; upload playwright-report on failure. Owner enables branch protection on `main` | Workflow green on a real PR; branch-protection evidence; no new npm deps |
| R3 | Supply-chain agent (`mistral-large-4-0`, low) | **Gap 5:** pin every dependency to the exact lockfile version (drop all `^`/`~`); `npm audit`, `npm audit signatures`, `npm ls --all --omit=dev`; license table of everything shipped in `dist/` + attribution; install-script list; verify vitest/playwright are dev-only and absent from the page import graph | 0 vulnerabilities; pin diff applied; license table; test-tooling isolation proven |
| R4 | Security agent (`mistral-large-4-0`, high) | **A2:** grep `dist/` and `src/` for sinks (`x-html`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`, `new Function`, string `setTimeout`, `javascript:`, `srcdoc`); verify the CSP `sha256` in `dist/index.html` matches the single inline preference script byte-for-byte; no external URL in any script/style/font/img; fuzz `importBackup` (wrong version, `__proto__`/`constructor` keys, arrays-as-objects, 5 MB strings, deep nesting, wrong types); corrupt each localStorage key at load; document `'unsafe-eval'` (Alpine needs it); confirm HSTS scope | Findings table severity \| file:line \| proof \| fix; **no High/Critical** (or each fixed); verdict "ship / ship after X". *(2026-11-27 run: PR #151 — no critical/high; medium type-confusion fixes landed.)* |
| R5 | Static-assets & SEO agent (`zai-glm-5-3-flash`) | **M2/M4 + gaps 2,3,4:** set `site` in `astro.config.mjs`; add `src/pages/404.astro`, `public/robots.txt`, `public/sitemap.xml`; extend `public/_headers` with `/_astro/*` → `Cache-Control: public, max-age=31536000, immutable` and HTML → `max-age=0, must-revalidate` (keep every existing header); decide `build.format` + canonicals; verify manifest, icons, `theme-color`, og/twitter tags in built HTML | type-check + build pass; `dist/` contains 404/robots/sitemap/_headers with cache rules; og/canonical tags present |
| R6 | Performance agent (`mistral-large-4-0`, low) | **A5:** Lighthouse (mobile, throttled) against preview, 3 runs × 3 pages: LCP < 2.5 s, CLS < 0.1, transfer size, JS gzip (today: dist 2.3 MB, JS ≈284 KB raw, fonts 528 KB across 5 families), request count, proof only the selected font family downloads; render-blocking CSS; long tasks during Alpine init; `Cache-Control` on `/_astro/*` on the host | Median table page \| LCP \| TBT \| CLS \| JS gzip \| requests \| fonts; proposed CI budgets; top 3 wins with files |
| R7 | Accessibility agent (`mistral-large-4-0`, with screenshots) | **A4:** WCAG 2.2 AA on all 3 pages + all dialogs, light+dark × 9 accents: keyboard-only walkthrough of every flow incl. focus traps/return (`src/lib/focusTrap.ts`), axe/Lighthouse a11y pass (no new npm dep), 2.4.11 focus-not-obscured, 2.5.7 dragging alternative for board DnD, 2.5.8 target size ≥24 px, reduced motion, 320 px reflow, 200% zoom, contrast ratios. *(2026-11-27 UI audit found: 1 dark-mode contrast failure 4.0:1 in taskManager, board-card touch overlap, sub-44px touch targets — see `docs/audits/2026-11-27-ui-audit.md`.)* | Zero AA failures, or each accepted in writing; findings grouped blocking vs nice-to-have with screenshot regions |
| R8 | Cross-browser/responsive agent (`mistral-large-4-0`, with screenshots) | **A6:** Playwright config with chromium+webkit+firefox projects against the preview server; run all specs in 3 engines; screenshot matrix at 320/375/768/1024/1440 of every view; touch viewport (board drag, tap targets, on-screen keyboard over Quick add); Safari private-mode localStorage behavior | Spec failures triaged by engine; visual issue list engine \| width \| page \| region \| fix |
| R9 | Data-durability agent (`zai-glm-5-3`) | **A7 + Part A must-fixes M-A2/M-A3:** upgrade path from previous release on same origin; corrupt JSON per key; wrong types; quota-full (`saveJson` toast + goals-store retry); Safari private mode / storage disabled; backup export→clear→import deep-equal round trip; failed-import rollback; `__proto__` keys; clock/DST across midnight; all `tests/multitab-*.spec.ts` | No data-loss scenario; every scenario executed or written as a proposed test; Part A must-fixes merged with tests |
| R10 | Deploy/smoke/rollback agent (`zai-glm-5-3`) | **M6 / A10:** deploy a PR preview to the chosen host; `curl -sI` matrix: `/`, `/principles`, `/roadmap`, `/does-not-exist` (must be 404 status), `/_astro/<js>` (immutable cache), manifest, robots, sitemap; confirm HTTPS redirect, HSTS, CSP meta, all `_headers`; browser core flow with console open: add task, run+finish a Pomodoro, weekly check-in, close the day, export backup, reload, data intact, zero CSP violations; multi-tab sync on the real origin; **execute once** the host rollback steps and re-run the curl checks | A10 table URL \| status \| headers-OK all pass on preview URL; flow steps pass; rollback executed once and verified |
| R11 | Privacy/legal/content agent (`mistral-large-4-0`, low) | **A9 + gap 7:** read every user-facing string; state plainly that data lives only in this browser's localStorage, that clearing site data deletes it, and how to back up (Settings export); no-cookies/no-tracking statement; `feedbackEmail` behavior documented; LICENSE + README proposals | Issue list location \| issue \| proposed text; licensing/README decisions requested from owner |
| R12 | Go/no-go & launch (`mistral-large-4-0`, low) | **M7:** final gate, deploy production, re-run A10 against the production domain, curl headers on the real domain, tag `v1.0.0` only after go; post-launch monitoring = host deploy logs + uptime only (no analytics by design) | Gate table all pass with evidence; post-launch A10 recorded |

## B.2 Ordering rationale

R0 first (everything blocks on the domain/host). R1 before R2 so CI starts on a green main. R2 immediately after, so R3/R5 file changes and every later PR are gated by CI + branch protection. R3 and R5 are small file edits that go through CI. R4, R6, R7, R8, R9 are read-only audits that can run in parallel once M4 is merged, but R4 (security) and R9 (durability) must be clear before R10. R10 needs a real host + preview URL. R11 any time before go. R12 last.

## B.3 Final go/no-go checklist (all must be YES)

| Gate | Evidence required |
|---|---|
| Working tree committed; `main` green | R1: `npm ci`, type-check, build, Vitest, Playwright-vs-preview all pass |
| CI enforced | `.github/workflows/ci.yml` green on a PR; branch protection on `main` (R2) |
| Supply chain | Exact pins, lockfile intact, `npm audit --omit=dev` = 0, signatures clean, license list done (R3) |
| Security | R4 verdict "ship" or "ship after X" with X done; CSP hash verified in `dist/`; import fuzzing clean; `_headers` + HSTS on the real host (R4+R10) |
| Launch files | `site` set; 404, robots, sitemap, cache headers; canonical/og/twitter in built HTML (R5) |
| Performance | R6 budgets met on preview (LCP < 2.5 s, CLS < 0.1, JS gzip within budget, only selected font loads) |
| Accessibility | R7: zero WCAG 2.2 AA failures (or written acceptances) |
| Cross-browser | R8: no blocking engine-specific failures; 320 px reflow clean |
| Data durability | R9: no data-loss scenario; backup round-trip + rollback verified; Part A must-fixes M-A2/M-A3 merged with tests |
| Preview smoke + rollback | R10 pass on the host's preview URL; one real rollback executed and verified |
| Privacy/legal | R11: localStorage-only + backup + no-tracking statements placed; LICENSE/README/feedbackEmail decided (R0) |
| Production | R12: A10 re-run on the production domain passes; headers verified; release tagged |
