---
status: DRAFT (unpublished: this folder is excluded from the deploy by .vercelignore)
working-title: "Why express.json() Silently Breaks Razorpay Webhook HMAC Verification (And How to Test It in Playwright)"
target-slug: /blog/express-json-breaks-webhook-hmac/
source-repo: Open83/Razorpay-Payment-Gateway---QA---Automation @ da9e7a2
audience: backend and QA engineers wiring payment webhooks in Express
---

# Draft outline: Why express.json() silently breaks webhook HMAC verification

Everything below comes from the repository (`docs/DEFECTS.md`, `src/`, `tests/`) or from my own re-run on 15 Oct 2026. Gaps are marked **[TODO]**.

## 1. The symptom (opening)
- Every correctly signed webhook was rejected with HTTP 401 `Webhook signature validation failed`. Verified two ways, `fetch()` and `curl --data-binary` with a byte-identical file, to rule out the client changing the body (DEFECTS.md, DEF-002).
- It failed closed, not open: no forged webhook could get in, so it looked like "working security". It was a dead feature.
- Why nobody noticed: the tests that expected a 401 (invalid, missing, tampered signature) kept passing because they never reached the accept path.

## 2. What the signature check needs
- HMAC-SHA256 of the **exact raw request body** with the webhook secret, compared to the signature header. The repo's check:

```js
function validateWebhookSignature(rawBody, signature) {
  if (!config.razorpay.webhookSecret) {
    console.warn('⚠️  Webhook secret not configured. Validation skipped.');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');

  return expectedSignature === signature;
}
```
<sub>Source: `src/routes/webhooks.js` lines 34-46 @ da9e7a2</sub>

- **[TODO]** quote or paraphrase the official Razorpay webhook-signature wording and link it (the existing article already links razorpay.com/docs/webhooks/payments/; confirm the exact sentence about the raw body before publishing).

## 3. The bug: middleware order
- The webhook route used its own `express.raw({ type: 'application/json' })`. A global `express.json()` was mounted before the router, so it ran first.
- The fixed mount order, with the repo's own comment:

```js
app.use('/api/webhooks', webhooksRouter);

// Middleware
app.use(express.json());
```
<sub>Source: `src/app.js` lines 16-19 @ da9e7a2</sub>

- **[TODO]** the repository history starts after the fix (4 commits, all dated 2026-09-14), so there is no pre-fix commit to link. Say that plainly and describe the old order from DEFECTS.md rather than showing code that is not in the repo.

## 4. What actually went wrong (be precise)
- Not "the JSON was re-serialized and the bytes changed". The repo's own diagnosis: `express.json()` consumed and parsed the stream, so `express.raw()` received an **already-parsed object** (`typeof req.body: object (NOT a Buffer)`, reproduced in a standalone Express app with the same middleware order).
- The handler then did `req.body.toString('utf-8')`, which on a plain object returns `"[object Object]"`, so the HMAC was computed over that string.
- The handler, which hashes the raw body first and only then parses it:

```js
router.post('/razorpay', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const eventId = req.headers['x-razorpay-event-id'];

    if (!signature) {
      console.error('❌ Webhook rejected: Missing X-Razorpay-Signature header');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'X-Razorpay-Signature header is required',
      });
    }

    if (!eventId) {
      console.warn('⚠️  Webhook received without X-Razorpay-Event-Id header');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'X-Razorpay-Event-Id header is required',
      });
    }

    // Check for duplicate webhook event before validation
    if (isWebhookEventProcessed(eventId)) {
      console.log(`ℹ️  Webhook event already processed (idempotent): ${eventId}`);
      return res.status(200).json({
        success: true,
        eventId,
        message: 'Webhook already processed',
      });
    }

    // Validate signature using raw body
    const rawBody = req.body.toString('utf-8');
    const isValid = validateWebhookSignature(rawBody, signature);
```
<sub>Source: `src/routes/webhooks.js` lines 55-88 @ da9e7a2</sub>

- **[TODO]** decide whether to add a short aside on the other, more common failure (parse then re-serialize changes whitespace or key order). It is not what happened here and the repo has no test for it, so keep it out unless I can demonstrate it.

## 5. Testing it in Playwright
- Sign the exact string you send, and send it as a string, not an object, so Playwright does not re-serialize it:

```js
function generateWebhookSignature(payload, secret = APP_WEBHOOK_SECRET) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}
```
<sub>Source: `tests/security/webhook-validation.spec.js` lines 11-16 @ da9e7a2</sub>

- The accept-path test that would have caught it (valid signature over the raw body is accepted **and** the order moves `created` to `paid`):

```js
test('WEB-FIX-001: valid signature computed over the exact raw body is accepted and updates order state', async ({ request }) => {
  const orderId = 'order_webfix_' + Date.now();
  const paymentId = 'pay_webfix_' + Date.now();
  seedOrder(orderId);

  const eventId = 'evt_webfix_valid_' + Date.now();
  const payload = shapedPayload(orderId, paymentId);
  const signature = generateWebhookSignature(payload);

  const response = await request.post('/api/webhooks/razorpay', {
    data: payload,
    headers: {
      'X-Razorpay-Signature': signature,
      'X-Razorpay-Event-Id': eventId,
      'Content-Type': 'application/json',
    },
  });

  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.success).toBe(true);

  // Freshly-seeded order started 'created' - confirm the webhook actually
  // drove the created -> paid transition, with the paymentId recorded.
  const order = await (await request.get(`/api/payments/orders/${orderId}`)).json();
  expect(order.status).toBe('paid');
  expect(order.paymentId).toBe(paymentId);
});
```
<sub>Source: `tests/security/webhook-validation.spec.js` lines 259-286 @ da9e7a2</sub>

- The tamper test, which also asserts the order is untouched:

```js
test('WEB-FIX-002: a modified payload with the original signature is rejected', async ({ request }) => {
  const orderId = 'order_webfix_' + Date.now();
  const paymentId = 'pay_webfix_' + Date.now();
  seedOrder(orderId);

  const eventId = 'evt_webfix_tampered_' + Date.now();
  const payload = shapedPayload(orderId, paymentId);
  const signature = generateWebhookSignature(payload); // signed over the ORIGINAL amount
  const modifiedPayload = shapedPayload(orderId, paymentId, { amount: 1 }); // same shape, different amount

  const response = await request.post('/api/webhooks/razorpay', {
    data: modifiedPayload,
    headers: {
      'X-Razorpay-Signature': signature,
      'X-Razorpay-Event-Id': eventId,
      'Content-Type': 'application/json',
    },
  });

  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error).toBe('Unauthorized');

  // The rejected webhook must not have touched the order.
  const order = await (await request.get(`/api/payments/orders/${orderId}`)).json();
  expect(order.status).toBe('created');
});
```
<sub>Source: `tests/security/webhook-validation.spec.js` lines 288-314 @ da9e7a2</sub>

- Seeding a fresh order per test (`createOrder` from `src/orderStore.js`) keeps the tests independent of any historical payment.

## 6. Proof the tests bite (my re-run, 15 Oct 2026)
- Same spec, 11 tests, CI placeholder configuration. Fix in place: 11 passed. Fix reverted in a scratch copy (webhook router mounted after `express.json()`, nothing else changed): **6 failed** (WEB-001, WEB-005, WEB-006, WEB-007, WEB-FIX-001, WEB-FIX-004) and **5 passed** (WEB-002, WEB-003, WEB-004, WEB-FIX-002, WEB-FIX-003).
- The five that still pass are the rejection-only tests. That is the lesson: **a security test that only asserts rejection cannot tell a working check from a broken one.**
- Screenshot available: the failing WEB-FIX-001 (expected 200, received 401) is on /evidence/ (`image/evidence/razorpay-def002-reproduction-web-fix-001-failing.webp`).
- **[TODO]** WEB-007 fails in the reverted copy, but DEFECTS.md lists it among the rejection-only tests that passed before the fix. Find out why before writing that sentence (my guess: the tampered body is not valid JSON, so `express.json()` answers 400 instead of 401; confirm by reading the failure output).

## 7. Checklist for the reader
- Mount the raw-body route before any global body parser, or scope the parser away from the webhook path.
- Write one test where a correct signature is accepted and state changes. Do not rely on rejection tests.
- Assert the side effect (order status), not only the status code.

## 8. Limits to state honestly
- A real Razorpay-originated webhook was never observed arriving at the app (repository DEFECTS.md and the case study say so). Everything here is simulated deliveries signed by the test.
- Test Mode only; 34 CI-safe tests, 3 live-gateway tests not run in CI.
