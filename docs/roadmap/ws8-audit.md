# WS8 security and accessibility audit

Reviewed checkout `swarm/ws8-integration`, commit `6e6eb05`, against local `main`, 2026-11-20. Eval remediation verified at `57e852d` on the same date. All repository paths below are relative to the repo root; original source line references describe the reviewed checkout unless marked fixed. The original audit made no repository edits. Remediation changed only eval files, followed by this audit copy; no src/dist edits, build, or restart/change of the Pages mock on :8788. Only read-only HEAD/static HTML requests touched that server; evaluation ran in a separate Node process, not against it.

Scope: static source review, grep, main comparison, production HTTP headers/HTML, isolated in-memory malformed-backup reproduction, dependency audit, and WS7 offline evaluation. PASS means the stated static/control check passed, not a completed browser/screen-reader certification. Focus visibility, contrast, computed hit boxes, screen-reader announcements, Alpine runtime behavior and actual reduced-motion rendering remain visually/runtime unverified by this audit. No real account/provider/key/payment was used.

## Summary and disposition

- Security: **15 PASS, 2 FAIL** (17 items).
- Accessibility: **12 PASS, 4 FAIL** (16 items).
- Combined security/accessibility: **27 PASS, 6 FAIL**; zero identified small integration-caused UI/security must-fixes, six follow-ups to component/foundation owners.
- Evaluation: **3 PASS, 0 outstanding FAIL** after remediation. The original documented run failed (74/74 unavailable), and an external adapter isolated the cause. **E01 FIXED at `57e852d`**: the mock-only runner now supplies the fake pre-auth IP header and an in-memory limiter; direct documented workflow yields 74/74 HTTP 200 without an external adapter. Non-mock modes are unchanged and still require separate IP-gate integration before real-provider evaluation.
- This is **not launch sign-off**. Real consented datasets, independent human usefulness ratings, real-model latency, and browser/assistive-technology verification remain required.

### Every outstanding failure and resolved must-fix

1. **S07 FAIL — follow-up, WS1/storage, high priority:** imported `todos: [null]` is accepted and persisted, then crashes todo initialization on reload; validate/filter todo records before writing/normalizing (`src/lib/storage.ts:147-159`, `src/components/SettingsPanel.astro:539-548`, `src/stores/todoStore.ts:131`, `src/lib/assist/todoLoad.ts:4-10`).
2. **S17 FAIL — follow-up, WS2/WS3 docs, low risk:** per-account limit runs before input validation, not the documented order; invalid requests consume rate-limit capacity but not trial/monthly allowance (`server/assist/handler.ts:57-67`, `server/auth/SETUP.md:35`).
3. **A10 FAIL — follow-up, WS6:** BrainDump Discard removes the currently focused preview button without restoring focus to the draft (`src/components/BrainDump.astro:24-25,54-55`, `src/lib/brainDump.ts:53,56-59,104-113`).
4. **A12 FAIL — follow-up, WS3:** Plus sign-in/code/resend/checkout/portal working states have no explicit live status/aria-busy; the only working status is hidden once ready (`src/components/PlusPanel.astro:15-17,25-49,75-89`); changed focused button names may announce in some AT, not verified.
5. **A14 FAIL — follow-up, WS3/WS5/WS6:** most helper controls do not guarantee the app's 44px coarse-pointer target convention (Breakdown/TaskSteps 36px minimum, BrainDump/Plus typically 36px); Estimate uses `touch-target` (`src/components/BreakdownPanel.astro:8`, `src/components/TaskSteps.astro:17,34,42,49,65`, `src/components/BrainDump.astro:3`, `src/components/PlusPanel.astro:3-4`, `src/styles/tailwind.css:6-12`). This is a 44px comfort/enhanced-target criterion, **not** a demonstrated WCAG 2.2 AA 24px failure.
6. **A16 FAIL — follow-up, existing Settings shell:** Plus is inside an aria-modal Settings dialog without a Tab focus trap or background inert handling; keyboard focus can leave the modal (`src/components/SettingsPanel.astro:15-20,33-46,80-85`). Existing shell deficiency, not introduced by the include.
7. **E01 PASS — FIXED, WS8 integration, `57e852d`:** `eval/run.ts:9,36,41-42` supplies documentation-only CF-Connecting-IP and a dataset-sized in-memory limiter only for `--model mock`; regression `eval/eval.check.ts:45-51` asserts the real-handler CLI returns HTTP 200. Production fail-closed behavior and non-mock modes are unchanged. Direct full run: 74/74 HTTP 200; no external adapter needed.

