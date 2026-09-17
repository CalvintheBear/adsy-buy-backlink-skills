---
name: adsy-backlink-buyer
description: "Automate buying or submitting new Adsy/cp.adsy.com Article Posting / Content placement backlinks through the local Puppeteer runner/profile. Use when Codex needs to buy Adsy backlinks, buy外链, 新增购买外链, submit Adsy tasks, choose verified sites by price range, fill promoted URL and anchor text, handle Adsy login via Keychain, patch Adsy Puppeteer selector drift, or click Buy Post / Apply task / Buy / Checkout Now for authorized tasks."
---

# Adsy Backlink Buyer

Buy or submit new Adsy backlinks through the dedicated Puppeteer automation. Treat "buy N backlinks" as N new tasks in the current run; historical matching tasks never count as completion.

## Default Inputs

Parse the user request into:

- `count`: number of new backlinks to buy/submit. Default `1`.
- `price_range`: per-site final Article Posting / Content placement price. Default `$100-$200` unless an automation overrides it.
- `promoted_url`: required target URL.
- `anchor_text`: required exact anchor text.
- `project_name`: default to anchor text; if missing, derive from promoted domain.
- `platform`: Adsy.
- `service_type`: Article Posting / Content placement.

Ask only when `promoted_url` or `anchor_text` is missing. A prompt containing `购买`, `Buy`, `现在 Buy`, `submit`, or equivalent is authorization to click the final Adsy UI purchase controls for matching tasks within the parsed/default limits.

## Required Execution Path

Use Puppeteer, not browser-control MCPs or desktop automation.

- Bundled source: `<skill_dir>/scripts/adsy-puppeteer`
- Puppeteer workdir: `<puppeteer_workdir>` such as `$CODEX_HOME/adsy-puppeteer`
- Chrome profile: `<chrome_profile_dir>` such as `$CODEX_HOME/chrome-profiles/adsy-puppeteer`
- Chrome executable: `<chrome_executable>` such as the local Google Chrome binary
- package: `puppeteer-core`
- launch options: `headless: false`, `defaultViewport: null`, `userDataDir` set to the profile above.

Do not use Computer Use, Browser Use, Chrome DevTools MCP, Playwright, AppleScript, coordinate clicks, raw CDP scripts, default Chrome profile reuse, exported cookies, injected cookies, or direct purchase API/fetch calls.

Prefer an existing project runner. If the automation or user specifies a runner command, make sure the corresponding bundled source exists, sync changed source files to the Puppeteer workdir when needed, then run it from the Puppeteer workdir. Example:

```bash
npm run project:buy
```

Project runner commands should map to a project-specific `.mjs` runner in `package.json`; purchase should be the default mode. Use `--dry-run` only when the user explicitly asks to stop before the final purchase click.

If no suitable runner exists for the requested project, create or patch a project runner in the bundled source directory first, then copy it into the Puppeteer workdir and run it using the same profile, login, filtering, candidate extraction, task filling, review, and final-click rules below.

## Bundled Scripts

The skill carries the reusable Puppeteer runtime source under `scripts/adsy-puppeteer/`:

- `package.json` and `package-lock.json`: npm metadata for `puppeteer-core` and available runner commands.
- `project-runner.mjs`: configurable project purchase runner.
- `launch-adsy-login.mjs`: manual login/profile bootstrap helper; do not use it for automation runs unless the user explicitly asks for manual login setup.
- `screenshot-adsy-security.mjs`: diagnostic helper for suspected security/login pages.

Treat the bundled scripts as the canonical source. The Puppeteer workdir is the executable runtime copy because it has local npm dependencies and accumulates screenshots/DOM diagnostics. When changing selectors, login detection, candidate extraction, task form logic, article generation, or purchase review:

1. Patch the bundled script in `<skill_dir>/scripts/adsy-puppeteer/`.
2. Copy the changed script and package files to `<puppeteer_workdir>/`.
3. Run `node --check <script>.mjs` on changed scripts.
4. Run the requested npm script from `<puppeteer_workdir>`.
5. If runtime diagnostics produce screenshots or DOM dumps, leave those in the Puppeteer workdir; do not copy generated artifacts back into the skill.

