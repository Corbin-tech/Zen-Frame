# Brand, media, and principles roadmap

Status and next milestones following the initial brand media, typography, and Calm Design Principles merges on `main`.

## 1. Shipped baseline

| Deliverable | Status | Location |
|---|---|---|
| Phase 3 typography (Newsreader `.page-title`, `.editorial`, `.eyebrow`, font overrides) | Shipped (PR #90) | `src/styles/tailwind.css`, `src/styles/preferences.css`, `src/layouts/Layout.astro` |
| Phase 4 components (panels, unified buttons, `In focus` badges, footer tagline) | Shipped (PR #89) | `src/styles/tailwind.css`, `src/components/*` |
| Media kit, Panel 01 OG card (`1200x630`), `/principles` page, footer link | Shipped (PR #89) | `docs/media-kit.md`, `public/og-image.png`, `src/pages/principles.astro`, `src/components/footer.astro` |
| Principles and footer polish (working `/principles` footer navigation & Feedback dialog, `.ripples` isolation, shared `.eyebrow`/`.editorial` reuse, page description & `Astro.site`-ready OG/Twitter meta tags, copy aligned with shipped UI) | Shipped (this PR) | `src/layouts/Layout.astro`, `src/pages/principles.astro`, `src/components/footer.astro`, `src/components/tabs.astro` |

## 2. Ground rules (apply to every milestone)

- **Stack:** Astro 7 (`output: 'static'`, `assetsInlineLimit: 0`), Alpine.js 3, Tailwind CSS 3, TypeScript 7. Do not upgrade Tailwind or Flowbite without approval.
- **Dependencies:** No new runtime npm packages (`vitest` and `@playwright/test` are approved dev-only test tools).
- **Security:** Zero XSS sinks (`x-html`, `innerHTML`, `outerHTML`, `eval`, `new Function`). Zero external fonts, CDNs, analytics, or outbound `fetch()` calls until Plus P1. Preserve the CSP in `src/layouts/Layout.astro` and `public/_headers`. Every `target="_blank"` link must include `rel="noopener noreferrer"`.
- **Voice:** Calm, clear, encouraging. Sentence case for headings, labels, and buttons. Zero exclamation marks. No "catching up" language, streak pressure, or hype copy.
- **Accessibility:** WCAG 2.2 AA contrast (4.5:1+ text, 3:1+ UI) across light mode, dark mode, and all 9 accents; 44px touch targets on phone widths; keyboard navigation; `prefers-reduced-motion`; respect user font overrides (`data-font`).

## 3. Milestones

### M1 — Production domain and live social metadata (Item 2.5)
**Goal:** Make social previews, canonical URLs, and feedback delivery work in production.
- **Human gate:** Owner supplies the production domain and optional `feedbackEmail`.
- **Deliverables:**
  1. Set `site: 'https://<production-domain>'` in `astro.config.mjs` (automatically activates `og:url`, `og:image`, and `twitter:image` in `src/layouts/Layout.astro`).
  2. Set `feedbackEmail` in `src/data/site.json` (or confirm copy-to-clipboard fallback is preferred for now).
  3. Replace `[production-url]` placeholders in `docs/media-kit.md`.
- **Done when:** `npm run build` outputs absolute `og:image` (`https://<domain>/og-image.png`) and `og:url` meta tags in `dist/index.html` and `dist/principles.html`, and live unfurlers (X, Bluesky, LinkedIn, Open Graph debugger) render `public/og-image.png` cleanly.

### M2 — Phase 5 calm copy and Warmth overdue pass
**Goal:** Bring the in-app past-due experience in line with Principle 01 and unlock anti-shame launch posts.
- **Deliverables:**
  1. Update `src/lib/dates.ts` (`DUE_TONE_CLASSES.overdue` and relative labels), `src/lib/notifications.ts`, and `src/lib/taskFilters.ts` to replace red overdue badges and `"overdue"` framing with Warmth (`#D7B36A` / accessible warm amber ink) and plain carried-over copy.
  2. Verify contrast of Warmth tints and text in both light mode (Paper `#F7F5EF` and white `.panel`) and dark mode (`slate-800` and `slate-700/70` cards) across all 9 accents.
  3. Update Principle 01 in `src/pages/principles.astro` and `docs/media-kit.md` to reflect the shipped copy, and remove the M2 hold note on launch Posts 1, 2, 6, and 8.
- **Done when:** Zero red badges remain on past-due tasks (red is reserved strictly for destructive actions), unit and Playwright tests pass, and contrast is verified >= 4.5:1.

### M3 — Quiet community launch and social asset kit
**Goal:** Ship the first wave of public launch assets and gather real-world feedback on Core and Plus.
- **Depends on:** M1 (live URL) and M2 (for anti-shame posts).
- **Deliverables:**
  1. Build reusable light Paper (`#F7F5EF`) and dark Pine (`#173F3A`) social card exports matching Section 3 of `docs/media-kit.md` (before/after anti-shame card, ensō construction card, typography split card, privacy statement card).
  2. Capture two 15-second Quiet desk clips (no voiceover) demonstrating focus flow and carried-over task recovery.
  3. Publish Posts 1–6 across X/Bluesky, Show HN, LinkedIn, and student/executive-function communities.
  4. Triage incoming Feedback submissions for Plus demand signal and real task/brain-dump test cases.
- **Done when:** Launch posts are live with working social cards and at least 50 real tasks / 10 brain dumps are collected (feeding `docs/roadmap/neuro-tools.md` launch quality bar).

### M4 — Stillpoint share cards and organic loop
**Goal:** Let users optionally export a calm visual recap without exposing private task text or adding outbound network calls.
- **Depends on:** M3.
- **Deliverables:**
  1. Add a client-side Stillpoint recap card generator (Paper and Pine variants, Canvas/SVG -> PNG download) inside `src/components/Recap.astro` showing aggregate focus minutes and completed count only — never task titles or notes.
  2. Verify zero external requests and strict CSP compliance.
- **Done when:** Users can download a crisp 1200x630 or 1080x1350 Stillpoint card offline in both themes with unit + e2e coverage.

### M5 — Zen Frame Plus beta alignment
**Goal:** Keep the brand manifesto, privacy promises, and UI aligned as `docs/roadmap/neuro-tools.md` (P0–P7) ships.
- **Depends on:** `docs/roadmap/neuro-tools.md` P0–P7.
- **Deliverables:**
  1. Add a dedicated `/privacy` page naming the AI provider, zero-retention guarantees, and Core vs Plus data boundaries (linked from `footer.astro` and `principles.astro`).
  2. Update `src/pages/principles.astro` and `docs/media-kit.md` to move Plus features from *Planned* to live as they ship.
  3. Run back-to-school student campaign around Learning your pace and time-blindness buffers.
- **Done when:** `/principles`, `/privacy`, and the in-app consent screen agree word-for-word on data handling and zero retention.

## 4. Immediate next steps

1. **Owner (M1 gate):** Provide the production domain to set `site` in `astro.config.mjs` (and optionally `feedbackEmail` in `src/data/site.json`).
2. **Engineering (M2):** Run the Phase 5 calm-copy & Warmth overdue pass across `src/lib/dates.ts`, `src/lib/notifications.ts`, `src/lib/taskFilters.ts`, and any task/board due-date chips.
3. **Engineering (optional IA decision):** Confirm whether the 8-tab navigation stays as-is or consolidates into `Today / Focus / Library` + `Next step` (Phase 6), and update Posts 2, 3, and 6 in `docs/media-kit.md` accordingly before M3 launch.
4. **Media (M3):** Export the first 4 static social cards from `docs/media-kit.md` once M1 and M2 land.