## Security checklist

| ID | Result | Check and file:line evidence |
|---|---|---|
| S01 | PASS | CSP declaration byte-for-byte identical to main: `src/layouts/Layout.astro:43-55`; only self/data/blob sources, no third-party origins; production meta `:62`. Existing unsafe-eval is required by current Alpine and unchanged, not a new application sink. Fixed compile-time preference script `:21-38,64` uses Astro set:html, not model/user HTML; excluded from neither review nor explanation. |
| S02 | PASS | `public/_headers:5-13` identical to main. HEAD / returned frame-ancestors none, DENY, nosniff, referrer/permissions/COOP/CORP/HSTS headers. Production page retains the CSP meta. |
| S03 | PASS | `git grep -nE 'x-html|innerHTML|outerHTML|eval\(|new Function|insertAdjacentHTML|document\.write' -- src server functions` returned no matches (exit 1). Representative rendering sites: `src/components/BreakdownPanel.astro:37,71`, `TaskSteps.astro:31,36,51`, `BrainDump.astro:40,46`, `EstimatePicker.astro:69`. Scope excludes dependencies and generated bundles; Alpine's existing evaluator is not claimed absent. |
| S04 | PASS | Server calls `cleanAnswer` before complete/response (`server/assist/handler.ts:74-78`); client calls it before returning results (`src/lib/assist/cloudProvider.ts:25`); `server/assist/validation.ts:1,6-17` dispatches sanitize cleaners, empty-result/detail bounds; cleaners bound text/count/minutes (`src/lib/assist/sanitize.ts:49-62,78-113`). |
| S05 | PASS | Display output is x-text, never HTML (`src/components/TaskSteps.astro:29-36,43,51-52`, `BreakdownPanel.astro:71,83`, `BrainDump.astro:40,46`, `EstimatePicker.astro:69`). Editable preview fields necessarily use safe native value bindings/x-model (`BreakdownPanel.astro:72-76`, `BrainDump.astro:31-46`, `EstimatePicker.astro:73-75`), not x-text inside form controls. Model cannot choose classes/actions/URLs/IDs (`src/scripts/BreakdownPanel.ts:133`, `src/lib/brainDump.ts:18-23`). |
| S06 | PASS | For well-formed todo objects, restore normalizes estimates and step text/id/done/minutes (`src/lib/assist/todoLoad.ts:4-17`, `src/stores/todoStore.ts:131`). Minutes become finite clamped 1..480 or null (`src/lib/assist/sanitize.ts:59-62`); step text capped at 200 and done is strict boolean. No HTML interpretation. Missing record validation is separately failed S07. No claim that restored list lengths/IDs are fully bounded/deduplicated. |
| S07 | FAIL | Restore validates todos only as an array (`src/lib/storage.ts:147-159`), then reloads (`SettingsPanel.astro:539-548`). `[null]` reaches `normalizeLoadedTodo` and throws accessing parentId (`todoStore.ts:131`, `todoLoad.ts:7`). Isolated reproduction below; denial of local app initialization, not XSS. |
| S08 | PASS | Backups explicitly allowlist keys (`src/lib/storage.ts:3-22,104-121,147`); no assistConsent or token keys. Consent is a separate boolean (`src/stores/assistStore.ts:50,69-78`); saved assist prefs are level only (`:82-85`). Account token never enters either backup namespace. This does not promise to scrub arbitrary user-authored strings/custom malicious keys nested inside allowed backup objects. |
| S09 | PASS | Bearer/expiry are closure variables (`src/stores/plusStore.ts:50-54`), removed from public account data (`:86-90`), cleared on forget (`:94-101`), obtained through getToken (`:136-140`). No token localStorage/sessionStorage/log writes found; bearer used only Authorization (`src/lib/assist/cloudProvider.ts:12-15`). Consent and account rechecked before/after async retrieval (`src/lib/assist/index.ts:9-19`). Session replies are no-store (`server/auth/http.ts:81-85`). |
| S10 | PASS | Session cookie HttpOnly, SameSite=Strict, Path=/, finite Max-Age; HTTPS adds Secure and __Host prefix (`server/auth/session.ts:7-20`). Local HTTP intentionally uses zen-plus-local without Secure; configured origin allows HTTP only loopback (`server/auth/http.ts:28-35`). Cookie hash only in database (`session.ts:23-27`). |
| S11 | PASS | Assist requires Origin == request origin and Sec-Fetch-Site same-origin when supplied (`server/assist/handler.ts:49`); account uses configured appOrigin plus Origin check (`server/auth/handler.ts:50-53`, `server/auth/http.ts:28-40`); billing likewise (`server/billing/handler.ts:119-132`). Webhook intentionally uses signature rather than browser Origin (`:122-129`, `server/billing/stripe.ts:128-165`). No production Access-Control-Allow-* header setters found in server/functions (the test asserts the header is absent). POST-only routes, no permissive OPTIONS/CORS. |
| S12 | PASS | `git grep -nE 'PUBLIC_|import\.meta\.env' -- src server functions` only found `src/layouts/Layout.astro:62` import.meta.env.PROD (build boolean, not a secret). API/signing/email/Stripe bindings are server env types/adapters (`functions/api/assist/[endpoint].ts:9-13,24-26`, `server/auth/email.ts:1-5`, `server/billing/stripe.ts:5-10`). Client uses opaque short-lived bearer, not server signing/provider secrets. |
| S13 | PASS | No production server/functions request/task-text logging found. Logger emits fixed scope/reason only (`server/auth/http.ts:88-100`); assist catches to fixed code (`server/assist/handler.ts:80`). Check scripts log aggregate results, not task text (`server/assist/handler.check.ts:334`). Client storage warnings log key/error, not serialized values (`src/lib/storage.ts:71,94`). External local mock intentionally prints only fake sign-in codes and is not production code. |
| S14 | PASS | Client fetch sites are same-origin /api only: constants (`src/lib/assist/api.ts:4-8`) used by cloud provider (`cloudProvider.ts:15`), Plus post (`src/stores/plusStore.ts:27-35`). Other external fetches are server-side (`server/auth/email.ts:29`, `server/assist/anthropic.ts:14`, `server/billing/stripe.ts:30-41`). Browser static assets are self-hosted; no client provider fetch introduced. |
| S15 | PASS | Stripe redirects parse URL and require exact https checkout.stripe.com/billing.stripe.com origin, no username/password (`src/stores/plusStore.ts:44-47,199-218`); server independently validates hosted URL (`server/billing/stripe.ts:49-53,73-74,86-90`). No model output is a redirect destination. |
| S16 | PASS | `npm audit --omit=dev` exit 0: `found 0 vulnerabilities`. Covers installed production dependency advisory data at run time, not a source/security proof; lockfile unchanged. Dependency provenance: `package.json:14-29`, `package-lock.json:1-35`. |
| S17 | FAIL | Documentation/order conformance: account limit `server/assist/handler.ts:59` precedes body/shape validation `:60-65`; SETUP `server/auth/SETUP.md:35` describes validate then per-user limit. Both precede reserve `:67`; invalid input cannot charge allowance or call model. Earlier throttling bounds authenticated malformed-request work, but malformed requests use rate-limit slots and may get 429 before 400/413. Low security risk; align docs/order with WS2 rather than bypass throttling. |

