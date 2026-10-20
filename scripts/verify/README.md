# Site verification suite

Repeatable checks for the built site (sayedasif.com). It serves the repository locally the way Vercel would, drives it
with Chromium (Playwright) and prints one PASS / FAIL / SKIPPED line per check with the evidence. Nothing here is
deployed: `scripts/` is in `.vercelignore`.

```
cd scripts/verify
npm install                      # once
node run.js                      # everything except the slow or outward-facing extras
node run.js --only 13,18         # selected checks
node run.js --skip-network       # no GitHub / Formspree / CDN calls
node run.js --probe-formspree    # also sends ONE honeypot-flagged POST to Formspree (not delivered) to prove the form id exists
node run.js --lighthouse         # also Lighthouse on every page (about four minutes)
node run.js --release            # pre-deploy gate: also fails while any TODO marker ships in a page
node run.js --out <dir>          # write the report somewhere else
VERIFY_ROOT=<dir> node run.js    # test another copy of the site (mutate.js does this)
node mutate.js                   # mutation self-test: breaks a temp copy on purpose and demands the right checks FAIL (about five minutes)
node serve.js [port]             # serve the site locally (same Vercel model as the checks) to look at pages by hand
node selftest-token.js           # proves the preview bypass token is never printed or written (synthetic canary, about two minutes)
node run.js --only 20 --preview https://<deployment>.vercel.app   # real-host check; see "The Vercel bypass token" below
```

## The Vercel bypass token

If a preview has Deployment Protection, check 20 needs the protection-bypass token. It is read only from the environment variable
`VERCEL_PROTECTION_BYPASS` (`read -rs VERCEL_PROTECTION_BYPASS && export VERCEL_PROTECTION_BYPASS` in bash), never from an argument:
`--bypass <token>` is refused with exit code 2, because command lines end up in shell history and process lists. The token is sent as
`x-vercel-protection-bypass` to the preview's own origin only (not to another host a redirect leads to, and not to third parties
the page loads), and `lib/redact.js` removes it from stdout, stderr, `report.md`, `results.json` and every detail file; after each
run the output folder is scanned again and any file that still contains it is deleted and reported by name. `selftest-token.js`
proves this with a fake token against a fake protected preview, including a run of a deliberately leaky copy of `run.js` that the
scan must catch.

Exit code 1 if any check fails. Output goes to `out/` (git-ignored): `report.md`, `results.json`, `details/check-NN.txt`,
`pdf/*.png` (every resume page rasterised), `lighthouse.json`.

Windows / Git Bash: an argument that starts with `/` (for example `/privacy/`) is rewritten to a Windows path by the
shell before node sees it. Use `MSYS_NO_PATHCONV=1` or leave out the leading slash.

## The checks