Do not put credentials, cookies, screenshots, DOM dumps, or purchase logs in the skill directory.

## Login Rules

Navigate to the verified sites page:

```text
https://cp.adsy.com/marketer/platform?SiteSearch%5Bverified%5D=1
```

If Adsy shows a login page, allow exactly one automatic email/password login through real Puppeteer page interactions. Read credentials only from macOS Keychain, never from files or the user:

```bash
security find-generic-password -a adsy-login -s adsy-puppeteer-email -w
security find-generic-password -a adsy-login -s adsy-puppeteer-password -w
```

Do not print, log, screenshot, store, or include credential values in memory/final responses. Fill `LoginForm[email]` and `LoginForm[password]`, check Remember me if visible, and click the page's `Log In` submit button.

Stop immediately if any of these occur:

- Keychain item missing, empty, unreadable, or requiring unavailable interactive authorization.
- Login fails, credentials are rejected, or Adsy returns to the login page after one attempt.
- CAPTCHA, reCAPTCHA, hCaptcha, 2FA input, OTP, security challenge, credential update, or forced OAuth appears.
- Puppeteer or the dedicated Chrome profile cannot launch.

Security detection must use URL, form fields, and visible context together. Do not stop merely because an authenticated marketer page contains a banner suggesting "Two-Factor Authentication (2FA)", "Google Authenticator", or account security. If URL/title/DOM show a normal `https://cp.adsy.com/marketer/...` business page such as Search for sites, treat those as advisory banners and continue.

## Filters And Candidate Collection

Apply filters through Adsy UI or query parameters, then verify the current DOM/form values:

- `SiteSearch[verified]=1`
- `SiteSearch[sitePriceMin]=<min>`
- `SiteSearch[sitePriceMax]=<max>`
- `SiteSearch[completionRate]=7`
- `SiteSearch[lifetime_invites_rate]=7`
- `SiteSearch[replace_invites_rate]=7`
- Add `SiteSearch[siteWorkedWith]=2` or the "Exclude sites I've worked with" filter when the user or automation requires excluding worked-with sites.

Select exactly `count` new sites dynamically from current Adsy results. Do not hard-code domains or reuse historical purchases as completion.

Candidate requirements:

- Verified site.
- Final Content placement / Article Posting price inside range.
- Dofollow support visible; reject nofollow-only.
- Article Posting with Content placement, not Writing & Placement unless explicitly requested.
- No Special Topic or extra paid service selected.
- Acceptable completion/lifetime/replacement signals when visible.
- No obvious spam/low-quality listing.
- No publisher requirements that conflict with the target page/topic.
- No duplicate domains inside the current run.

If a candidate opens an "Available performers for your task" page, choose the performer dynamically by the same requirements. Do not assume the first or cheapest performer is valid.

## Empty Candidate Diagnostics

If the runner logs `Candidate pool collected` with `count: 0`, do not immediately report "no sites".

Using the same Puppeteer profile and current filter state, diagnose the Search for sites page:

1. Save a screenshot named like `<project>-candidates-<timestamp>.png` in the Puppeteer workdir.
2. Read DOM-visible URL, title, heading, balance/Reserved, filter values, result/card/table count, price text, site domains, labels, and `Buy Post` / `Content placement` button text.
3. Extract at least the first 5 visible candidates with domain, price, tags, and button text when available.

If the screenshot or DOM shows candidate rows/cards or Buy Post buttons, treat the failure as runner selector drift. Patch the runner's candidate extractor/selectors and rerun. Only report no suitable sites when screenshot/DOM proves no results, or visible candidates are each rejected by price, dofollow, worked-with exclusion, quality, or publisher-conflict rules.

## Runner Failure Triage

If a runner reports CAPTCHA/2FA/security verification, but Puppeteer review shows an authenticated marketer page with visible Adsy business content and site results, patch the runner's security-page detection and rerun. Do not misclassify ordinary 2FA recommendation banners as blockers.