### Security command evidence

```text
CSP declaration identical to main: True
_headers identical to main: True
Production CSP meta present: True
Built Plus section present: True
Built Breakdown panel templates present: True
Built BrainDump modal present: True
```

Sink grep: empty, exit 1. Env grep:
```text
src/layouts/Layout.astro:62: {import.meta.env.PROD && <meta http-equiv="Content-Security-Policy" content={contentSecurityPolicy} />}
```

Dependency audit (Node v24.22.3, npm 11.19.1):
```text
found 0 vulnerabilities
```

Isolated backup reproduction (a fake Map-backed localStorage in Node, not the browser/storage under test):
```text
Malformed todos backup import: {"ok":true,"count":1}
Reload normalization: TypeError: Cannot read properties of null (reading 'parentId')
```

## Accessibility checklist (static only)

| ID | Result | Check and file:line evidence |
|---|---|---|
| A01 | PASS | Breakdown named trigger/expanded/controls, labelled panel/title, wrapped detail select and step textareas, named per-step actions (`src/components/BreakdownPanel.astro:15-44,70-82`). |
| A02 | PASS | Breakdown open focuses level; working focuses Cancel; cancel/error returns to Generate; accepted preview focuses first editor; close/Discard/Accept returns trigger or fallback (`src/scripts/BreakdownPanel.ts:57-74,79-91,104-108,121-141,164-171`). Esc handler `BreakdownPanel.astro:32`. TaskRow fallback task-name input `TaskSteps.astro:13`; Zen explicit focusable title `zenToDoList.astro:137-149`. Static paths present, runtime focus visibility unverified. |
| A03 | PASS | Breakdown working/completion/cancel announcements in status region plus error role alert (`src/components/BreakdownPanel.astro:26,48-49`, `src/scripts/BreakdownPanel.ts:107,122,135,171`). Cancel control present `BreakdownPanel.astro:61`. |
| A04 | PASS | Breakdown Up/Down/Remove are native buttons with contextual accessible names and boundary disables (`src/components/BreakdownPanel.astro:79-82`); moves/remove/add update live announcement and restore focus (`src/scripts/BreakdownPanel.ts:144-162`). No drag-only requirement. |
| A05 | PASS | TaskSteps native details/summary, labelled checklist checkboxes and progress status; Zen labelled next-step checkbox and status (`src/components/TaskSteps.astro:28-56`). TaskRow includes `:TaskRow.astro:121`; Zen includes `zenToDoList.astro:149`; Board has independent markup, no TaskRow include. |
| A06 | PASS | TaskSteps promotion focuses Cancel, Esc/Cancel/Accept restores promote control, status message (`src/scripts/TaskSteps.ts:49-75`, `src/components/TaskSteps.astro:60-68`); completing final Zen step focuses programmatic heading (`TaskSteps.ts:42-47`, `TaskSteps.astro:31`). Native checklist not an overlay, so Escape-to-collapse details not required. |
| A07 | PASS | Estimate trigger has task-specific aria-label/expanded/controls, group named, Minutes label uses generated unique id; native buttons/input keyboard reachable; pending/error/result status regions (`src/components/EstimatePicker.astro:15-35,39-44,59-83`). Suggest uses aria-disabled with matching click guard (`:55-56`). |
| A08 | PASS | Estimate open focuses first pick; Custom focuses input; preset/Clear/Save/Accept/Esc restores chip; outside/focusout closes; Cancel restores Suggest (`src/components/EstimatePicker.astro:10-18,43-49,61,66`, `src/lib/estimates.ts:87-104`). Result edit controls remain keyboard reachable; no automatic result-editor focus promised. |
| A09 | PASS | BrainDump named modal, label-wrapped draft/cluster/task/minutes/move controls; native Move-to alternative to drag, restores moved select focus; Esc and Tab wrapping, open/close focus, Accept focus; working/error/live announcements (`src/components/BrainDump.astro:8-23,31-46,59`, `src/lib/brainDump.ts:60-79,85-93,104-111`). Background inert behavior still needs browser/AT check. |
| A10 | FAIL | BrainDump Discard calls assist.discard without focusing persistent draft (`src/lib/brainDump.ts:113`), unlike Accept (`:107`); preview watcher clears clusters (`:53,56-59`) and x-if removes button subtree (`src/components/BrainDump.astro:24-25,54-55`). Focus likely falls to body; exact browser landing unverified, missing return-focus path statically established. |
| A11 | PASS | Plus explicit email/code labels, input types/autocomplete/help; named text buttons; code screen focuses code, verified state focuses heading, Change email/Sign out focus email (`src/components/PlusPanel.astro:9,25-49,75-89`). Containing Settings open/close/Esc focus path `SettingsPanel.astro:15-20,52-57`. |
| A12 | FAIL | Plus initial check has role=status, errors alert and allowance polite live (`src/components/PlusPanel.astro:13-17,56-63`) but send/verify/checkout/portal busy state has no live region or aria-busy (`:25-49,75-89`). After ready, :15 hides initial status. No assertion that every AT fails to announce changed button text; reliable explicit working announcement is missing. |
| A13 | PASS | Explicit focus-visible rings/outlines on Breakdown (`BreakdownPanel.astro:8`), TaskSteps action (`TaskSteps.astro:17,65`), Estimate (`EstimatePicker.astro:4,25`), BrainDump (`BrainDump.astro:3`); inputs have focus styles. Plus buttons/summary retain native default focus (no outline suppression: `PlusPanel.astro:2-4`, `TaskSteps.astro:42`). Native focus appearance/contrast not visually verified; recommend consistent explicit ring styling for Plus/summary without claiming existing native outlines are absent. |
| A14 | FAIL | Enhanced/coarse-pointer 44px convention not applied to all helper controls: `src/styles/tailwind.css:6-12` only expands .touch-target. Estimate applies it (`EstimatePicker.astro:4,25`); Breakdown min-h-9=36px (`BreakdownPanel.astro:8`), TaskSteps 36/40px rows/actions (`TaskSteps.astro:17,34,42,49,65`); BrainDump/Plus buttons py-2+text-sm typically 36px (`BrainDump.astro:3`, `PlusPanel.astro:3-4`). No browser measurement and no automatic WCAG AA failure asserted. |
| A15 | PASS | No new motion in helper components; existing transition utilities/settings slide covered by global prefers-reduced-motion duration override and scroll reset (`src/layouts/Layout.astro:250-256`, `src/components/SettingsPanel.astro:36-41`, `src/components/TaskRow.astro:8`). Global style applies document-wide; computed motion not checked. |
| A16 | FAIL | Settings enclosing Plus declares aria-modal=true (`src/components/SettingsPanel.astro:33-46`) but root has no Tab trapping or inert handling (`:15-20`) and dialog has no keydown-tab handler. There is no native modal dialog or focus-trap directive. Existing shell needs focus containment; not a new Plus include defect. |

