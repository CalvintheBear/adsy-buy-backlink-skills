# Adsy Backlink Buyer Skill

Codex Skill for buying or submitting Adsy backlinks through the real Adsy UI with Ego Lite task spaces.

[中文说明](#中文说明) · [English Guide](#english-guide)

> **Important:** Buy mode can spend Adsy account funds. The Skill performs a final live-page review and clicks the purchase control only when the user has explicitly authorized buying within a stated quantity and budget.

## 中文说明

### 与本机自动化机制一致

这个仓库采用与当前本机 Adsy 定时自动化相同的运行机制：

- 只使用 Ego Lite / `ego-browser` 控制真实网页；
- 每个项目使用并持续复用独立 task space；
- 复用 Ego Lite 已有登录状态，不读取 Keychain，不导出或注入 Cookie；
- 每次页面状态变化后重新读取 snapshot、页面信息或截图；
- 最终购买只通过 Adsy 页面上的真实按钮完成；
- 登录、CAPTCHA、2FA 或安全验证时把 task space 交给用户；
- 完成后核对任务 ID、域名、价格、URL、锚文本和状态，再关闭 task space。

它不依赖 Puppeteer、Playwright、Selenium 或本地 Adsy runner，也不会创建或运行 Adsy 自动化脚本。

### 模型与推理强度

本机定时自动化及部署此 Skill 的自动化任务建议使用：

```toml
model = "gpt-5.6-sol"
reasoning_effort = "high"
```

- 模型：`gpt-5.6-sol`
- 推理强度：`high（高）`

Skill 文件本身不会自动切换当前任务的模型；创建或更新 Codex 自动化时，建议在可用的情况下配置以上两个值。

### 依赖

- Codex Desktop；
- 已提供的 Ego Lite / `ego-browser` Skill；
- 一个可以正常访问的 Adsy marketer 账号；
- Ego Lite task space 中已有的 Adsy 登录状态；
- 足够的 Adsy 余额。

不需要安装 npm 包，不需要配置 macOS Keychain，也不需要单独的 Chrome profile 目录。

### 安装

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills"
git clone https://github.com/CalvintheBear/adsy-buy-backlink-skills.git \
  "$CODEX_HOME/skills/adsy-backlink-buyer"
```

如果已安装旧版本：

```bash
cd "${CODEX_HOME:-$HOME/.codex}/skills/adsy-backlink-buyer"
git pull --ff-only
```

### 在 Codex 中购买

提供推广 URL、锚文本、数量和每条价格范围：

```text
使用 $adsy-backlink-buyer，在 Adsy 购买 1 条新的 Content placement 外链。
推广 URL：https://example.com/page
锚文本：Example Anchor
每条价格：50–150 美元
```

“购买”“Buy”“submit”等明确措辞代表用户授权在所有检查通过后点击一次最终购买按钮，不需要再次确认。

### Dry Run

如果只想检查候选网站和表单，不产生费用，请明确说明：

```text
使用 $adsy-backlink-buyer 做 dry run。
推广 URL：https://example.com/page
锚文本：Example Anchor
价格范围：50–150 美元
不要点击最终购买按钮。
```

### 多锚文本随机选择

定时任务可以提供多个允许的锚文本：

```text
锚文本从 “AI Image editor” 和 “AI Photo editor” 中随机选择一个。
本次运行从文章正文到购买前复核必须始终使用同一个值。
```

Skill 会在运行开始时选择一次并记录，本次任务中不会重新随机。

### 自动化流程

1. 创建或复用项目专用的 Ego Lite task space。
2. 打开 Adsy verified-sites 页面并复用已有登录状态。
3. 设置 verified、价格范围、排除已合作网站等筛选条件。
4. 核对 dofollow、服务类型、价格、质量和发布要求。
5. 生成符合发布方字数要求的文章，只放一个准确的 URL/锚文本链接。
6. 填写项目、文章、URL、锚文本和 Special requirements。
7. 购买前重新核对域名、价格、项目、链接、字数、付费附加项、购物车和余额。
8. 只点击一次当前任务表单的真实主购买按钮。
9. 到任务页或 Invite 列表核对新任务后关闭 task space。

### 关键规则

- 历史任务不计入本次完成；每次必须新提交指定数量。
- 只购买 verified、价格合规、支持 dofollow 的 Article Posting / Content placement。
- 不选择 Writing & Placement、Special Topic 或其他额外付费服务，除非用户明确要求。
- 如果没有识别到候选，必须先检查整页 snapshot、截图和至少前五个可见候选，不能直接报告“没有站点”。
- “Limited time offer / Bank Wire Transfer / Add funds now” 可关闭促销横幅不等于余额不足；关闭后需要重新核对。
- 余额不足、必须充值、价格超限、字段错误、nofollow-only、要求冲突或状态不明时立即停止。
- 最终购买按钮只点击一次；结果不明确时不得重试，以免重复购买。
- 登录、CAPTCHA、2FA、OTP 或安全挑战出现时，必须把 task space 交给用户并停止自动执行。

完整运行规则见 [`SKILL.md`](./SKILL.md)。

## English Guide

### Matches the local automation mechanism

This repository uses the same mechanism as the currently active local Adsy automations:

- Ego Lite / `ego-browser` is the only browser-control mechanism;
- each project creates and continuously reuses a dedicated task space;
- the task space reuses existing login state without reading Keychain or exporting/injecting cookies;
- every meaningful page-state change is followed by a fresh snapshot, page-info check, or screenshot;
- purchases are made only through real Adsy UI controls;
- login, CAPTCHA, 2FA, or security challenges are handed off to the user;
- the new task ID, domain, price, URL, anchor, and status are verified before the task space is closed.

It does not depend on Puppeteer, Playwright, Selenium, or local Adsy runners, and it does not create or execute Adsy automation scripts.

### Model and reasoning effort

The recommended configuration for local scheduled automations and other automations deploying this Skill is:

```toml
model = "gpt-5.6-sol"
reasoning_effort = "high"
```

- Model: `gpt-5.6-sol`
- Reasoning effort: `high`

The Skill file does not switch the current task’s model by itself. Configure both values when available; they are recommended rather than required.

### Requirements

- Codex Desktop;
- the bundled Ego Lite / `ego-browser` Skill;
- an accessible Adsy marketer account;
- an existing Adsy login session in the Ego Lite task space;
- sufficient Adsy balance.

No npm packages, macOS Keychain setup, or dedicated local Chrome-profile directory are required.

### Install

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills"
git clone https://github.com/CalvintheBear/adsy-buy-backlink-skills.git \
  "$CODEX_HOME/skills/adsy-backlink-buyer"
```

To update an older installation:

```bash
cd "${CODEX_HOME:-$HOME/.codex}/skills/adsy-backlink-buyer"
git pull --ff-only
```

### Buy from Codex

Provide the promoted URL, exact anchor, quantity, and per-site price range:

```text
Use $adsy-backlink-buyer to buy 1 new Adsy Content placement backlink.
Promoted URL: https://example.com/page
Anchor text: Example Anchor
Price per site: USD 50–150
```

An explicit action such as “buy” or “submit” authorizes one final purchase click after every required check passes. A second confirmation is not required.

### Dry run

To inspect candidates and forms without spending funds, say so explicitly:

```text
Use $adsy-backlink-buyer for a dry run.
Promoted URL: https://example.com/page
Anchor text: Example Anchor
Price range: USD 50–150
Do not click the final purchase control.
```

### Random choice from allowed anchors

A scheduled task can provide several allowed anchors:

```text
Randomly choose one anchor from “AI Image editor” and “AI Photo editor”.
Use the same chosen value from article generation through pre-purchase review.
```

The Skill chooses once at the start and never re-randomizes during that run.

### Automation flow

1. Create or reuse the project’s dedicated Ego Lite task space.
2. Open Adsy’s verified-sites page and reuse the existing login session.
3. Set and verify the verified, price-range, and exclude-worked-with filters.
4. Review dofollow support, service type, final price, site quality, and publisher requirements.
5. Generate an article that meets the minimum word count and contains exactly one correct URL/anchor link.
6. Fill the project, article, URL, anchor, and Special requirements.
7. Re-check the domain, price, project, link, word count, paid extras, cart, and balance.
8. Click the current task form’s real primary purchase control exactly once.
9. Verify the new task in the task page or Invite list, then close the task space.

### Key rules

- Historical tasks never count; each run must submit the requested number of new tasks.
- Buy only verified, in-range, dofollow Article Posting / Content placement offers.
- Do not select Writing & Placement, Special Topic, or other paid extras unless explicitly requested.
- If no candidates are recognized, inspect a full-page snapshot, screenshot, and at least the first five visible candidates before reporting no sites.
- A closable “Limited time offer / Bank Wire Transfer / Add funds now” banner is not proof of insufficient balance; close it and re-check.
- Stop on insufficient balance, required top-up, out-of-range price, wrong values, nofollow-only support, conflicting requirements, or unclear completion.
- Click the final purchase control once only. Never retry when the result is uncertain.
- Hand off the task space and stop automation when login, CAPTCHA, 2FA, OTP, or another security challenge appears.

See [`SKILL.md`](./SKILL.md) for the complete operating rules.

## Repository files

- `SKILL.md`: complete Ego Lite Adsy workflow, purchase rules, and hard stops.
- `agents/openai.yaml`: Codex Skill display metadata.
- `README.md`: bilingual installation and usage guide.
