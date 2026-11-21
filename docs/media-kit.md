# Zen Frame media kit

- **Source identity:** `Zen-Frame-Visual-Identity-Board.png` (Minimal Editorial, Identity Study 01)
- **Product alignment:** `brand-refresh-plan-2026-11-20.md` and `docs/roadmap/neuro-tools.md`
- **Last updated:** 2026-11-20

## 1. Brand foundation and voice

### Core identity
- **Brand essence:** One at a time. You got this. Calm in the noise. Kind about progress.
- **Audience:** Students and people who want gentler support with executive function, plus privacy-minded users tired of noisy, account-gated productivity tools.
- **Core promise:** A calmer way from intention to action. Focus, without the pressure.
- **Mark symbolism:** An open ensō circle (*room to begin*) with a separate dot in the opening (*one next step, not everything at once*).

### Visual tokens
| Token | Hex | Role in media assets |
|---|---|---|
| Pine | `#173F3A` | Headings, wordmark, dark statement card backgrounds |
| Paper | `#F7F5EF` | Default editorial card background, light surfaces |
| Mist | `#DCE7DC` | Soft Teal tint for subtle callouts |
| Teal | `#036672` | Primary action cues, default avatar tile, single CTA |
| Warmth | `#D7B36A` | Past-due tone, small highlight dots (never body text on Paper) |

### Typography split
- **Newsreader (Regular 400):** Editorial headlines, reflective lines, pull quotes, Stillpoint recap titles. Signals *pause and orient*.
- **Inter (400 / 500 / 600):** Uppercase `.eyebrow` labels (`tracking-[0.14em]`), body text, UI labels, buttons, metadata. Signals *act and click*.
- **Accessibility fonts (in-app):** Lexend and Atkinson Hyperlegible Next remain first-class options.

### Voice rules (apply everywhere, including social and launch posts)
- Calm, clear, encouraging.
- Sentence case for headings, labels, and buttons.
- No exclamation marks.
- No "catching up" language, streak pressure, or red guilt framing.
- No hype-heavy startup phrasing; let concrete product choices speak for themselves.

## 2. Bios and profile copy

### One-liner (GitHub, X, Bluesky, link previews)
A calmer way from intention to action. Focus, without the pressure.

### Short bio (social profiles)
A quiet, local-first workspace for students and anyone who wants a gentler place to start. One next step, one clear action, no account required.

### Extended intro (portfolio, LinkedIn, Show HN)
Zen Frame is a calm, browser-only focus and planning app built around executive-function support. No accounts, no tracking, no red overdue guilt — just a warm paper surface, clear next steps, and a timer that meets you where you are.

### Profile visual kit
- **Avatar:** Refined ensō mark centered on a solid **Teal (`#036672`)** or **Pine (`#173F3A`)** tile, matching `public/favicon.svg` and the PWA icons.
- **Banner / Cover:** **Paper (`#F7F5EF`)** canvas with a single **Newsreader 400** line in Pine (*"A little space. A next step."*) and generous whitespace.
- **Social card / OG image (`public/og-image.png`, 1200x630):** Panel 01 layout — **Pine (`#173F3A`)** background, refined ensō, **Zen Frame** wordmark, *"A little space. A next step."*, and bottom-left *"FOCUS, WITHOUT THE PRESSURE."*

## 3. Channel plan and content pillars

### Channel architecture
| Channel | Strategic role | Core formats | Cadence |
|---|---|---|---|
| X / Bluesky | Design craft, build-in-public, indie-web and accessibility community | Before/after UI cards, WCAG/token breakdowns, Newsreader editorial cards | 2–3x / week |
| TikTok / Reels / Shorts | Reaching students and ADHD/executive-function audiences organically | 10–20s "Quiet desk" loops (natural light, picking one task, clicking *Begin focus*, timer ring ticking) with zero voiceover | 2x / week |
| Reddit and niche communities | High-intent early adopters (ADHD, study, indie-web, Astro/Tailwind) | Honest builder notes on anti-shame copy and local-first privacy; no hard sell | Milestone-based |
| LinkedIn and portfolio | Engineering credibility, design systems, accessibility craft | Short case studies on Phase 1–6 decisions (hex neutral scales, state machines, CSP, WCAG across 9 accents) | 1x / 2 weeks |
| Product Hunt / Show HN | Concentrated launch moments and feedback collection | Clean demo GIF of Today / Focus / Library + Next step screen, transparent privacy overview | Launch and Plus milestones |

