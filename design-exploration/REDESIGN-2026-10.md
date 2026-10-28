# sayedasif.com redesign, October 2026: research, direction, system

Not deployed (`/design-exploration/` is in `.vercelignore`) and skipped by the site tooling.

## 1. Problems in the previous design

- Every section used the same pattern: a centred h2 with a 60px cyan underline bar, a centred grey intro and a grid of white rounded cards with a soft shadow. Hero, projects, employer work, evidence and services all looked alike.
- Lead work and minor work had the same weight. Razorpay, the strongest case study, sat in a 2x2 grid beside the practice project.
- Palette: cyan `#00baf2` with slate `#314259`. There were four accessible-blue workarounds (`--brand-accent-text`, `-strong`, `-on-tint`, `-display`), and each page defined its own `:root`, with 486 hard-coded colour literals across the pages.
- Inter was named in the CSS but never loaded. Every visitor saw Segoe UI or Roboto. There was no display type and no mono, although the content is mostly counts, IDs and dates.
- Decoration with no information in it: gradient circles behind the portrait, a rotated white square, a radial-gradient hero, gradient-clipped heading text, and buttons that rose on hover with cyan glows.
- There was no dark theme, although the covers already carried a `light-dark()` palette.

## 2. Research (time-boxed, about 13 real sites)

**Limit:** the pages were fetched as text, not rendered. The notes cover structure, wording and dates. Nothing here describes colour or layout as seen.

| Reference | Decision worth learning from | For a QA portfolio | Do not copy |
|---|---|---|---|
| stripe.dev, "Selective Test Execution at Stripe" | Opens with the problem in numbers. Headings name the mechanism. Numbered figures carry full-sentence captions. Closes with trade-offs and takeaways. | Case studies follow context → system under test → approach → results with dates and run IDs → limits → takeaways. Figure captions carry the evidence. | Its length |
| stripe.dev index | Dated entries (2026.10.19), a one-line summary, topic labels | Blog list and evidence index: date in mono, one line each | Topic filter UI (too few posts) |
| linear.app/changelog | Entries grouped by date, with labelled Fixes and Improvements | Show the CI-run history honestly, including failed runs | Product screenshots as filler |
| brittanychiang.com | Experience entry = date range, role · company, two lines of prose, tags; one real metric per project | Timeline as a dated ledger | The layout itself (widely cloned) |
| leerob.com, paco.me, emilkowal.ski | One screen of essentials, a status line, writing as plain dated links | Availability as a single status line | A homepage with no work on it |
| testdouble.com | Each service opens with the client's problem as a question; one repeated CTA | Problem-first service rows | Logo strip, 9-card grid |
| developsense.com | Testing problems listed before any offer | Services lead with what goes wrong | Heavy chrome, sidebars |
| eviltester.com, adamj.eu | Strong credentials, but the consulting offer is one line with no scope or process | Counter-example: services need scope, process and a next step | |
| A generic QA portfolio on carrd (bdorzok.carrd.co) | Years instead of outcomes, bare skills list, screenshots with no result | The baseline to beat | |

Common mistakes avoided here: skill bars and percentages, undated work, code screenshots with no result, services with no scope or next step, identical thumbnail grids that give toy demos the same weight as real work, and hiding failures.

## 3. Direction: "the test report, set as an editorial page"

- **Type does the work.** Source Serif 4 for display headings, the name, project titles and the CTA. IBM Plex Sans for reading and UI. IBM Plex Mono for anything measurable: counts, IDs, dates, statuses, labels.
- **Hairlines, not boxes.** Content sits on the page, separated by 1px rules. A 1px Ink rule marks the start of a list or register. Boxes are kept for things that really are objects: a form, a document, a code block, the lead project.
- **One loud moment per page.** An Ink panel (`.panel-inverse`) or a Soft Mint band. Never both in the same scroll window. The footer is the Ink close on every page.
- **Teal means action or data.** Used for buttons, the active nav rule, focus, link text (Deep Teal) and key figures. Never for decoration.
- **Section heads are left-aligned report headers:** a mono index label (`01 ——— Public projects`), a serif title and an optional lede beside it (`.section-head-split`). No centred titles, no underline bars.
- **Motion:** colour and underline transitions of 140–220ms, a 3px arrow nudge on hover and a 1px press. No scroll animations and no parallax. `prefers-reduced-motion` is respected.

