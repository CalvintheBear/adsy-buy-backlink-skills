---
name: adsy-backlink-buyer
description: "Buy or submit new Adsy/cp.adsy.com Article Posting or Content placement backlinks through Ego Lite browser task spaces. Use for authorized Adsy backlink purchases, buy外链, 新增购买外链, candidate selection, task form completion, and final purchase verification. Requires ego-browser; do not use Puppeteer or local Adsy scripts."
---

# Adsy Backlink Buyer

Buy or submit new Adsy backlinks through the real Adsy UI using Ego Lite. Treat “buy N backlinks” as N new tasks in the current run; historical tasks never count as completion.

## Inputs And Authorization

Parse the request into:

- `count`: number of new tasks. Default `1`.
- `price_range`: final per-site Article Posting / Content placement price. Default `$50-$150` unless the request or automation provides another range.
- `promoted_url`: required exact target URL.
- `anchor_text`: required exact anchor text, or a list of allowed anchors.
- `project_name`: default to the anchor text or promoted domain.
- `topic`: optional article theme and claims boundary.
- `task_space_name`: a stable name such as `adsy <project> backlink`.

If multiple allowed anchors are provided, randomly choose one at the start, record it, and use that same value for the article, form fields, special requirements, pre-purchase review, and final report. Do not re-randomize during the run.

Ask only when `promoted_url` or `anchor_text` is missing. A request containing `购买`, `Buy`, `submit`, or equivalent is authorization to click the final Adsy UI purchase control for matching tasks within the requested quantity and budget. If the user asks for a dry run, stop before any control that can reserve or spend funds.

## Required Automation Mechanism

Use the available `ego-browser` / Ego Lite skill and its CLI helpers exclusively for all Adsy browser interaction.

- Run browser operations with `ego-browser nodejs` heredocs.
- Create or reuse one Ego Lite task space for the project and reuse its numeric task-space ID across rounds.
- Use `openOrReuseTab`, `snapshotText`, `pageInfo`, screenshots, semantic refs or stable locators, `click`, `fillInput`, keyboard, scroll, and wait helpers.
- After every meaningful navigation, filter change, click, form edit, scroll, modal, or page-state change, inspect fresh state with `snapshotText`, `pageInfo`, or a screenshot before deciding the next action.
- Prefer semantic refs or stable locators for normal controls. Rebuild refs after a fresh snapshot.
- Do not use coordinate clicks for ordinary Adsy controls when a semantic ref or stable locator is available.
- Do not create, modify, or run Adsy automation script files.

Do not use Puppeteer, Playwright, Selenium, Chrome DevTools MCP, Browser Use, Computer Use, AppleScript, coordinate-based desktop automation, `js` or `cdp` to fill or submit a purchase, direct form submission, purchase APIs, `browserFetch`, `serverFetch`, or fetch/XHR purchase requests. Do not read macOS Keychain, export or inject cookies, or reuse the user’s ordinary browser window.

If Ego Lite is unavailable or cannot create a usable task space, stop and report the blocker. Do not fall back to another browser mechanism.

## Task Space And Login

1. Create or reuse `task_space_name` with `useOrCreateTaskSpace`.
2. Open `https://cp.adsy.com/marketer/platform?SiteSearch%5Bverified%5D=1`.
3. Reuse the task space’s inherited login state. Never type stored credentials automatically.
4. Treat ordinary 2FA or Google Authenticator recommendation banners on an authenticated `cp.adsy.com/marketer/...` business page as advisory content, not a challenge.

If a login page, CAPTCHA, 2FA input, OTP, security challenge, credential update, or another user-only step appears:

- call `handOffTaskSpace(taskSpaceId)`;
- tell the user exactly what must be completed;
- stop the current automated run and keep the task space open;
- never take control back until the user explicitly says to continue.

If the user takes control unexpectedly or the task space becomes inactive or user-owned, stop and ask before resuming. Do not retry around the ownership state.

## Filters And Candidate Selection

Set and verify through the real page UI:

- verified sites only;
- the requested minimum and maximum final price;
- exclusion of sites already worked with;
- appropriate completion, lifetime, and replacement signals when available;
- Article Posting / Content placement service.

Select exactly `count` new sites dynamically from current results. Each candidate must:

- be verified;
- have a final price inside the requested range;
- visibly support dofollow;
- offer Article Posting / Content placement, not Writing & Placement unless explicitly requested;
- have no Special Topic or other paid extras selected;
- not be obvious spam or low quality;
- not conflict with the target page, topic, or publisher requirements;
- not duplicate another domain in the current run.

If a site opens an “Available performers for your task” page, choose the performer using the same requirements. Do not assume the first or cheapest performer qualifies.

## Empty Candidate Diagnostics

If no candidates are recognized, do not immediately report that no sites exist.

