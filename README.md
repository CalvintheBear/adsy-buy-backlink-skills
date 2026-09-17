# Adsy Backlink Buyer Skill

Codex skill and Puppeteer runner for buying or submitting Adsy / cp.adsy.com Article Posting / Content placement backlinks through the real Adsy UI.

The reusable runner is:

```text
scripts/adsy-puppeteer/project-runner.mjs
```

It uses environment variables for each project, so it does not hard-code a target site, anchor, or budget.

## Files

- `SKILL.md`: Codex skill instructions and safety rules.
- `agents/openai.yaml`: Skill display metadata.
- `scripts/adsy-puppeteer/project-runner.mjs`: Generic Adsy purchase runner.
- `scripts/adsy-puppeteer/launch-adsy-login.mjs`: Manual profile login helper.
- `scripts/adsy-puppeteer/screenshot-adsy-security.mjs`: Login/security diagnostic helper.
- `scripts/adsy-puppeteer/package.json` and `package-lock.json`: Puppeteer runtime dependencies.

## Do Not Commit

Never commit Chrome profiles, cookies, Keychain values, screenshots, DOM dumps, purchase logs, `.env` files, or `node_modules`.

## Setup

Copy or clone this repository as a Codex skill directory, for example:

```bash
mkdir -p "$CODEX_HOME/skills"
git clone https://github.com/CalvintheBear/adsy-buy-backlink-skills.git "$CODEX_HOME/skills/adsy-backlink-buyer"
```

Install the Puppeteer runtime dependencies:

```bash
mkdir -p "$CODEX_HOME/adsy-puppeteer"
cp -R "$CODEX_HOME/skills/adsy-backlink-buyer/scripts/adsy-puppeteer/"* "$CODEX_HOME/adsy-puppeteer/"
cd "$CODEX_HOME/adsy-puppeteer"
npm install
```

Store Adsy credentials in macOS Keychain. The runner reads them only from Keychain:

```bash
security add-generic-password -a adsy-login -s adsy-puppeteer-email -w "YOUR_ADSY_EMAIL" -U
security add-generic-password -a adsy-login -s adsy-puppeteer-password -w "YOUR_ADSY_PASSWORD" -U
```

## Dry Run

Use dry-run first. It stops before the final purchase click.

```bash
cd "$CODEX_HOME/adsy-puppeteer"
ADSY_PROJECT_SLUG="example-project" \
ADSY_PROJECT_NAME="Example Project" \
ADSY_PROMOTED_URL="https://example.com/page" \
ADSY_ANCHOR_TEXT="Example Anchor" \
ADSY_MIN_PRICE=100 \
ADSY_MAX_PRICE=250 \
ADSY_COUNT=1 \
npm run project:dry-run
```

## Buy

Only run buy mode when the task is authorized and the budget/rules are correct.

```bash
cd "$CODEX_HOME/adsy-puppeteer"
ADSY_PROJECT_SLUG="example-project" \
ADSY_PROJECT_NAME="Example Project" \
ADSY_PROMOTED_URL="https://example.com/page" \
ADSY_ANCHOR_TEXT="Example Anchor" \
ADSY_MIN_PRICE=100 \
ADSY_MAX_PRICE=250 \
ADSY_COUNT=1 \
npm run project:buy
```

## Notes

- Uses `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` by default.
- Uses `$CODEX_HOME/chrome-profiles/adsy-puppeteer` as the dedicated Chrome profile.
- Override with `ADSY_CHROME_PATH`, `ADSY_CHROME_PROFILE`, or `ADSY_PUPPETEER_WORKDIR` if needed.
- The runner uses real Puppeteer UI interactions. It must not be modified to submit purchase APIs directly.
- Candidate ranking now prefers visible United States geo signals, including `Country`, `Semrush Top Country`, US flag markers, host/server/location text, and US audience/traffic wording.
- Directory, blog/news, and forum/community sites receive a secondary preference boost after US geo relevance and dofollow checks.
- `ADSY_CANDIDATE_LIMIT` defaults to 80 so ranking has a broader pool; override it per run if needed.