## 4. Tokens (`/assets/css/site.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-page` | #F8F8F5 Porcelain | #0E1513 | page background |
| `--color-surface` | #FFFFFF | #141D1A | forms, documents, menus |
| `--color-surface-muted` | #EFF4F0 | #1A2521 | secondary bands |
| `--color-surface-soft` | #E5F3EF Soft Mint | #173029 | highlighted band / selected |
| `--color-surface-inverse` | #182522 Ink | #1C2925 | the loud panel |
| `--color-heading` | #182522 | #EEF3F0 | headings, strong |
| `--color-text` | #35433F | #C9D4CF | body |
| `--color-text-muted` | #53635F | #A3B3AD | metadata |
| `--color-brand` | #087F70 | #4FC7B4 | button fill, focus, graphics |
| `--color-brand-hover` | #075E54 | #6FD3C3 | hover / pressed |
| `--color-link` | #075E54 | #6FD3C3 | all text links |
| `--color-on-brand` | #FFFFFF | #0E1513 | text on brand |
| `--color-border` | #DCE4DF | #2A3833 | decorative hairlines |
| `--color-border-strong` | #7E8F89 | #667A73 | input/control edges (3:1) |
| success / warning / error | #237448 / #8A5700 / #B42318 on tints | #66C795 / #E6B04F / #F2958C | always with a glyph and a word |

### Contrast decisions

| Pair | Ratio | Result | Decision |
|---|---|---|---|
| Signature Teal `#087F70` as small text on Soft Mint | 4.30:1 | Fails | All text links use Deep Teal `#075E54`: 6.7:1 on mint, 7.2:1 on Porcelain. Signature Teal stays for fills, rings and graphics. |
| Signature Teal on Muted Surface | 4.41:1 | Fails | Same as above. |
| White on Signature Teal (primary button) | 4.91:1 | Passes | Used as is. |
| Fine Border `#DCE4DF` against white | 1.3:1 | Fails as a control edge | Decorative only. Inputs use `#7E8F89` (3.4:1), as WCAG 1.4.11 requires. |
| Quiet Slate | 5.5:1 or better on every light surface | Passes | Used as is. |
| Semantic colours on their tints | 4.9–5.9:1 | Passes | Used as is. |
| Project covers, light palette | n/a | n/a | Accents use Deep Teal: Signature Teal on the cover plate is 4.41:1. |
| Code panel colours on Ink | 7.0:1 or better | Passes | Used as is. |

- **Exception, WhatsApp button:** it keeps WhatsApp green `#1b9d52`, because recognition matters more than palette purity. The white glyph on it is 3.5:1, which passes the 3:1 non-text minimum.

**Type scale:** `--text-xs` 13px is the smallest size allowed (mono labels). Metadata is 14px, UI 16px and reading 17px. Headings scale fluidly: `--text-xl`, `--text-2xl`, `--text-3xl` and `--text-display` (42–80px).

**Space:** a 4px base (`--space-1` to `--space-10`). Section padding is `--section-y`, fluid from 64 to 112px. Content max-width is 1200px, the gutter is fluid from 16 to 32px, and the reading measure is 66ch.

**Radii:** 4, 8 and 12px only. Shadows: `--shadow-1` and `--shadow-2`, used for floating things only.

**Breakpoints:** 560, 768, 1024 and 1280px.

**Theme mechanism:**
- The tokens are swapped by `:root[data-theme="dark"]`, or by `prefers-color-scheme: dark` when nothing is stored.
- `/assets/js/theme.js` is loaded un-deferred in `<head>` (the CSP forbids inline scripts), so a stored choice applies before the first paint.
- The header toggle (`#themeToggle`, `aria-pressed`) stores the choice. It stays hidden without JavaScript.

## 5. Shared components (site.css)

- **Section heads:** `.kicker` / `.kicker-num`, `.section-head`, `.section-head-split`, `.section-title`, `.section-intro`
- **Buttons:**
  - `.btn-primary`: one per view.
  - `.btn-secondary` (alias `.btn-outline`): Ink outline.
  - `.btn-quiet`
  - `.btn-inverse` and `.btn-inverse-outline`: on Ink.
  - `.btn-sm`
  - `.arrow-link`: a text link with a →.
- **Tags and meta:**
  - `.tag` (aliases `.tech-pill`, `.skill-badge`): quiet mono with a hairline, never coloured.
  - `.meta`: mono metadata line.
  - `.meta-list`: a `dl` of key/value rows.