### Four repeatable content pillars
1. **Anti-shame redesigns:** Side-by-side comparisons contrasting red overdue alarms with Zen Frame's Warmth tint and calm copy (*"2 carried over. Pick one to start."*).
2. **Real light, small beginnings:** Short, quiet visual loops of a real desk and the Next step screen (*"Read 3 pages · About 10 minutes"* -> *Begin focus*).
3. **Craft in the open:** Concrete technical and visual notes from the codebase (measured contrast across 9 accents, self-hosted fonts, zero-tracker CSP, local-first storage).
4. **Stillpoint and ordinary progress:** Weekly reflections showing how small 10-minute focus blocks add up without streak anxiety.

### Reusable social card templates
- **Light editorial card (default):** Paper (`#F7F5EF`) background, Inter 500 uppercase eyebrow (`#606D66`), Newsreader 400 headline in Pine (`#173F3A`), subtle Warmth (`#D7B36A`) dot or rule, Teal (`#036672`) action cue, thin ensō wordmark in a corner.
- **Dark statement card (launches and milestones):** Pine (`#173F3A`) background, Paper (`#F7F5EF`) Newsreader headline, refined ensō mark, muted sage metadata.

## 4. First 10 launch posts

### Post 1 — X / Bluesky (Anti-shame redesign)
- **Visual:** Split editorial card on Paper (`#F7F5EF`). Left: harsh red badge `"2 OVERDUE!"`. Right: soft Warmth (`#D7B36A`) dot + Pine text `"2 carried over. Pick one to start."`
- **Copy:**
Most task apps greet you with red warnings the moment a day runs short.

In Zen Frame, red is reserved strictly for deleting things. Unfinished tasks carry over in a warm sand tone with one prompt: pick one to start.

Starting small counts.

### Post 2 — Show HN (Local-first launch)
- **Title:** `Show HN: Zen Frame – A calm, local-first focus and planning app with no accounts or tracking`
- **Copy:**
I built Zen Frame as a quieter workspace for students and anyone who wants gentler support with executive function.

Everything runs statically in the browser with Astro, Alpine.js, and Tailwind. Your tasks, schedule, goals, focus sessions, and Stillpoint recaps stay in `localStorage` with JSON backup export. There are no accounts, no analytics, no external CDNs, and no outbound requests.

A few design choices I cared a lot about:
- No red overdue guilt or streak counters. Carried-over tasks use a warm neutral tone and calm copy ("2 carried over. Pick one to start.").
- Measured WCAG 2.2 AA contrast across light mode, dark mode, and all 9 accent colors, plus self-hosted Newsreader, Inter, Lexend, and Atkinson Hyperlegible fonts.
- Explicit task states shown in both words and icons (Ready, In focus, Done), never color alone.
- Three top-level areas (Today, Focus, Library) and a Next step view that isolates one task with a focus timer.

Link to the Calm Design Principles page: [production-url]/principles
Link to the app: [production-url]

I would appreciate honest feedback on the flow, keyboard navigation, and whether optional zero-retention AI helpers (task breakdown, brain dump sorting, time estimates) would be useful as a future paid add-on.

### Post 3 — TikTok / Reels / Shorts (Quiet desk loop #1)
- **Visual (15s, no voiceover, subtle ambient room tone):** Natural window light on a quiet desk. Screen shows Zen Frame's Next step view: *"Read 3 pages · About 10 minutes · Biology"*. Cursor clicks **Begin focus →**. Timer ring starts counting down calmly.
- **On-screen text (Newsreader 400):** `Just this, for now.` (0–4s) -> `One task. Ten minutes.` (5–10s) -> `Starting small counts.` (11–15s)
- **Caption:** When the whole list feels too loud, narrow the frame to one step. Zen Frame runs in your browser with no account required.

### Post 4 — LinkedIn (Design-system and accessibility craft)
- **Visual:** 3-slide carousel: (1) Pine/Paper/Mist/Teal/Warmth palette, (2) Dark-mode luminance table showing why Pine (`#173F3A`) stayed for brand surfaces rather than dark cards, (3) 12 muted cluster chip colors passing WCAG 2.2 AA in light and dark modes.
- **Copy:**
Redesigning a personal project gets much more interesting once you measure every color pair against WCAG 2.2 AA.

While refreshing Zen Frame's visual identity, two assumptions broke immediately under contrast testing:
1. Our brand Pine (`#173F3A`) looked great as a dark card background, until three of our nine user-selectable accents dropped below 4.5:1 on top of it. Keeping the dark slate luminance steps intact preserved contrast across every theme while reserving Pine for raised surfaces and brand moments.
2. All 12 original cluster chip colors failed as chip text (between 1.78:1 and 3.70:1). Replacing them with a muted palette brought every chip past 4.6:1 in both light and dark modes without migrating a single stored user key.