| # | What it proves | How |
|---|---|---|
| 1 | Generated markup is in sync with its generators; every JS/JSON file parses; the W3C Nu validator reports no HTML errors | `sync-site-chrome.js --check`, `covers/build.js --check`, `node --check`, JSON.parse, vnu |
| 2 | Pages exist; deleted pages 301 to the right place; every redirect rule declares `statusCode: 301`; none of the files under `scripts/` and `drafts/` (each one probed, incl. `scripts/resume-source/*` and `drafts/blog/*`) is ever served, also when `.vercelignore` is ignored | local server that follows `vercel.json` (see below); controls show the probe does see the files when the guard rules are missing |
| 3 | No leftovers: Capabilities, Payment Testing links, `waitForSelector` claims, "mutating" (site, evidence, drafts), "More ▾", static wa.me links, "Print as PDF", 💡 | text search over the deployed files; also an inventory of every "Payment Testing" (file:line, comment / meta / JSON-LD / visible) and of shipped TODO markers (must equal `pendingTodos` in `expected.json`; `--release` fails on any) |
| 4 | Homepage has the six sections, one stat bar, no duplicate counters | rendered DOM |
| 5 | The availability message and the notice-period answer are identical everywhere; other availability wording is flagged | text comparison |
| 6 | Exactly one confidentiality disclaimer (footer) | rendered text |
| 7 | Project order is Razorpay, RESTful Booker, ERPNext, Automation Exercise on the homepage and on Proof of Work | rendered DOM |
| 8 | Every project card and case-study header uses a different image | hashes of each cover's inline SVG and of the social images |
| 9 | Test counts on the site equal the counts in the public repositories; the coverage matrix totals 37 (34 + 3) | counted again from the spec files at the commits the site cites |
| 10 | Code excerpts are byte-identical to the repository files they link to; every GitHub link answers 200 | re-derived from the cited commits |
| 11 | The phone number is not in any page, inline JSON-LD, static href/data attribute or shipped JS (any format) | search with entities / %-escapes decoded and separators allowed |
| 12 | Click-to-reveal phone works on Resume and Contact | browser |
| 13 | Floating WhatsApp button: on every page, no number in markup, click builds `https://wa.me/<number>?text=<message>`, 44px, no overlap at 1280 and 390, focus ring, keyboard, reduced motion, no-JS fallback | browser, bounding boxes at every scroll position |
| 14 | Contact and Services status messages are not in the initial DOM and appear after a submit (endpoint mocked); the real endpoint is printed | browser, Formspree route mocked |
| 15 | Both resume PDFs are valid, have the expected page count, contain the email but not the phone number, contain every sentence of their HTML source (a PDF not rebuilt after a source edit fails), nothing outside the page; every page is rasterised for a visual look | pdf.js in Chromium |
| 16 | Internal links, assets and anchors resolve; sitemap matches the pages; canonicals and meta descriptions present and unique; JSON-LD valid | local server |
| 17 | axe-core: zero violations on every page at 1280 and 390px in light and dark emulation (incl. Label in Name 2.5.3); proves dark emulation changes no computed colour (the site has no dark styling); text that axe marks "needs review" is judged by screenshot sampling; cover palettes in both schemes, generated and in situ | axe, colour fingerprint, screenshot pixel sampling |
| 18 | No horizontal scroll at 390 (and 1280, also with the mobile menu open); no console errors/warnings, failed requests or exceptions; CLS under 0.1; the WhatsApp button causes no layout shift and takes no space | browser |
| 19 | Images: alt, width/height, aspect, not upscaled or oversized, weight, lazy-loading; inline SVG covers (role, title/desc, viewBox, no external refs, size); no orphaned image files; Lighthouse per page with `--lighthouse` | browser, file metadata, Lighthouse |
| 20 | Real host: every page 200, every redirect chain ends at the right page with 301 hops, `/scripts/` and `/drafts/` are not served, PDFs byte-identical, headers present, no phone number, WhatsApp button, form endpoint | only with `--preview`; otherwise SKIPPED (probes every file under `scripts/` and `drafts/` plus encoded, upper-case and doubled-slash spellings) |

## So that a check cannot pass by accident

A check that cannot fail proves nothing, so the risky ones prove they can fail:

- 17: the screenshot sampler is run on controls with known low contrast (plain text, gradient-clipped text, a form-field
  placeholder) and must flag exactly those.
- 18: the probes must catch a 600px element in a 390px viewport, text cut off at the edge, a `console.error` and a
  300px layout shift on synthetic pages.
- 2: the local server returns **308** for `permanent: true` (what Vercel does) and only an explicit `statusCode: 301`
  gives a 301, so a rule written the wrong way fails here instead of passing against a server that flatters it.
- 20: pointing it at a server whose redirects are `permanent: true` makes the redirect sub-check fail (`308>200`).
  On the real host a path without a trailing slash (`/payments`, `/scripts`) first gets Vercel's own 308 to the slash
  form and only then the rule from `vercel.json`, so redirects, anchors and the private-folder guard are judged where
  the chain ends, not on the first hop. Run against production on 2026-10-20 it failed only the headers sub-check,
  because production still serves the older `vercel.json`.
- `mutate.js` injects a phone number, a duplicate cover, a wrong redirect, a 308 redirect, a removed guard rule, a missing aria-label, a stray TODO, a removed /README.md guard and a resume source edited without rebuilding its PDF into a temp copy and requires checks 11, 8, 2, 2, 2, 13+17, 3, 2 and 15 to FAIL; the unchanged copy must PASS before and after.
- Scrolling is forced to `behavior: 'instant'` and each scroll-through asserts it reached the bottom: pages set
  `scroll-behavior: smooth`, which silently turned plain `scrollTo` loops into no-ops.

## What a local run cannot show

- Vercel's own rule order (does `/capabilities` go through a trailing-slash redirect first?), whether a Git deployment
  honours `.vercelignore`, headers and compression on the edge: check 20 with a preview URL.
- Where the local server and the real host differ (observed on production, 2026-10-20): the bare folders `/scripts/` and
  `/drafts/` redirect to `/` locally but answer 404 on Vercel (the `:path*` rule needs at least one segment), while any file
  beneath them answers 307 to `/` on both; `/scripts` first gets Vercel's 308 to `/scripts/`. Neither serves content, which is
  what the checks assert, but a local result is not evidence of the host's exact status codes.
- A real form submission arriving in the inbox, and the WhatsApp button opening the app on a phone.
- Lighthouse numbers are lab numbers (simulated mobile, local server, no CDN); read them as indicative.
- The site has no dark theme; the dark runs show that pages stay readable when the visitor's system asks for dark.