- **Status:** `.status-pass` / `-fail` / `-warn` (glyph plus word). `.callout` / `-warn` / `-error` / `-neutral`.
- **Panels:** `.panel` (white document) and `.panel-inverse` (Ink; restyles headings, links, tags and focus inside).
- **Data and text:** `.table-wrap` tables with sticky mono headers; `.code-block` (highlight.js classes, dark in both themes) with `figcaption`; `.prose` for long-form; `.breadcrumb`.
- **Forms:** inputs with the 3:1 edge, a focus ring, `aria-invalid` red edge plus a ✕ message, disabled styles, and `.success-message` / `.error-message` with a glyph.
- **Other:** `.faq-item` (ruled disclosure, + rotates to ×); `.cover-wrap` (container for the generated covers).

## 6. Layout patterns: pick by content, never one for everything

1. **Editorial split hero:** serif statement on the left; an object on the right (portrait plate, spec card or meta-list).
2. **Ledger strip:** a white band of mono figures separated by hairlines (homepage stats).
3. **Lead and columns:** one item on Ink, then supporting items in ruled columns with a 2px Ink rule on top (homepage projects).
4. **Sticky statement and register:** the section head sticks on the left, with a numbered ruled list on the right (employer work).
5. **Document index:** full-width link rows (type label, serif title, description, → action) (evidence).
6. **Dated ledger:** a mono date column with content beside it; the current entry is emphasised (timeline).
7. **Closing band:** Soft Mint, a display-size serif title and an action rail (CTA).
8. **Document sheet:** a white `.panel` on Porcelain for formal documents (defect report, resume, form).
9. **Reading column:** a 66ch prose column with a sticky table of contents in the margin on wide screens (articles, privacy notice, long case studies).
10. **Comparison rows:** service rows of name and problem, what is included, deliverables and proof.

## 7. Page direction

Each page header changes with the page's job.

| Page | Direction |
|---|---|
| Home | Done first; sets the quality bar. |
| About | An essay. Split header (portrait or avatar beside a serif headline). Body is a reading column with mono margin labels. Principles as a numbered list. |
| Contact | Two columns: a statement plus a direct-channels list on the left, the form as the one white document on the right. FAQ as ruled disclosures. |
| Resume | A document sheet on Porcelain with a sticky action rail (PDF downloads). Dates in a mono column. Skills grouped in a `dl`, not a badge wall. |
| Services | Problem-first comparison rows per service, proof pairings, a numbered horizontal process, and the enquiry form as a document sheet. |
| Blog | Featured article set large, the rest as a dated index. |
| Articles | Reading column with a sticky table of contents, dark code panels and a ruled related list. |
| Proof of Work | Project rows alternating cover and text. CI status as `.status` chips. "What this demonstrates" as a compact `dl`. |
| Evidence | The defect report as a formal document sheet; the matrix as a real table with status chips; runs as captioned figures. |
| API testing | An evidence map: one ruled row per risk, with mono IDs and counts. |
| Case studies | One shared template: breadcrumb, kicker, serif h1, lede, meta-list (repo, stack, counts, CI) and actions; the cover full width; a ledger strip; chapters as left-aligned report sections; defects as document sheets; limits as warn callouts. |
| Privacy | Reading column with a sticky table of contents. |
| 404 | Mono 404, a serif sentence and a short route list. |

## 7a. Shared layers added during the build

- **`assets/css/case-study.css`:** the one template for all four `/projects/*/` pages: header with a facts object, framed cover (capped at 960px), ledger strip, sticky contents margin from 1180px, chapters, defect sheets, evidence index. Only Automation Exercise keeps extra page CSS. Check 1 scans this file for colour literals too.
- **Fallback fonts with matched metrics (`site.css`).** Local Georgia / Times New Roman / Arial / Roboto / Courier New / Consolas faces are scaled with `size-adjust` to the web fonts' average width (93.5%, 112%, 101%, 110.7%, 100%, 109.1%, measured in Chromium). Without them the serif tagline rewrapped on swap and the homepage CLS was 0.178 at 1280px; with them it is 0.000.
- **`.table-wrap { position: relative }`.** It keeps the absolutely positioned `.sr-only` link text inside the table's scroll box (it caused 283px of page overflow on phones).
- **WhatsApp button:** unchanged behaviour. Making it step aside for form *inputs* (not only buttons and while typing) was tried and reverted: it hid the button for most of the mobile Contact page, which is where it matters most.