Calm design is not just soft colors. It is predictable contrast, self-hosted fonts, and zero layout surprises across every preference a user picks.

### Post 5 — X / Bluesky (The ensō mark story)
- **Visual:** Panel 02 construction graphic showing the refined ensō: open arc at top right with a single detached dot in the opening.
- **Copy:**
Our mark is a small summary of the whole product.

An open circle: room to begin.
One distinct dot at the opening: one next step, not everything at once.

No badge, no clutter — just a quiet frame around the work in front of you.

### Post 6 — Reddit (ADHD / executive-function / student communities)
- **Title:** `I built a free, no-account focus and task app that removes red overdue badges and streak guilt`
- **Copy:**
Every time I fell behind on a task manager, opening the app felt worse than doing the work. Red overdue counts and broken streaks made me close the tab instead of starting.

I built Zen Frame to feel like a quiet sheet of paper instead. A few things that helped me stick with it:
- Nothing requires an account or subscription. You open it and start, and everything stays in your browser's local storage (with JSON export whenever you want a backup).
- Carried-over tasks never turn red. They show up in a soft warm tone with simple copy ("2 carried over. Pick one to start.").
- Next step mode hides the rest of the list and puts one task, a rough time estimate, and a focus timer on screen.
- Includes Lexend and Atkinson Hyperlegible font options, reduced-motion support, and full keyboard navigation.

It is live at [production-url] if you want to try it. I am also exploring optional helpers down the road for breaking big tasks into small steps, sorting brain dumps, and estimating time ranges — if you have thoughts on what actually helps on low-energy days, there is a feedback link in the app or you can reply here.

### Post 7 — X / Bluesky (Typography as an emotional boundary)
- **Visual:** Panel 06 typography card showing Newsreader 400 (*"Make room for what matters."*) paired with Inter 400/500/600.
- **Copy:**
In Zen Frame, type does two separate jobs.

Newsreader (serif) is only for reflective moments — page titles, quotes, empty states, and Stillpoint recaps.
Inter (sans) handles every control, label, and number.

And if you prefer Lexend or Atkinson Hyperlegible for easier reading, one toggle overrides everything cleanly with no external font requests.

### Post 8 — TikTok / Reels / Shorts (Quiet desk loop #2)
- **Visual (15s, no voiceover):** Today view showing `"2 carried over. Pick one to start."` in warm ink with a subtle Warmth dot. User clicks one task, moves to Focus, marks it **Done**, and sees `"Starting small counts."`
- **On-screen text (Newsreader 400):** `Unfinished work is not a failure.` (0–5s) -> `Pick one small thing.` (6–10s) -> `Focus, without the pressure.` (11–15s)
- **Caption:** A gentler way to return to a list after a busy week. Local-first, private, and free in your browser.

### Post 9 — X / Bluesky / LinkedIn (Privacy architecture)
- **Visual:** Clean dark Pine (`#173F3A`) card with Paper text: `"Zero accounts. Zero trackers. Zero outbound requests."`
- **Copy:**
A to-do list should not need an onboarding funnel or third-party analytics.

Zen Frame ships as a static site with a strict Content Security Policy, self-hosted fonts, zero third-party requests, and local browser storage with cross-tab sync.

Your tasks stay on your device. If we ever add optional AI helpers later, they will be strictly opt-in, preview-before-apply, and zero-retention.

### Post 10 — Product Hunt / X / Newsletter (Stillpoint and the road ahead)
- **Visual:** Clean screenshot of the Stillpoint recap view + a quiet dark Pine end card.
- **Copy:**
Most apps measure progress by whether you kept a streak alive. Zen Frame uses **Stillpoint** — a quiet recap of what you actually moved forward, without punishing days off.

Next on our roadmap is **Zen Frame Plus**: optional, zero-retention helpers for Breakdown, Brain dump, and realistic time estimates. Every helper will show an editable preview first and never change your list without your click.

Core Zen Frame stays free, private, and local-first. Always.

## 5. Calm Design Principles manifesto page copy

Intended route: `src/pages/principles.astro` (static HTML/CSS, Paper `#F7F5EF` canvas, `.panel` cards, Newsreader 400 headings, Inter 400/500 interface text).

### Hero
- **Eyebrow:** `CALM DESIGN PRINCIPLES`
- **Title:** `A quieter way to begin.`
- **Lead:**
Most productivity tools treat your attention like a ledger that is always behind. Red overdue counts, broken streaks, and cluttered dashboards turn a small task into a wall before you even start.

Zen Frame is built for students and anyone who wants gentler support with executive function. It gives you a warm paper surface, one clear next step, and a workspace that stays out of your way.
- **Subline:** `One next step. One clear action. No catching up.`

