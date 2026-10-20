# sayedasif.com

Portfolio of Sayed Asif, a Software QA Engineer in Mumbai. It has two audiences: recruiters hiring a QA Engineer, and
prospective clients looking for freelance QA testing and automation. Every claim on the site is meant to trace to a public
repository, a CI run, a report or a command anyone can run. It is plain static HTML with no build step, hosted on Vercel.

Production: https://sayedasif.com/ (the `main` branch; a push to `main` deploys).

## What is in the repository

| Path | What it is |
|---|---|
| `index.html` | Home: role, featured proof of work, employer experience, pathways |
| `about/`, `resume/`, `services/`, `contact/`, `privacy/` | Profile, HTML resume with two PDFs, services and sample deliverables, contact form, privacy notice (`noindex`, not in the sitemap) |
| `proof-of-work/`, `evidence/` | The four public test-automation projects, and the Razorpay defect report, coverage matrix and test-run evidence |
| `projects/<name>/` | One case study per public project (Razorpay, RESTful Booker, ERPNext, Automation Exercise) |
| `blog/` | Articles; unpublished drafts are in `drafts/blog/` and are never served |
| `404.html`, `robots.txt`, `sitemap.xml`, `vercel.json` | Not-found page, crawler rules, sitemap, and Vercel redirects, headers and trailing-slash behaviour |
| `resume/*.pdf` | Two public resume PDFs, built from `scripts/resume-source/` |
| `image/`, `assets/` | Images, fonts, `assets/icons.svg` sprite, and the shared CSS and JavaScript below |
| `scripts/` | Tooling. Not deployed (see Deployment) |

Each page keeps its own page-specific CSS inline. What is shared:

- `assets/css/global-nav.css` and `assets/js/global-nav.js`: header, footer and mobile menu.
- `assets/js/form-submit.js`: validation and Formspree submission for the Contact and Services forms.
- `assets/js/contact-actions.js`: the floating WhatsApp button and the click-to-reveal phone number. The number is
  deliberately not written in any page; it is assembled in the browser on click.
- `assets/js/resume-reveal.js`: scroll animation on the resume page.

There is no inline JavaScript: `vercel.json` sets `script-src 'self'`.

## Generated parts (edit the source, not the output)

| Part | Source | Regenerate / check |
|---|---|---|
| Header and footer markup repeated in every page | `scripts/sync-site-chrome.js` | `node scripts/sync-site-chrome.js` (`--check` only reports) |
| Project cover SVGs between `<!-- cover:... -->` markers; social images `image/og/` | `scripts/covers/` | `node scripts/covers/build.js` (`--check`; `--og` also renders the PNGs) |
| Code excerpts copied from the public repositories | `scripts/excerpts/refresh.js` | `node scripts/excerpts/refresh.js` (`--check`; needs network) |
| Resume PDFs | `scripts/resume-source/resume-print.html`, `resume-ats.html` | `node scripts/build-resume-pdfs.js`, then open every page of both PDFs |

The covers and excerpt scripts need `npm ci` in `scripts/verify` first. After editing a resume source, rebuild the PDFs:
check 15 fails when a PDF does not contain every sentence of its source.

## Verifying the site

The suite in `scripts/verify` serves the repository locally, drives Chromium with Playwright, and prints PASS, FAIL or
SKIPPED with evidence for each of 20 checks (build and HTML validation, redirects, privacy of the phone number, WhatsApp
button, forms, resume PDFs, links, axe accessibility, runtime errors and layout shift, images, and a real-host check).

```
cd scripts/verify
npm ci                               # once; Node 22 is what CI uses
npx playwright install chromium      # once
node run.js                          # everything
node run.js --skip-network           # without GitHub, Formspree and CDN calls
node run.js --only 15                # selected checks
node run.js --lighthouse             # also Lighthouse on every page (slow)
node mutate.js                       # breaks a temp copy on purpose; every injected defect must make a check FAIL
node selftest-token.js               # proves the preview bypass token is never printed or written
```

The full list of checks, what each proves, and the limits of a local run are in `scripts/verify/README.md`.
`.github/workflows/verify.yml` runs `node run.js --skip-network --release` on every pull request and on pushes to `main`;
`gitleaks.yml` scans the history for secrets.

To look at the site by hand, `node serve.js [port]` in `scripts/verify` serves it on `http://127.0.0.1:8080` using the
same model of Vercel that the checks use. It is a simulation: Vercel's own rule order, edge headers and compression are
only proven by check 20 against a real deployment.

## Checking a real Vercel preview (check 20)

Check 20 is SKIPPED unless it is given a deployment URL. A preview exists after a branch is pushed and Vercel builds it.

```
cd scripts/verify
node run.js --only 20 --preview https://<deployment>.vercel.app
```

If the preview has Deployment Protection, give the bypass token through the environment, never as an argument and never in a
file. It is sent only to the preview's own origin, and it is redacted from everything the suite prints or writes.

```
# bash
read -rs VERCEL_PROTECTION_BYPASS && export VERCEL_PROTECTION_BYPASS
node run.js --only 20 --preview https://<deployment>.vercel.app
unset VERCEL_PROTECTION_BYPASS

# PowerShell
$s = Read-Host -AsSecureString "bypass token"
$env:VERCEL_PROTECTION_BYPASS = [System.Net.NetworkCredential]::new('', $s).Password
node run.js --only 20 --preview https://<deployment>.vercel.app
Remove-Item Env:VERCEL_PROTECTION_BYPASS
```

A passing local run does not show that production behaves the same way. Three things only a person can check: that a real
form submission arrives in the inbox, that the WhatsApp button opens the app on a phone, and the site's status in Search
Console.

## Deployment and what must stay private

Vercel deploys from Git. `vercel.json` carries the redirects, security headers and `trailingSlash: true`. It also redirects
`/scripts/`, `/drafts/`, `/.github/` and `/README.md` to the home page as a safety net, and `.vercelignore` lists what a CLI
upload must leave out. Nothing below should ever be committed or deployed:

- Local audit and working notes (`AUDIT.md`, `PROGRESS.md`, `PENDING-FACTS.md`). They are listed in `.gitignore` and `.vercelignore`.
- `scripts/verify/out/` and `out-mutation/` (reports, screenshots). Check 11 prints the phone number as evidence, so do not share them.
- `.env` files, `storageState.json`, and the local clones of the four test repositories, which sit in this folder but are separate
  repositories (all git-ignored).
- Any Vercel bypass token.

The four test-automation projects live in their own public repositories and are linked from the site; their changes are
committed there, never in this repository.