## 8. Rules that do not change

- No text changes and no new claims. Labels such as "01 · Scope" are structure, not claims.
- Counts, dates, code excerpts, availability wording, the disclaimer, IDs and anchors stay byte-for-byte. Checks 3, 5, 6, 9, 10, 16 and 21 verify them.
- Page `<style>` contains layout only, written with tokens. Check 1 fails on any colour literal outside the project covers.
- Generated blocks are edited only through their generators:
  - header and footer: `scripts/sync-site-chrome.js`
  - covers: `scripts/covers/`

## 9. Completion audit, 28 Oct 2026 (resumed session)

State found: branch `audit-fixes-2026-10` at 91d589e, 37 modified and 6 untracked paths, nothing staged, nothing pushed, no redesign commit. The redesign existed only in the working tree (`site.css`, `case-study.css`, `theme.js`, fonts, `build-brand.js`, all 17 pages, generators, verify suite). No stash, no other redesign branch. No code was changed in this resumed session; it was verification only.

| # | Workstream | Status | Evidence this session |
|---|---|---|---|
| 1 | Repository and design audit | Complete | section 1 of this file |
| 2 | Research and direction | Complete, with a stated limit | pages were read as text, not rendered (section 2) |
| 3 | Colour tokens | Complete | check 1 passes: no colour literal in any page style; only SVG covers and `theme-color` metas carry hex; 0 legacy cyan/slate hits outside `mutate.js` |
| 4 | Type and spacing | Complete | fonts load with no 404; CLS 0.000 was measured earlier and NOT re-measured now |
| 5 | Shared layout and nav | Complete | mobile menu opens, closes on Escape; focus ring present on 16 of 16 tab stops on /, /contact/, /services/ |
| 6-7 | Home hero and sections | Complete | all sections viewed at 1440px light; hero and projects viewed in dark; 390px hero, menu and dark viewed |
| 8-9 | Projects, evidence, API map | Complete | viewed: Razorpay (light, dark), Proof of Work, Evidence (dark), API map (1440 and 320), RESTful Booker (320); checks 9, 10, 21 pass |
| 10-11 | Skills, experience, About | Complete | About top and Resume top viewed; home experience ledger viewed |
| 12 | Services | Complete | hero and Proof of Work rows viewed; 320px viewed; check 14 passes |
| 13 | Resume and downloads | Complete for the page; PDFs not restyled | check 15 passes (PDFs valid, content matches HTML); PDFs come from `scripts/resume-source/` and keep their ATS/print look |
| 14 | Blog | Complete | list viewed; article template only via automated checks |
| 15 | Contact and forms | Complete | empty submit: 4 inline errors, focus on first field; valid submit with Formspree mocked: success message, form reset, no stale invalid state (8 of 8 runs) |
| 16 | Light/dark | Complete | toggle works, persists across reload, `aria-pressed` set; body background correct on 170 of 170 renders |
| 17 | Responsive | Complete | 170 renders (17 routes x 5 widths 320/390/768/1024/1440 x 2 themes): 0 horizontal overflow, 1 h1 each |
| 18 | Accessibility | Checks pass, conformance NOT claimed | suite: 68 axe runs clean; extra: 102 axe runs clean at 320/768/1024 both themes. axe finds only part of WCAG |
| 19 | SEO and function | Complete | checks 2, 11, 12, 13, 16 pass (redirects, canonicals, sitemap, phone reveal, WhatsApp) |
| 20 | Build and tests | Passed locally | `node run.js --skip-network`: PASS 20, FAIL 0, SKIPPED 1 (check 20 needs a Vercel preview URL) |

Not inspected by eye (automated checks only): /privacy/, /404.html, ERPNext and Automation Exercise case studies, the article body, tablet widths.
Not run: Lighthouse, Firefox/WebKit, real devices, real Formspree delivery, anything on the live host.
One screenshot taken after a mocked contact submit showed red field edges and a dim button. It did not reproduce in 9 replays (computed styles and `aria-invalid` were clean), so it is recorded as unexplained, not fixed.
Observation, not a defect: on the dark Razorpay case-study header the facts list sits at the bottom of its row, leaving empty space at the top right.

### 9a. Second verification pass, 28 Oct 2026 (handoff)