1. Capture a full-page semantic snapshot and a screenshot in the same task space.
2. Inspect the URL, title, balance and Reserved values, visible filter values, result/card/table count, price text, domains, labels, and Buy Post / Content placement controls.
3. Inspect at least the first five visible candidates with domain, price, tags, and service type when available.
4. Scroll and take additional snapshots or screenshots when the semantic tree is incomplete.

Only report no suitable sites when the page evidence shows no results or every visible candidate fails a stated requirement. Do not switch to a local script or selector patch as a fallback.

## Task Form

For each selected candidate:

1. Open the candidate through the real UI.
2. Read publisher requirements, minimum word count, allowed link count, prohibited subjects, and special instructions.
3. Select the existing matching project. Create it only if it does not exist and the UI allows safe creation.
4. Generate unique, neutral article content that meets the minimum word count and the requested topic boundary. Do not invent unverifiable product claims.
5. Include exactly one contextual link to `promoted_url` with the selected exact `anchor_text`.
6. Fill the Promoted URL, Anchor, article, and Special requirements through page controls.
7. Use this meaning in Special requirements: publish the supplied article as provided, preserve the exact anchor and target URL, use dofollow if possible, and do not change the anchor unless editorial policy requires it.
8. Read back the latest page state and verify every value. If the editor reports blank content, refill once only after verifying the current state.

Some Content placement forms may not expose separate Promoted URL and Anchor fields. In that case, verify the read-back Anchor text / Url row derived from the article link, and repeat the exact URL, anchor, and dofollow request in Special requirements.

## Pre-Purchase Review

Immediately before any click that can reserve or spend funds, inspect the newest page state and confirm:

- the domain matches the selected candidate;
- the final price is inside the requested range;
- the project is correct;
- the promoted URL exactly matches the request;
- the anchor exactly matches the selected value;
- the article meets the publisher’s word-count requirement;
- the article contains exactly one link with the exact URL and anchor;
- dofollow support remains visible;
- Special Topic and every other paid extra are off;
- the cart contains only the current-run task or tasks;
- the visible balance is sufficient.

A closable “Limited time offer”, “Bank Wire Transfer”, or “Add funds now” promotional banner is not by itself proof of insufficient balance. Close the banner and re-check the current page. Stop only when the account is actually short of funds, the flow enters an Add funds/payment page, or the UI requires a top-up.

## Final Purchase Control

When every pre-purchase check passes and the request authorizes buying:

1. Prefer the primary submit control in the upper-right or sticky header, commonly `#header_invite_submit`, with text similar to `Buy Post $83.25`.
2. Re-inspect the latest page and confirm that the control belongs to the current `#invite-create-form`; it must not be a recommended-site, cart, Content purchase, Add funds, or unrelated Buy control.
3. Use the unique submit control inside the current form only if the header control is absent or unusable and the same review still passes.
4. Click the final submit control exactly once.
5. Never retry a final financial click when completion is uncertain.

Do not ask for a second confirmation after the user has already authorized the purchase within the stated quantity and budget.

## Hard Stops

Stop without relaxing requirements when any of these occurs:

- insufficient balance or a required Add funds, card, bank-transfer, top-up, or bonus-purchase flow;
- extra cost or an optional paid service;
- a policy or manual-review warning that changes purchase risk;
- price outside the requested range;
- wrong URL, anchor, project, domain, or task count;
- nofollow-only or unclear dofollow support;
- conflicting publisher requirements or unavailable site/performer;
- login, CAPTCHA, 2FA, OTP, security, or credential-update challenge;
- the user controls the task space;
- post-click completion remains unclear.

Never click Add funds, payment, bonus, Empty Cart, delete controls, unrelated Buy buttons, or paid-extra checkboxes unless the user explicitly requests that separate action.

## Completion Verification And Cleanup

After the single final click, verify one of these outcomes through the live UI:

- a task page shows the new task ID, selected domain, exact URL and anchor, final price, and a status such as `Task Review`, `Task's Acceptance`, or `In Progress`;
- the page returns to Search for sites with `Task has been successfully sent.`, Balance decreases, and Reserved increases by the submitted total, followed by confirmation on `https://cp.adsy.com/marketer/invite` or the task-detail page;
- the cart becomes empty and balance/Reserved changes match the submitted task total, followed by task-list confirmation.

If completion is unclear, capture a screenshot and stop. Do not retry in a way that could duplicate the purchase.

After confirmed completion, close the Ego Lite task space using a dedicated final `completeTaskSpace(taskSpaceId, { keep: false })` heredoc. If control was handed to the user for login or verification, keep the task space open.

## Final Report

Reply in Chinese and include:

- newly submitted count for this run;
- selected anchor when it came from a list;
- domain, task ID when visible, and final price for each task;
- total cost and visible Balance/Reserved values when known;
- skipped candidates or blockers;
- screenshot evidence when reporting no suitable candidates or unclear completion.
