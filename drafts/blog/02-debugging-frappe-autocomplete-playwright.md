---
status: DRAFT (unpublished)
working-title: "Debugging Flaky Autocomplete Dropdowns in Frappe/ERPNext Using Playwright Traces"
target-slug: /blog/debugging-frappe-autocomplete-playwright/
source-repo: Open83/ERPNext-QA-Automation @ 8990014
audience: QA engineers automating Frappe/ERPNext (or any Awesomplete-style autocomplete)
---

# Draft outline: Debugging a flaky Frappe autocomplete with Playwright

**[TODO] Retitle or find the evidence.** The title promises *traces*. The repository's write-up (`docs/root-cause-analysis.md`, `docs/engineering-finding.md`) describes the investigation from the timeout output and DOM inspection, not from a Trace Viewer session. `playwright.config.js` sets `trace: 'on-first-retry'` and `docs/ci-cd.md` says "Trace available", but no trace from the original failure exists (report artifacts expired, hosted instance is offline). Either (a) retitle to "...Using Playwright's Failure Output", or (b) reproduce the failure and capture a real trace first. Do not imply a trace was used.

## 1. The symptom
- Item-selection tests in Material Request, Quotation and Sales Order timed out waiting for autocomplete options to become visible, under CI load.
- Playwright's log showed the option resolving repeatedly as hidden (RCA: "25+ times over 15s").

## 2. What the DOM said
- `<div role="option">` was in the DOM and `aria-selected="true"` was set, but CSS kept it hidden. DOM present, not interactable.

## 3. The earlier pattern (from the RCA doc, not current code)
```js
// Fill input with item code
await itemInput.fill(itemCode);

// Wait for option to be visible
await this.page.locator('[role="option"]').first()
  .waitFor({ state: 'visible', timeout: 5000 });

// Click option (attempt to interact)
await optionElement.click();

// Silent catch masking the failure
.catch(() => {
  // If option wasn't visible, just press Enter
  await itemInput.press('Enter');
});
```
<sub>Source: `docs/root-cause-analysis.md`, "Initial Pattern". This is the documented earlier pattern; it is not in the current code.</sub>

## 4. Root cause (the two parts)
1. `fill()` sets the value without the key events Frappe's Awesomplete listens for, so the dropdown never opens properly.
2. The `.catch(() => press Enter)` turned the timeout into a pass that did not prove the intended item was selected. Tests passed while checking nothing.

## 5. The fix, as it exists in the repo
```js
// Use keyboard input to trigger Frappe's autocomplete event handlers
// Frappe's awesomplete library relies on keyboard events to show the dropdown
await itemCodeInput.type(searchText, { delay: 50 });

// Wait for listbox to be present (autocomplete rendering)
await this.page.locator('[role="listbox"]').first().waitFor({ state: 'attached', timeout: 10000 });
// ...
await itemCodeInput.press('ArrowDown');

// Get the selected item text from the now-focused option
const selectedOption = this.page.locator('[role="option"][aria-selected="true"]').first();
const selectedItemText = await selectedOption.textContent();
console.log(`Selecting item: ${selectedItemText?.trim()}`);

// Confirm selection with Enter
await itemCodeInput.press('Enter');
// ...
await this.page.waitForTimeout(500);
```
<sub>Source: `pages/material-request.page.js` lines 80-85, 89-97, 100 @ 8990014</sub>

- Real key events, a Locator wait for the listbox to be **attached** (not visible), keyboard selection, and no silent fallback.
- **[TODO]** `locator.type()` is deprecated in current Playwright (`pressSequentially()` is the replacement) and the step still ends with a fixed 500 ms `waitForTimeout`. State this as "what I would change next", as the case study page now does. Do not claim the fix is fully web-first.

## 6. Where Playwright traces fit (only if I can show it)
- **[TODO]** Reproduce on a live ERPNext instance, capture a trace of the old pattern, and show the Actions list, the repeated hidden check and the DOM snapshot. The hosted instance used before is offline (307 to Frappe Cloud signup, checked 12 and 14 Oct 2026), so this needs a new instance first.

## 7. What the fix did not cover (state it)
- Customer selection in the Quotation and Sales Order page objects still uses a different pattern (`fill()` then a visibility wait) and was not part of this investigation.
- CI was configured with retries, so a green run does not prove no test retried. Last green run: 4 Sep 2026, commit 8990014 (6 tests including the auth setup). A new run would fail at authentication until an instance exists.
- **[TODO]** the repo docs say "100% deterministic". I cannot support that; do not repeat it.

## 8. Takeaways
- If an element is in the DOM but "not visible", look at how the app decides to show it before adding timeouts.
- Real input events for widgets that depend on them.
- Never let error handling turn a failure into a pass. A passing test only counts if it exercised the intended path.