Git at start and end: branch `audit-fixes-2026-10`, HEAD `91d589e`, nothing staged, no stash, nothing committed or pushed. One file changed during this pass: `scripts/verify/lib/server.js` (see Fixes).

**Content preservation.** Visible text of all 17 pages compared against HEAD word by word: 0 words lost except the hero role line, which the old page printed twice and the new one prints once, and 4 `|` separators on Proof of Work. Routes unchanged (check 2, 16).

**Now inspected by eye, both themes where noted:** /privacy/ (1440 light, 1024 dark, 390), the 404 page (1440 dark), ERPNext case study (1440 light, 390 dark), Automation Exercise (1440 light, 768 light), both blog articles (1440 light and dark, 768), Razorpay header (1440 light, 1024 dark). All render as designed; no overflow, no clipped text.

**Razorpay header gap: left as is.** `.cs-header-grid { align-items: end }` is deliberate: the facts list sits against the lede and buttons. ERPNext uses the same rule and looks balanced. Moving it to the top would only shift the gap. Not a defect.

**Form anomaly (red edges, dim button): classified as a test-browser artefact, no CSS change.** 24 pixel-level replays found 0 red field edges (computed `aria-invalid` and pixels). The dim button reproduced in about half of one 24-run loop but not in the next 16 runs. In an anomalous run the pixel equalled the computed colour, 5 transitions were running, and the button was normal by +600 ms and stayed normal at +1 s and +2 s. The Playwright browser here ran `requestAnimationFrame` at 10 fps, so a 140 ms transition spans one or two frames. Disabling transitions or enabling reduced motion removed it (0 of 16 each). The dim state is the real `:disabled` look while the request is in flight, and a real browser at 60 fps will show it for the length of the request only.

**Lighthouse (lab, simulated mobile, same machine, HEAD vs working tree, run back to back with compression working):**

| | HEAD (before) | Working tree (now) |
|---|---|---|
| Mean performance | 88.8 | 79.1 |
| Mean LCP | 1.22 s | 2.29 s |
| Accessibility | 100 on all 17 | 100 on all 17 |
| Best practices | 100 | 100 |
| SEO | 100 (404 and privacy 63 and 66: `is-crawlable`) | same; both pages carry `noindex` at HEAD too |
| CLS | 0 | 0 (0.001 on the 404 page) |
| TBT | 150-690 ms | 240-1,480 ms |

