# Swarm brief: review and push Zen Frame media kit, OG card, and Principles page

## Mission

Review the four new/updated brand and media additions in `astro-zen-frame`, fix any issues found, verify all checks pass, and push a clean branch and PR to GitHub (`Corbin-tech/Zen-Frame`).

### Files in scope

| File | State | Purpose |
|---|---|---|
| `docs/media-kit.md` | New | Brand foundation, bios, channel plan, first 10 launch posts, Calm Design Principles copy, and 2026–2027 milestones |
| `public/og-image.png` | New | 1200x630 Pine (`#173F3A`) and Paper (`#F7F5EF`) social card based on Panel 01 with exact `src/lib/favicon.ts` ensō geometry |
| `src/pages/principles.astro` | New | Static `/principles` page bridging local-first Core Zen Frame with planned Plus helpers |
| `src/components/footer.astro` | Modified | Adds subtle `Calm design principles` link to `/principles` with `aria-current="page"` |

### Explicit exclusions (do not stage or commit)

The working tree currently contains local review, audit, and board files that must stay untracked and out of git:

- `Zen-Frame-Visual-Identity-Board.png`
- `brand-refresh-plan-2026-11-20.md`
- `pr-review-*.md` (all local PR review and Slack summary files)
- `security-audit-2026-11-20.md`
- Standard repo exclusions: `AGENTS.md`, `.astro/`, `.env`, `.claude/`

## Ground rules for every agent

- **Stack:** Astro 7.4.12 (`output: 'static'`, `assetsInlineLimit: 0`), Alpine.js 3.17.5, Tailwind CSS 3.4.19, Flowbite 2.5.2, TypeScript 7.0.2. Do not upgrade Tailwind or Flowbite.
- **Dependencies:** No new npm packages.
- **Security:** Zero XSS sinks (`x-html`, `innerHTML`, `outerHTML`, `eval`, `new Function`). Zero external fonts, CDNs, analytics, or outbound `fetch()` calls. Preserve the CSP in `src/layouts/Layout.astro` and `public/_headers`. Every `target="_blank"` link must include `rel="noopener noreferrer"`.
- **Branch safety:** The repo is currently checked out on `brand/components` (Phase 4). `src/pages/principles.astro` relies on `.btn-primary` and `.btn-secondary` introduced on `brand/components`. Cut a clean branch `brand/media-and-principles` from `brand/components` (do not commit directly to `main`, do not force-push, and do not mix unrelated files).
- **Voice rules (Phase 5):** Calm, clear, encouraging. Sentence case, zero exclamation marks, no "catching up" language, no hype copy.
- **Report format:** Structure every agent report as `Goal -> Context -> Constraints -> Done-when -> Report (1 line per changed file)` followed by verification output.

## Order of work

| Workstream | Suggested model | Depends on | Can start |
|---|---|---|---|
| R1 Visual, accessibility, and brand audit | `mistral-large-4-0` | — | Now |
| R2 Security, CSP, and copy accuracy audit | `mistral-large-4-0` | — | Now |
| R3 Build, unit, and e2e verification | `zai-glm-5-3` | — | Now |
| R4 Fixes (if any), branch, commit, push, and PR | `zai-glm-5-3` | R1, R2, R3 | After R1–R3 pass |

R1, R2, and R3 run in parallel. Chief of Staff consolidates findings, routes any fixes back to the owning file, re-runs R3 if code changed, and then authorizes R4.

## Workstreams

### R1: Visual, accessibility, and brand audit

- **Suggested model:** `mistral-large-4-0` (vision-capable).
- **Inspect:**
  - `public/og-image.png`: Confirm exact `1200 x 630` PNG dimensions, `#173F3A` Pine background, `#F7F5EF` Paper mark and text, exact ensō gap/dot geometry matching `src/lib/favicon.ts`, crisp typography, and Panel 01 fidelity.
  - `src/pages/principles.astro` rendered in a browser at `375px` (phone) and `1440px` (desktop), in both light and dark themes:
    - Confirm WCAG 2.2 AA contrast (4.5:1+ for text, 3:1+ for UI elements) across Paper, white `.panel`, and dark Pine `slate-800`/`slate-900` surfaces.
    - Confirm 44px touch targets on phone widths (`touch-target` on header links/buttons and CTA).
    - Confirm `data-font` override works when switching to Lexend, Atkinson Hyperlegible Next, or Outfit (`.principles-serif` yields to `font-family: inherit`).
    - Confirm `prefers-reduced-motion` and keyboard focus outlines (`:focus-visible`) work cleanly across header, table, and CTA.
  - `src/components/footer.astro`: Confirm the `Calm design principles` link aligns cleanly at phone and desktop widths and sets `aria-current="page"` on `/principles`.
