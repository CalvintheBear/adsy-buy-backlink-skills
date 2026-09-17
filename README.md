# Adsy Backlink Buyer Skill

Codex Skill + Puppeteer runner for buying or submitting Adsy / cp.adsy.com Article Posting and Content placement backlinks through the real Adsy UI.

[中文使用说明](#中文使用说明) · [English Guide](#english-guide)

> **Safety:** The runner can spend money in buy mode. Always verify the target URL, anchor text, quantity, and per-site price range. Start with a dry run when testing a new setup.

## 中文使用说明

### 功能

这个 Skill 可以让 Codex 通过本机 Chrome 和 Adsy 的真实网页界面：

- 搜索经过验证的 Adsy 网站；
- 按价格、dofollow、完成率及其他条件筛选候选网站；
- 填写推广 URL、锚文本、文章和发布要求；
- 在明确授权后提交或购买新的外链任务；
- 遇到登录、安全验证、余额不足或页面结构变化时安全停止。

它不会把 Adsy 账号密码写入文件。登录凭据只从 macOS Keychain 读取。

### 系统要求

- macOS；
- Google Chrome；
- Node.js 18 或更高版本；
- npm；
- Codex；
- 可用的 Adsy marketer 账号及余额。

### 1. 安装 Skill

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills"
git clone https://github.com/CalvintheBear/adsy-buy-backlink-skills.git \
  "$CODEX_HOME/skills/adsy-backlink-buyer"
```

如果尚未设置 `CODEX_HOME`，上面的命令会自动使用 `~/.codex`。

### 2. 安装运行依赖

建议把可执行运行环境与 Skill 源文件分开。截图、DOM 诊断和运行日志只保存在运行目录中。

```bash
mkdir -p "$CODEX_HOME/adsy-puppeteer"
cp -R "$CODEX_HOME/skills/adsy-backlink-buyer/scripts/adsy-puppeteer/"* \
  "$CODEX_HOME/adsy-puppeteer/"
cd "$CODEX_HOME/adsy-puppeteer"
npm install
```

### 3. 把 Adsy 凭据存入 macOS Keychain

```bash
security add-generic-password \
  -a adsy-login \
  -s adsy-puppeteer-email \
  -w "你的_ADSY_邮箱" \
  -U

security add-generic-password \
  -a adsy-login \
  -s adsy-puppeteer-password \
  -w "你的_ADSY_密码" \
  -U
```

凭据不会保存在仓库、`.env` 文件或运行日志中。如果出现 CAPTCHA、2FA、OTP 或安全挑战，自动化会停止，等待人工处理。

### 4. 在 Codex 中使用

安装后，可以直接向 Codex 描述购买任务。必须提供推广 URL 和准确的锚文本。例如：

```text
使用 $adsy-backlink-buyer，在 Adsy 购买 1 条新外链。
推广 URL：https://example.com/page
锚文本：Example Anchor
每条价格：100–200 美元
```

包含“购买”“Buy”或“submit”等明确词语的请求，会被视为允许在符合指定数量和预算时点击最终购买按钮。如果只想检查候选网站，请明确要求 `dry run`。

### 5. 命令行 Dry Run

Dry Run 会完成登录、筛选和表单检查，但在最终购买点击之前停止。

```bash
cd "$CODEX_HOME/adsy-puppeteer"

ADSY_PROJECT_SLUG="example-project" \
ADSY_PROJECT_NAME="Example Project" \
ADSY_PROMOTED_URL="https://example.com/page" \
ADSY_ANCHOR_TEXT="Example Anchor" \
ADSY_MIN_PRICE=100 \
ADSY_MAX_PRICE=200 \
ADSY_COUNT=1 \
npm run project:dry-run
```

### 6. 正式购买

下面的命令会在检查通过后点击 Adsy 的真实购买按钮并可能产生费用：

```bash
cd "$CODEX_HOME/adsy-puppeteer"

ADSY_PROJECT_SLUG="example-project" \
ADSY_PROJECT_NAME="Example Project" \
ADSY_PROMOTED_URL="https://example.com/page" \
ADSY_ANCHOR_TEXT="Example Anchor" \
ADSY_MIN_PRICE=100 \
ADSY_MAX_PRICE=200 \
ADSY_COUNT=1 \
npm run project:buy
```

### 常用环境变量

| 变量 | 用途 | 默认值 |
| --- | --- | --- |
| `ADSY_PROMOTED_URL` | 要推广的准确 URL | `https://example.com/` |
| `ADSY_ANCHOR_TEXT` | 要使用的准确锚文本 | `Example Anchor` |
| `ADSY_PROJECT_NAME` | Adsy 项目名称 | `Example Project` |
| `ADSY_PROJECT_SLUG` | 日志和诊断文件的安全短名称 | `project` |
| `ADSY_COUNT` | 本次新建任务数量 | `1` |
| `ADSY_MIN_PRICE` | 每个网站的最低价格（美元） | `50` |
| `ADSY_MAX_PRICE` | 每个网站的最高价格（美元） | `150` |
| `ADSY_CANDIDATE_LIMIT` | 最多分析的候选网站数量 | `80` |
| `ADSY_CHROME_PATH` | Chrome 可执行文件路径 | macOS Chrome 默认路径 |
| `ADSY_CHROME_PROFILE` | 专用 Chrome profile 路径 | `$CODEX_HOME/chrome-profiles/adsy-puppeteer` |
| `ADSY_PUPPETEER_WORKDIR` | 运行目录 | `$CODEX_HOME/adsy-puppeteer` |
| `ADSY_PLATFORM_URL` | 自定义 Adsy 搜索页 URL | 自动生成的 verified-sites URL |

Keychain 的 account 和 service 名也可以通过 `ADSY_KEYCHAIN_ACCOUNT`、`ADSY_KEYCHAIN_EMAIL_SERVICE`、`ADSY_KEYCHAIN_PASSWORD_SERVICE` 覆盖。

### 安全规则

- 先用 Dry Run 验证新配置。
- 不要提交 `.env`、Chrome profiles、cookies、截图、DOM dumps、购买日志或 `node_modules`。
- 自动化不会充值、添加银行卡、购买额外服务或绕过 CAPTCHA/2FA。
- 如果余额不足、价格超出范围、URL/锚文本不匹配或 dofollow 条件不清楚，自动化应停止而不是购买。
- 正式购买后，请在 Adsy 任务页核对域名、任务 ID、价格和状态。

## English Guide

### What it does

This Skill lets Codex use a local Chrome browser and the real Adsy UI to:

- search verified Adsy sites;
- filter candidates by price, dofollow support, completion signals, and other requirements;
- fill the promoted URL, exact anchor text, article, and publisher instructions;
- submit or buy new backlink tasks after explicit authorization;
- stop safely on login challenges, insufficient balance, or unexpected page changes.

Adsy credentials are never stored in project files. They are read only from macOS Keychain.

### Requirements

- macOS;
- Google Chrome;
- Node.js 18 or newer;
- npm;
- Codex;
- an active Adsy marketer account with sufficient balance.

### 1. Install the Skill

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills"
git clone https://github.com/CalvintheBear/adsy-buy-backlink-skills.git \
  "$CODEX_HOME/skills/adsy-backlink-buyer"
```

If `CODEX_HOME` is not already set, the command above automatically uses `~/.codex`.

### 2. Install runtime dependencies

Keep the executable runtime separate from the Skill source. Screenshots, DOM diagnostics, and runtime logs should remain in the runtime directory.

```bash
mkdir -p "$CODEX_HOME/adsy-puppeteer"
cp -R "$CODEX_HOME/skills/adsy-backlink-buyer/scripts/adsy-puppeteer/"* \
  "$CODEX_HOME/adsy-puppeteer/"
cd "$CODEX_HOME/adsy-puppeteer"
npm install
```

### 3. Store Adsy credentials in macOS Keychain

```bash
security add-generic-password \
  -a adsy-login \
  -s adsy-puppeteer-email \
  -w "YOUR_ADSY_EMAIL" \
  -U

security add-generic-password \
  -a adsy-login \
  -s adsy-puppeteer-password \
  -w "YOUR_ADSY_PASSWORD" \
  -U
```

Credentials are not written to the repository, `.env` files, or runtime logs. The automation stops for manual handling if CAPTCHA, 2FA, OTP, or another security challenge appears.

### 4. Use it from Codex

After installation, describe the purchase to Codex and include the promoted URL and exact anchor text. For example:

```text
Use $adsy-backlink-buyer to buy 1 new Adsy backlink.
Promoted URL: https://example.com/page
Anchor text: Example Anchor
Price per site: USD 100–200
```

A request containing an explicit action such as “buy” or “submit” authorizes the final Adsy purchase click only within the requested quantity and budget. Ask for a `dry run` if you want candidate and form checks without purchasing.

### 5. Command-line dry run

Dry-run mode performs login, filtering, and form checks, then stops before the final purchase click.

```bash
cd "$CODEX_HOME/adsy-puppeteer"

ADSY_PROJECT_SLUG="example-project" \
ADSY_PROJECT_NAME="Example Project" \
ADSY_PROMOTED_URL="https://example.com/page" \
ADSY_ANCHOR_TEXT="Example Anchor" \
ADSY_MIN_PRICE=100 \
ADSY_MAX_PRICE=200 \
ADSY_COUNT=1 \
npm run project:dry-run
```

### 6. Buy backlinks

The following command can click the real Adsy purchase control and spend account funds after all checks pass:

```bash
cd "$CODEX_HOME/adsy-puppeteer"

ADSY_PROJECT_SLUG="example-project" \
ADSY_PROJECT_NAME="Example Project" \
ADSY_PROMOTED_URL="https://example.com/page" \
ADSY_ANCHOR_TEXT="Example Anchor" \
ADSY_MIN_PRICE=100 \
ADSY_MAX_PRICE=200 \
ADSY_COUNT=1 \
npm run project:buy
```

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `ADSY_PROMOTED_URL` | Exact URL to promote | `https://example.com/` |
| `ADSY_ANCHOR_TEXT` | Exact anchor text | `Example Anchor` |
| `ADSY_PROJECT_NAME` | Adsy project name | `Example Project` |
| `ADSY_PROJECT_SLUG` | Safe short name for logs and diagnostics | `project` |
| `ADSY_COUNT` | Number of new tasks in the current run | `1` |
| `ADSY_MIN_PRICE` | Minimum price per site in USD | `50` |
| `ADSY_MAX_PRICE` | Maximum price per site in USD | `150` |
| `ADSY_CANDIDATE_LIMIT` | Maximum candidate sites to inspect | `80` |
| `ADSY_CHROME_PATH` | Chrome executable path | default macOS Chrome path |
| `ADSY_CHROME_PROFILE` | Dedicated Chrome profile path | `$CODEX_HOME/chrome-profiles/adsy-puppeteer` |
| `ADSY_PUPPETEER_WORKDIR` | Executable runtime directory | `$CODEX_HOME/adsy-puppeteer` |
| `ADSY_PLATFORM_URL` | Custom Adsy search-page URL | generated verified-sites URL |

The Keychain account and service names can also be overridden with `ADSY_KEYCHAIN_ACCOUNT`, `ADSY_KEYCHAIN_EMAIL_SERVICE`, and `ADSY_KEYCHAIN_PASSWORD_SERVICE`.

### Safety rules

- Use a dry run first when validating a new setup.
- Never commit `.env` files, Chrome profiles, cookies, screenshots, DOM dumps, purchase logs, or `node_modules`.
- The automation does not add funds, add payment cards, buy optional extras, or bypass CAPTCHA/2FA.
- It should stop instead of buying when balance is insufficient, price is outside the range, URL/anchor values do not match, or dofollow support is unclear.
- After buying, verify the domain, task ID, final price, and status on the Adsy task page.

## Repository files

- `SKILL.md`: Codex Skill instructions and safety rules.
- `agents/openai.yaml`: Skill display metadata.
- `scripts/adsy-puppeteer/project-runner.mjs`: configurable Adsy purchase runner.
- `scripts/adsy-puppeteer/launch-adsy-login.mjs`: manual profile-login helper.
- `scripts/adsy-puppeteer/screenshot-adsy-security.mjs`: login and security diagnostic helper.
- `scripts/adsy-puppeteer/package.json` and `package-lock.json`: runtime dependencies.