This is a real regression from the redesign, not noise (every page's LCP rose by 0.9 to 1.1 s). Cause, measured: the LCP element is a text paragraph on every page, and the two preloaded web fonts (Source Serif 4 50 KB, IBM Plex Sans 45 KB) plus two or three render-blocking stylesheets delay it. A scratch copy with `font-display: optional` and no font preloads cut LCP by about 0.8 to 1.0 s (3.3 to 2.5 s home, 3.6 to 2.7 s Razorpay, 2.3 to 1.5 s About, measured before the compression fix), but that changes first-visit typography, so it was not applied. The TBT rise was not diagnosed. Options for the owner: accept it; make the body font `optional` and keep the serif on `swap`; merge or inline critical CSS; or subset the variable fonts. None was applied.

**Fixes made this pass.**
- `scripts/verify/lib/server.js` line 102: the gzip test was `/\bgzip\b/` with the two `\b` stored as backspace characters, so the preview server never compressed anything and Lighthouse saw uncompressed CSS. Restored to `/\bgzip\b/` (1 line). Suite re-run after the fix: unchanged results.

**Final verification.**
- `node run.js` (with GitHub reads, no Formspree probe, no Lighthouse): PASS 20, FAIL 0, SKIPPED 1. Check 1 includes the W3C HTML validator, the only lint/type step this static site has.
- `node run.js --only 19 --lighthouse`: as above.
- `node mutate.js`: 21 of 21 OK (control and restored copies green, real working tree untouched).
- Token audit of site.css, global-nav.css, case-study.css and page styles: 81 tokens defined, 0 used but undefined, 0 redefined within one selector, 4 defined and never used (`--shadow-1`, `--text-display`, `--space-10`, `--radius-pill`). Colour literals outside token definitions: the WhatsApp green (documented exception) only.

**Check 20 (real host) stays SKIPPED.** It needs `node run.js --only 20 --preview https://<deployment>.vercel.app`, and a deployment that contains this working tree. That means a commit and a push, which are not authorised, and, if Deployment Protection is on, the owner's `VERCEL_PROTECTION_BYPASS` token in the environment. The existing remote branches hold the pre-redesign code, so testing them would say nothing about this work.

**Still not done:** Firefox, Safari, real devices, a real Formspree delivery (`--probe-formspree` would send one POST and was not run), the live site.

### 9b. Font loading and the performance regression (28 Oct 2026)

**State of the real tree: unchanged from section 9a.** The two font preloads are in place, written by `scripts/sync-site-chrome.js`; `node run.js` gives PASS 20, FAIL 0, SKIPPED 1 (check 18 passes, homepage CLS 0.000 at 1280 and 390 px). Nothing from this section is applied. A first attempt (remove the preloads) was applied, failed check 18 and was reverted through the generator; the 17 pages and `site.css` are byte-identical to the state before that attempt.

**Method.** Scratch copies of the working tree under the session scratchpad; the repo was only read. Three measurements, each interleaved across variants so machine drift hits all equally:
- *Real throttled:* Chromium with CDP network throttling equal to Lighthouse's mobile profile (150 ms RTT, 1.6 Mbps down, 750 Kbps up), 4x CPU slowdown, 412 px viewport, cold cache per run, PerformanceObserver for FCP/LCP/CLS/long tasks, and `CSS.getPlatformFontsForNode` to learn which font was really applied.
- *Desktop unthrottled:* 1280 px, no throttling (the scenario check 18 uses).
- *Lighthouse 12.8.2*, default simulated mobile profile (the profile of the earlier comparison), 5 runs per route.
Routes: /, /services/, a case study, /blog/, /contact/ (plus /about/, /evidence/, /api-testing/ for CLS). Medians of per-route medians; ranges are in the raw output, not repeated here. Absolute numbers differ between sessions (machine load); compare only within a table.

**What causes the regression (measured).**
- The LCP element is a text paragraph on every page. Four web fonts transfer 125.7 KB on the homepage (the two preloaded faces are 96.6 KB, the two mono faces 29.6 KB). With no web fonts at all, median LCP was 1.47 s against 2.25 s with them (old site 1.31 s): fonts account for about 0.8 s, CSS and the rest for about 0.16 s.
- A trace of the main thread shows the long tasks are style and layout of the whole document, not JavaScript. With both fonts preloaded the first layout is a single task of about 2.4 s (at 4x CPU) that lands just before first paint; without the preload it is split into smaller tasks and paints early. Neither a serif-only preload nor `fetchpriority="low"` on both preloads helped (real mobile FCP stayed at about 2.7 to 3.1 s).
- Compressed CSS is about 12 KB for site plus nav; minifying saves about 4.5 KB gzip (20 ms at this throughput) and needs a build step the repo does not have; merging the nav stylesheet gave no repeatable gain. Neither is proposed.

**Why plain "no preload" fails.** Removing the preloads gave real mobile LCP 1.57 s (equal to the old site) but the page then paints before the fonts arrive and reflows when they swap. At 1280 px, unthrottled, homepage CLS was 0.255 (blog 0.084); check 18 failed at 0.235. Layout-shift traces show three separate causes: the theme toggle appearing at DOMContentLoaded (small), the serif swap changing a heading's wrap, and `ch`-based prose widths changing when the sans font loads (`1ch` is the width of a "0", and Arial's is about 7% narrower than Plex Sans's, which average-width matching cannot fix). A sans-only preload (A9) did not avoid it.

**Fallback metrics are mis-tuned (found while investigating).** Measured with the site's own text, the web font was wider than its fallback by: sans 400 0.0% (matched), sans 500 and 600 +2.9%, serif +14% to +16% at every weight, mono 0%. Cause: one regular-weight fallback face per family, so bold headings used faux-bold Georgia/Arial, and Georgia scaled to 93.5% is far narrower than Source Serif 4. Per-weight fallback faces (serif 400-599 Georgia at 107.5%, serif 600-900 Georgia Bold at 93.1%, sans 500 Arial at 103.9%, sans 600-700 Arial Bold at 96.9%) bring every weight within +-0.6%. On phones the worst-case swap then moves above-the-fold content by at most 2 px (was up to 78 px).

**Results.**

| Variant | Real mobile LCP / FCP / TBT | Lighthouse perf / LCP / FCP / TBT | Desktop 1280 CLS (median, worst run) | Web sans applied on first view |
|---|---|---|---|---|
| Old site (HEAD) | 2.09 / 2.09 / 0.00 s | 92 / 1.16 / 0.77 / 0.36 | 0.000 | n/a (system fonts) |
| **Current tree (preloads)** | 3.24 / 3.24 / 0.94 s | 79 / 2.42 / 1.37 / 0.73 | 0.000, 0.002 | 40/40 |
| Candidate G2: no preloads, tuned fallbacks, sans `optional`, serif `swap` | **1.88 / 1.27 / 0.03 s** | **87** / 1.56 / 1.14 / 0.46 | 0.004, 0.019 | **0/40** (second page view: 6/6) |

Earlier variants, real mobile (8 runs, a quieter machine; same-table comparison only): current 2.75 s LCP; no preload 1.57 s; no preload plus subset fonts 1.66 s; plus merged nav CSS 1.53 s; old site 1.57 s. `content-visibility: auto` on below-the-fold sections cut LCP from 3.04 to 2.34 s with the preloads in place but added nothing once they were removed, so it was not pursued. Both-fonts-`optional` (A8) gives CLS about 0.001 but the heading font is then also missing on first views.

**Font subsetting (measured, not applied).** Subsetting and clipping the variable axes to the weights in use (sans 400-600, serif 400-700, Latin plus punctuation) saves 33 KB (126 to 93 KB). On the two pages measured in detail, text differs by at most 0.14 px in width and 0 px in height, and the 12 page renders printed in the pixel comparison had identical page heights (all 48 were compared, but only the first 12 results were printed). Lighthouse LCP improved slightly (1.91 to 1.67 s) but the real throttled runs did not (1.57 to 1.66 s). Licensing is unresolved, so this is not adopted. Correction (added in 9c): the licence copies shipped in `assets/fonts` (both SIL OFL 1.1) name no Reserved Font Name, so this section's earlier statement that both licences carry one was not supported by the repo. To my recollection the upstream releases of both families do state one ("Plex" for IBM Plex, "Source" for Adobe's Source Serif), the shipped files are themselves already Latin-subset WOFF2 of unrecorded origin, and I cannot tell from the repo which upstream or distributor they came from. Instancing or subsetting them is a "Modified Version" under the OFL, so it needs that question answered first.