- **Done when:** All visual and accessibility checks pass with no contrast, overflow, or alignment regressions.

### R2: Security, CSP, and copy accuracy audit

- **Suggested model:** `mistral-large-4-0` (high reasoning).
- **Inspect:**
  - `src/pages/principles.astro` and `src/components/footer.astro`:
    - Zero XSS sinks (`x-html`, `innerHTML`, `eval`).
    - Zero external URLs, third-party embeds, or inline scripts that could alter the `Layout.astro` CSP hash.
    - `public/_headers` untouched.
  - `docs/media-kit.md` and `src/pages/principles.astro` copy accuracy:
    - All statements about Core Zen Frame match the actual codebase (`localStorage`, zero accounts/tracking, WCAG 2.2 AA across 9 accents, self-hosted fonts, Stillpoint recap).
    - All statements about Zen Frame Plus accurately reflect `docs/roadmap/neuro-tools.md` (explicitly marked as *planned* / *coming in Plus*, opt-in, preview-never-auto-apply, zero retention).
    - Strict adherence to Phase 5 voice rules (sentence case, zero exclamation marks, no "catching up" pressure).
    - Zero accidental local filesystem paths, personal tokens, or secrets.
- **Done when:** Security and copy audit signs off with zero blockers.

### R3: Build, unit, and e2e verification

- **Suggested model:** `zai-glm-5-3`.
- **Run:**
  1. `npm run type-check` (must exit 0).
  2. `npm run build` (must exit 0; verify `dist/principles.html` and `dist/og-image.png` are present).
  3. `npm run test` (all Vitest and Node tests must pass).
  4. `npm run test:e2e` (all Playwright specs must pass — note: if port 4321 already has an Astro dev server running, build and preview on a dedicated port per `brand-refresh-plan-2026-11-20.md` and stop the preview server afterward).
- **Check:** Confirm the added footer link does not break any existing e2e selectors or layout wrap assertions.
- **Done when:** All four verification commands pass with 0 errors and clean output.

### R4: Branch, commit, push, and PR

- **Suggested model:** `zai-glm-5-3`.
- **Precondition:** R1, R2, and R3 are all signed off with 0 errors. If any edits were made during review, re-run `npm run type-check && npm run build && npm run test` first.
- **Steps:**
  1. Check `git status` and confirm current branch (`brand/components`).
  2. Create and switch to `brand/media-and-principles`:
     ```bash
     git checkout -b brand/media-and-principles
     ```
  3. Stage **only** the four scoped files (never use `git add -A` or `git add .`):
     ```bash
     git add docs/media-kit.md public/og-image.png src/pages/principles.astro src/components/footer.astro
     ```
     *(Include `docs/roadmap/media-principles-swarm.md` only if the human owner explicitly asks to commit the swarm brief.)*
  4. Verify `git diff --cached --stat` lists only the intended files and none of the excluded local files.
  5. Commit with a concise, clear message:
     ```bash
     git commit -m "Add media kit, Panel 01 social card, and Calm Design Principles page"
     ```
  6. Push the branch to `origin`:
     ```bash
     git push -u origin brand/media-and-principles
     ```
  7. Open a GitHub PR targeting `brand/components` (or note in the PR description to retarget `main` once `brand/components` merges), including the R1–R3 verification summary and noting that Item 2.5 (`site` in `astro.config.mjs` and `og:image` meta tags in `Layout.astro`) remains gated on the production URL.
- **Done when:** Branch is pushed to `origin`, working tree has no unintended staged changes, and PR link is reported to the owner.

## Human gates

- **Merging to `main`:** Human approves and merges the PR.
- **Item 2.5 completion:** Human supplies the production domain to set `site` in `astro.config.mjs`, wire `og:image` in `src/layouts/Layout.astro`, and replace `[production-url]` in `docs/media-kit.md`.
- **Publishing:** Human publishes external social posts from `docs/media-kit.md`.