If Adsy page structure changes, use Puppeteer to read latest DOM/visible text/form values and patch the project runner. Allowed `page.evaluate` uses:

- DOM inspection and selector discovery.
- Candidate/performer extraction.
- Form value and validation-state reads.
- TinyMCE/contenteditable filling only when normal form interaction cannot reach the editor.

Forbidden `page.evaluate` / script uses:

- Submitting purchase endpoints.
- Calling Adsy purchase APIs directly.
- Bypassing the UI with fetch/XHR.
- Clicking financial controls without the review below.

After patching a runner, rerun the same purchase command unless a hard stop condition is present.

## Task Form Rules

For each selected site:

1. Open the selected site/product/performer through real Puppeteer UI navigation or click.
2. Assign the task to an existing matching project; create the project only when needed and safe.
3. Read publisher requirements, minimum word count, allowed link count, prohibited categories, and special instructions.
4. Generate unique, neutral article content meeting or exceeding the required word count.
5. Include exactly one contextual link to `promoted_url` with exact `anchor_text`.
6. Fill explicit promoted URL and anchor fields with exact values.
7. Fill Special requirements with:

```text
Please publish the supplied article as provided. Keep the anchor text "<anchor_text>" linked to <promoted_url>. Use a dofollow link if possible and avoid changing the anchor unless editorial policy requires it.
```

8. Verify editor content, word count, URL field, anchor field, project, and no paid extras. If Adsy says content is blank, refill once after DOM verification.

## Pre-Purchase Review

Immediately before any click that can reserve or spend funds, read the latest DOM/form/editor state and confirm:

- Domain matches selected candidate.
- Final price is inside range.
- Project matches request.
- Promoted URL exactly matches request.
- Anchor text exactly matches request.
- Article word count meets requirement.
- Exactly one link exists, with exact URL and anchor.
- Dofollow support remains visible.
- Special Topic and other extra paid services are off.
- Checkout/cart contains only current-run task(s), if checkout is used.
- Balance is visible and sufficient, or no insufficiency/top-up prompt is shown.

When all checks pass and the user has authorized buying, click the real Adsy UI button using Puppeteer: `Buy Post`, `Apply task`, `Buy`, or `Checkout Now`. Do not ask for a second final-click confirmation.

Stop instead of buying if Adsy shows:

- Insufficient balance, add funds, bank/card/top-up prompt, or bonus purchase flow.
- Extra cost or paid service.
- Policy warning or manual review warning that changes the purchase risk.
- Unavailable site/performer.
- Price outside range.
- Wrong URL, wrong anchor, wrong project, or more tasks than requested.
- Nofollow-only or unclear dofollow support.
- Publisher requirements conflict.
- CAPTCHA, 2FA, security challenge, credential update, or login regression.

Never click `Add funds`, bank transfer/card payment, bonus controls, `Empty Cart`, delete controls, unrelated Buy buttons, or extra-service checkboxes unless the user explicitly requests them.

## Completion And Cleanup

After clicking the final UI control, verify completion by one of:

- Task page/status shows the new task ID, selected domain, requested URL, anchor, price, and status such as `Task Review`, `Task's Acceptance`, or `In Progress`.
- Checkout becomes empty while balance decreases and Reserved increases by the submitted task total.
- Runner completion output reports `purchased: true` for the selected domain/price.

If post-click completion is unclear, save screenshot/DOM diagnostics and stop; do not retry in a way that could create a duplicate purchase.

Close only the browser instance launched by the Puppeteer runner. Do not close unrelated user Chrome windows/tabs. If a Node runner does not exit after reporting completion, check for the dedicated profile process and interrupt only the finished runner session when safe.

## Final Report

Reply in Chinese. Include:

- Newly purchased/submitted count for this run.
- Domain, task ID if visible, and final price for each task.
- Total cost and visible balance/reserved status when known.
- Skipped candidates or blockers, if any.
- Diagnostic screenshot/DOM path when reporting no suitable sites or selector/security drift.

Keep the report concise. Do not count historical matching tasks as current-run purchases.