**Candidate G2 against the owner's conditions.**
- Passes the existing regression checks: in a full scratch copy of the repo with exactly the candidate's change set applied (generator, CSS, regenerated pages), `node run.js` gave PASS 20, FAIL 0, SKIPPED 1, including check 18 and axe on both themes.
- Performance: real mobile LCP 3.24 to 1.88 s (better than the old site), TBT 0.94 to 0.03 s; Lighthouse performance 79 to 87 and LCP 2.42 to 1.56 s, still short of the old site's 92 and 1.16 s.
- CLS: not zero any more (desktop median 0.004, worst single run 0.019 on /blog/; mobile at most 0.003), well inside the 0.1 limit; the preloaded build is 0.000.
- Fonts: both families download; the serif is applied on the first view, but **the sans is applied from the second page view onward, never on the first** (0/40 desktop unthrottled, 0/30 mobile throttled; 6/6 on the second view). A first-time visitor therefore reads body text, navigation and labels in Arial (tuned to the same widths) and sees the Plex Sans typography from the next page. This is the cost of `optional` without a preload; it is not a measurement artefact.

**Decision status: not applied.** The numbers meet the stated thresholds but the sans-on-first-view result is a visual-identity trade-off for the owner. The change set, if approved, is exactly: (1) in `scripts/sync-site-chrome.js` remove the two preload lines from `HEAD_ASSETS`, add them to a `RETIRED_HEAD_ASSETS` list that is stripped on every run, and reference this section in a comment; (2) in `assets/css/site.css` replace the two fallback faces by the five per-weight faces above and set `font-display: optional` on the IBM Plex Sans face; (3) run `node scripts/sync-site-chrome.js`. Not measured: Firefox, Safari, real devices, Android/Linux fallback fonts (the Roboto and Courier fallbacks were not re-tuned), the live host, and a first view on a warm HTTP cache from an earlier visit.

### 9c. Final performance round, 28 Oct 2026: recommendation is to keep the current implementation

Everything below was measured in scratch copies; the real tree was not changed. Same harness and environment notes as 9b (real throttled mobile with cold cache, desktop 1280 unthrottled, Lighthouse default profile). The round was stopped before its last stage (Lighthouse for the finalists) so that release could proceed; no Lighthouse numbers exist for these variants.