## WS7 evaluation

### Remediation verification (current result)

Fixed in `57e852d` (eval files only): reuse the existing in-memory limiter, sized to the requested item count, and supply a reserved documentation IP only in mock mode. Added a real-handler CLI regression check and README note. No production handler changes. Real-provider modes were deliberately not changed by this mock-only fix; they still need their eval IP inputs wired before live evaluation.

Documented workflow, with the supported custom output directory to keep artifacts outside git:
```sh
node eval/run.ts --dataset eval/datasets/sample.json --model mock --out /home/ubuntu/ws8/eval-fixed
node eval/autorate.ts --results /home/ubuntu/ws8/eval-fixed/results.json
node eval/report.ts --results /home/ubuntu/ws8/eval-fixed/results.json --ratings /home/ubuntu/ws8/eval-fixed/ratings-auto.csv
node eval/eval.check.ts
npm run type-check
```

```text
Completed 74 items
Auto prechecked 64 items; NOT human ratings
Report written for 1 model(s)
PASS: dataset validation, mock schemas, CSV quoting, report math/bars, adapters, auto checks, OpenAI outcomes

> astro-zen-frame@0.0.1 type-check
> tsc --noEmit
```
All commands exited 0. Type-check produced no diagnostics (existing tsconfig does not include eval; the harness executes its TypeScript via Node).

