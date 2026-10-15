---
status: DRAFT (unpublished)
working-title: "Separating CI-Safe Tests from Live Gateway Tests in Payment Automation"
target-slug: /blog/ci-safe-vs-live-gateway-tests/
source-repo: Open83/Razorpay-Payment-Gateway---QA---Automation @ da9e7a2
audience: QA and backend engineers automating tests against a payment gateway's sandbox
---

# Draft outline: CI-safe vs live-gateway tests

## 1. The problem
- A payment test suite has two kinds of tests: ones whose result depends only on your code, and ones that need the gateway to be reachable, configured and in a particular state. Mixed together, CI is either flaky or holds real credentials.

## 2. How the split was decided (empirically, per `docs/CI-CD.md` section 3)
- The suite was run three ways against a fresh database: no Razorpay env vars, non-real placeholder values, real Test Mode credentials.
- No env vars: **16 failures** (the app answers `503 Razorpay not configured` before any validation runs; the webhook route always returns 401 without a secret).
- Any non-empty placeholder: down to exactly the **3 genuinely account-dependent** tests.
- **[TODO]** I re-ran the 34 CI-safe tests myself on 15 Oct 2026 with the CI placeholders: 34 passed in 21.6 s. I did not re-run the "no env vars" and "real credentials" variants; either re-run or attribute them to the repo doc as I do here.

## 3. The mechanism: one tag, two scripts
```json
"test:ci": "playwright test --project=chromium --grep-invert @razorpay-live",
"test:razorpay": "playwright test --project=chromium --grep @razorpay-live"
```
<sub>Source: `package.json` lines 13-14 @ da9e7a2</sub>

- Tag in the test title, not a separate folder, so nothing is duplicated and no assertion is weakened:

```js
test('SIG-001: POST /api/payments/verify with valid signature accepts a real captured payment @razorpay-live', async ({ request }) => {
```
<sub>Source: `tests/security/signature-verification.spec.js` lines 37 @ da9e7a2</sub>

- The three live tests: `SIG-001` and `REPLAY-001` (need one specific captured Test Mode payment), `UI-002` (needs order creation to genuinely succeed).

## 4. Placeholder credentials, safely
- The workflow sets fixed, obviously fake values in plain YAML, not GitHub Secrets, because they are not sensitive and no call with them can succeed. The point is only to get past the "is it configured" guard so the validation logic runs:

```yaml
env:
  NODE_ENV: test
  RAZORPAY_KEY_ID: rzp_test_ci_placeholder_not_real
  RAZORPAY_KEY_SECRET: ci_placeholder_secret_not_real
  RAZORPAY_WEBHOOK_SECRET: ci_placeholder_webhook_secret_not_real
```
<sub>Source: `.github/workflows/playwright.yml` lines 30-34 @ da9e7a2</sub>

- Real secrets, if ever added, must stay out of this workflow and only feed the manual `test:razorpay` run.

## 5. CI behaviour that supports the split
```js
forbidOnly: !!process.env.CI,
retries: process.env.CI ? 2 : 0,
workers: process.env.CI ? 1 : undefined,
```
<sub>Source: `playwright.config.js` lines 6-8 @ da9e7a2</sub>

- `forbidOnly` stops an accidental `.only`; one worker because tests share one SQLite file (the repo also switched SQLite to WAL mode for cross-process access).
- **[TODO]** CI retries are 2, so a green run does not prove zero retries. State that, as the case study does.

## 6. What the split does NOT give you (important, be honest)
- **ORDER-003 is CI-safe but cannot fail in CI.** Its assertions sit inside `if (response.status() === 200)`. With placeholder credentials order creation never returns 200, so the assertions never run. In a scratch mutation test (amount rule deliberately broken) all 34 CI tests stayed green.
- **[TODO]** that mutation result is from my 14 Oct 2026 scratch work, not committed. Re-run it before publishing, and propose a fix to the owner of the repo (me): make the test fail or skip loudly when the 200 path is not reached.
- Live tests are excluded from CI by design, so nothing automated exercises the real gateway. There is no scheduled gateway run.

## 7. Takeaways
- Decide the split by running the suite, not by guessing.
- Tags over folders. Placeholders over secrets for CI.
- Audit "passes in CI" tests for vacuous passes: a test that cannot fail is not coverage.