**Inspection.**
- *Fonts and licences:* four files in `assets/fonts` (serif 50.9 KB and sans 45.7 KB variable, mono 400 and 500 at 14.7 and 14.9 KB), all WOFF2, with the two SIL OFL 1.1 licence copies. Neither licence copy names a Reserved Font Name. The files are already Latin-subset WOFF2 whose origin the repo does not record. Not modifying them stays the rule until that is settled; a follow-up is to record where they came from.
- *Above the fold:* on every route all three families render in the first viewport (sans 400/500/600, serif 500/600/650, mono 500; mono 400 on most routes). Each family is one file (variable, or one static file per mono weight), so there is no spare weight file to drop; the only elective bytes are the two mono files (29.6 KB).
- *Delivery:* two preloads (serif, sans), `font-display: swap` on all faces, fonts cached 30 days (`vercel.json`), site plus nav CSS about 12 KB gzipped.

**Results** (real throttled mobile, 4 cold runs per route and variant; LCP and TBT are medians of route medians; the baseline in that run was LCP 2.87 s, TBT 0.75 s).

| Variant | LCP | TBT | CLS, worst run measured | Web fonts applied on first view | Verdict |
|---|---|---|---|---|---|
| E1 `content-visibility: auto` on below-the-fold sections | 2.15 s | 0.48 s | 0.005 (mobile); 0.000 while scrolling | all | **Rejected: breaks anchors and scroll height** |
| E3 mono `optional` | 2.54 s | 0.64 s | 0.001 (mobile) | mono 0/20 | Rejected: small gain, mono missing on first view |
| E4 E3 plus E1 | 2.21 s | 0.36 s | 0.005 (mobile) | mono 0/20 | Rejected (E1 and E3 reasons) |
| E5 inline all CSS into every page | 2.59 s (8 runs: 2.43 against 2.59) | 0.49 s | desktop 1280: home 0.254, blog 0.084 | all | Rejected: gain inside noise, intermittent CLS, uncacheable CSS in every page |
| E6 E5 plus E1 | 2.02 s | 0.43 s | 0.005 (mobile) | all | Rejected (E1 and E5 reasons) |
| E7 preload only the sans, tuned fallbacks | 2.24 s (8 runs: 2.06 against 2.59, worst run 4.31 s against 3.84 s) | 0.48 s | desktop 1280: home 0.230 (1 of 5 runs) | all | Rejected: intermittent large CLS |
| `text-wrap: pretty` / `balance` removed | 2.71-2.80 s against 2.51 s | no change | not measured | all | No effect, hypothesis disproved |

CLS was measured at different widths for different variants (mobile throttled for E1, E3, E4 and E6; desktop 1280 for E5 and E7), so the column is not a like-for-like comparison. The deciding failures (E1 anchors, E5 and E7 intermittent shifts) do not depend on it.

- **E1 in detail:** document height changed by a median of 1,076 px (maximum 11,670 px) on desktop and 2,742 px (maximum 20,807 px) on a phone while scrolling; in-page anchors missed: on the Razorpay case study `#defects` lands 3,634 px below the viewport (133 px today), `#ci`, the RESTful Booker `#evidence` and Services `#pilot` also miss. The case-study tables of contents depend on these anchors.
- **Why E5 and E7 fail:** whenever first paint can win the race against a font download the page reflows. The current build avoids that only because the two preloaded fonts reliably arrive first; that is also why its first paint is slow on a throttled phone, and no variant found here removes one without the other.
- **The first layout is inherently heavy on these text-heavy pages:** the old design already had a 1.76 s layout task on the Razorpay page at 4x CPU, and the web fonts add about 40% to it. The DOM is small (about 1,000 elements), and removing `text-wrap` rules did not change it.
- **Not repeated:** the no-preload candidate (9b), font subsetting, nav-CSS merging and minification, all already measured.

**Recommendation.** Keep the current implementation (two preloads, `swap`, the existing fallback faces, all unchanged). It has CLS 0.000, every font applied on the first view and passes all 20 runnable checks; the cost is slower first paint under a throttled phone profile (Lighthouse performance about 79). If more speed is wanted later, the only options that proved worthwhile need an owner decision: the 9b candidate (sans typography from the second page view) or font subsetting once the licence provenance is settled.