Current report (Helper / Count / Rated / Error % / Useful % / Literal % / One action % / Realistic minutes % / Median ms / p90 ms):
```text
**NOT a launch result — mock model, synthetic data, or automatic ratings.**
Consent source: synthetic. Ratings: automatic pre-checks.
| breakdown | 52 | 52 | 0.00 | 100.00 | 100.00 | 100.00 | 100.00 | 0.18 | 0.50 |
| compile | 12 | 12 | 0.00 | 100.00 | 100.00 | 100.00 | 100.00 | 0.14 | 0.32 |
| estimate | 10 | 0 | 0.00 | N/A | N/A | N/A | N/A | 0.14 | 0.18 |
- Both helpers ≥90% useful: PASS
- ≥50 breakdown and ≥10 brain dumps rated: PASS
- Each helper median <3000 ms: PASS
- Quality launch bar: NOT MET
```

### Original investigation (historical evidence)

Original outputs external to repository:
- `/home/ubuntu/ws8/eval-audit/` — exact documented command run, original all-503 result.
- `/home/ubuntu/ws8/eval-handler.mjs` — local, eval-only adapter supplying fake CF-Connecting-IP and an allow-all IP limiter; forwards real handler and all other dependencies unchanged.
- `/home/ubuntu/ws8/eval-audit-adapted/` — second complete run with that adapter, including results.json, blank human ratings.csv, ratings-auto.csv, report.md/report.json.