### The five principles

#### 01 — No guilt for unfinished work
Plans change, energy dips, and days run short. Carrying a task into tomorrow is normal, not a failure. Zen Frame removes red overdue warnings and streak counters in favor of warm, neutral reminders that help you pick back up without dread.

*In the app:* Past-due tasks use a soft Warmth tint (`#D7B36A`) and plain language (*"2 carried over. Pick one to start."*). Red is reserved strictly for destructive actions like deleting an item.

#### 02 — One next step, not everything at once
Looking at forty tasks at once makes starting harder, not easier. Our mark — an open circle with a single dot at the opening — is the whole layout philosophy: leave room to begin, and focus on one concrete step.

*In the app:* Views are grouped into three quiet areas — **Today**, **Focus**, and **Library** — and Next step mode pairs a single task and its rough time estimate with one calm *Begin focus →* action.

#### 03 — Your work stays on your device
You should not have to create an account, hand over an email address, or accept background tracking just to write down a to-do list. Your tasks, schedules, notes, and focus sessions live in your browser's local storage, nowhere else.

*In the app:* Zero accounts, zero analytics, zero third-party CDNs, and full JSON backup export whenever you want it.

#### 04 — Readable and accessible by default
Calm design only works if everyone can read and navigate it comfortably. Every color pairing is measured for contrast, every state is shown in words as well as color, and motion stays subtle.

*In the app:* WCAG 2.2 AA contrast across light mode, dark mode, and all 9 accent colors; explicit task states (*Ready · In focus · Done*); self-hosted Newsreader, Inter, Lexend, and Atkinson Hyperlegible fonts; and automatic support for reduced motion.

#### 05 — Assistance that asks first, never takes over
Sometimes the hardest part of a task is breaking it into pieces, sorting a messy brain dump, or guessing how long it will actually take. As we build optional AI helpers for **Zen Frame Plus**, they will follow the same calm rules as the rest of the app: literal wording, realistic time ranges, and human control.

*In the app (coming in Plus):* Every helper — **Breakdown**, **Brain dump**, and **Estimate** — shows an editable preview first and never changes your list without your click. Nothing you send is logged, stored, or used to train models.

### Our promise: Zen Frame vs. Zen Frame Plus
Core Zen Frame will always stay free, private, and local-first. Zen Frame Plus is an optional paid layer solely for hosted AI helpers that cost money to run.

| Area | Zen Frame (Core) | Zen Frame Plus (Planned) |
|---|---|---|
| Price and account | Free forever, no account required | Optional paid tier with a free trial allowance; account used only for billing |
| Where tasks live | Locally in your browser (`localStorage`) | Still locally in your browser — Plus never locks or syncs your data |
| Network and privacy | Zero outbound requests or tracking | Opt-in only; sends only the text you submit to a helper, with zero retention |
| Core features | Tasks, Board, Schedule, Timer, Next step, Goals, Stillpoint recaps, manual estimates | Adds AI **Breakdown**, **Brain dump**, **Estimate** ranges, and **Learning your pace** |
| Control | Everything stays manual and predictable | Preview-only suggestions you can edit, accept, or discard before anything changes |

### Closing and CTA
- **Pull line (Newsreader 400):** `Starting small counts.`
- **Supporting line:** Open Zen Frame in your browser — no sign-up, no setup wizard, just a clear space for your next step.
- **Primary button:** `Open Zen Frame →`
- **Secondary link:** `Tell us what would help most` (links to the in-app Feedback panel)
- **Footer tagline:** `A CALMER WAY FROM INTENTION TO ACTION.`

## 6. Future media and brand milestones

- **Nov–Dec 2026 — Brand refresh completion and live deploy:** Merge Phases 3–6, set production `site` URL, generate `public/og-image.png`, and publish on portfolio, GitHub, and LinkedIn.
- **Jan–Feb 2027 — Quiet community launch:** Share Posts 1–6 across X/Bluesky, Show HN, and student/executive-function communities; gather Plus demand signal and real task/brain-dump test cases via Feedback.
- **Mar–May 2027 — Stillpoint share cards and organic loop:** Add optional, client-rendered Paper/Pine Stillpoint recap cards (zero task text exposed) alongside a 2x/week Quiet desk clip cadence.
- **Jun–Aug 2027 — Zen Frame Plus beta:** Launch opt-in Breakdown, Brain dump, and Estimate helpers with a free trial allowance and zero-retention privacy page.
- **Sep–Dec 2027 — Back-to-school campaign and Learning your pace:** Time a student push around fall semester featuring time-blindness buffers, personal actual-to-estimate insights, and seasonal CSS Quiet desk scenes.