Commands (run from repo root under provisioned Node 24; no packages):
```sh
node eval/eval.check.ts
node eval/run.ts --dataset eval/datasets/sample.json --model mock --out /home/ubuntu/ws8/eval-audit
node eval/autorate.ts --results /home/ubuntu/ws8/eval-audit/results.json
node eval/report.ts --results /home/ubuntu/ws8/eval-audit/results.json --ratings /home/ubuntu/ws8/eval-audit/ratings-auto.csv
node eval/run.ts --dataset eval/datasets/sample.json --model mock --handler /home/ubuntu/ws8/eval-handler.mjs --out /home/ubuntu/ws8/eval-audit-adapted
node eval/autorate.ts --results /home/ubuntu/ws8/eval-audit-adapted/results.json
node eval/report.ts --results /home/ubuntu/ws8/eval-audit-adapted/results.json --ratings /home/ubuntu/ws8/eval-audit-adapted/ratings-auto.csv
```

| ID | Result | Evidence |
|---|---|---|
| E01 | PASS | Fixed at `57e852d`: `eval/run.ts:9,36,41-42` supplies mock-only pre-auth IP inputs; `eval/eval.check.ts:45-51` covers the real-handler CLI path. Current direct run: 74/74 successful. Historical failure: reviewed runner omitted both inputs and rejected all calls at `server/assist/handler.ts:52-54`; not a model-quality failure. |
| E02 | PASS | External adapter `/home/ubuntu/ws8/eval-handler.mjs:1-6` fixes only missing eval fake inputs; same dataset/mock/real handler then yields 74 HTTP 200 responses. This counter-check rules out invalid mock model schema as the cause of the original 503s. It does not test real production IP limiter behavior; intentionally eval-only allow-all, matching existing account limiter fake. |
| E03 | PASS | `eval/eval.check.ts` printed `PASS: dataset validation, mock schemas, CSV quoting, report math/bars, adapters, auto checks, OpenAI outcomes`. Coverage contract documented `eval/README.md:45-82`; reports loudly disqualify mock/synthetic/auto data. |

Original report summary:
```text
| breakdown | 52 | 52 | 100.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.08 | 0.32 |
| compile | 12 | 12 | 100.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.06 | 0.07 |
| estimate | 10 | 0 | 100.00 | N/A | N/A | N/A | N/A | 0.06 | 0.29 |
- Both helpers ≥90% useful: FAIL
- ≥50 breakdown and ≥10 brain dumps rated: PASS
- Each helper median <3000 ms: PASS
- Quality launch bar: NOT MET
```

Adapted report summary (columns: Helper / Count / Rated / Error % / Useful % / Literal % / One action % / Realistic minutes % / Median ms / p90 ms):
```text
**NOT a launch result — mock model, synthetic data, or automatic ratings.**
Consent source: synthetic. Ratings: automatic pre-checks.
| breakdown | 52 | 52 | 0.00 | 100.00 | 100.00 | 100.00 | 100.00 | 0.16 | 0.46 |
| compile | 12 | 12 | 0.00 | 100.00 | 100.00 | 100.00 | 100.00 | 0.14 | 0.20 |
| estimate | 10 | 0 | 0.00 | N/A | N/A | N/A | N/A | 0.13 | 0.30 |
- Both helpers ≥90% useful: PASS
- ≥50 breakdown and ≥10 brain dumps rated: PASS
- Each helper median <3000 ms: PASS
- Quality launch bar: NOT MET
```

The reported 100% usefulness is an automatic structural pre-check of canned synthetic answers, not human semantic usefulness. Sub-millisecond medians exclude real provider/network latency and the separate Pages mock's 600ms delay. No inference about the ≥90% usefulness or <3s real-provider launch bar is valid.
