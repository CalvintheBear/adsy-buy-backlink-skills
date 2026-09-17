import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME || '.'}/.codex`;

const CONFIG = {
  chromePath: process.env.ADSY_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  userDataDir: process.env.ADSY_CHROME_PROFILE || `${CODEX_HOME}/chrome-profiles/adsy-puppeteer`,
  runtimeDir: process.env.ADSY_PUPPETEER_WORKDIR || `${CODEX_HOME}/adsy-puppeteer`,
  platformUrl: process.env.ADSY_PLATFORM_URL || 'https://cp.adsy.com/marketer/platform?SiteSearch%5Bverified%5D=1',
  keychainAccount: process.env.ADSY_KEYCHAIN_ACCOUNT || 'adsy-login',
  keychainEmailService: process.env.ADSY_KEYCHAIN_EMAIL_SERVICE || 'adsy-puppeteer-email',
  keychainPasswordService: process.env.ADSY_KEYCHAIN_PASSWORD_SERVICE || 'adsy-puppeteer-password',
};

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const screenshotPath = `${CONFIG.runtimeDir}/adsy-security-${timestamp}.png`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readKeychainValue(service) {
  return execFileSync(
    '/usr/bin/security',
    ['find-generic-password', '-a', CONFIG.keychainAccount, '-s', service, '-w'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    },
  ).trim();
}

async function settle(page, ms = 1200) {
  await page.waitForNetworkIdle({ idleTime: 700, timeout: 9000 }).catch(() => {});
  await sleep(ms);
}

async function state(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    text: document.body?.innerText || '',
    loginInputs: Array.from(document.querySelectorAll('input')).map((input) => ({
      name: input.name || '',
      id: input.id || '',
      type: input.type || '',
      placeholder: input.placeholder || '',
    })),
  }));
}

function looksLikeLogin(pageState) {
  const inputs = JSON.stringify(pageState.loginInputs);
  return (
    /\/login\b/i.test(pageState.url) ||
    /LoginForm\[email\]/i.test(inputs) ||
    (/password/i.test(inputs) && /\b(Log In|Login|Sign in)\b/i.test(pageState.text))
  );
}

function challengeLabels(text) {
  const labels = [];
  const checks = [
    ['captcha', /captcha|recaptcha|hcaptcha/i],
    ['2FA', /2fa|two[- ]factor|authenticator|verification code|otp|one[- ]time password/i],
    ['security verification', /security check|security verification|verify it'?s you|verify you are human|checking your browser|cloudflare/i],
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(text)) labels.push(label);
  }
  return labels;
}

async function fill(page, selector, value) {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(value, { delay: 6 });
}

async function clickSubmit(page) {
  const selector = await page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const button = Array.from(document.querySelectorAll('button,a,input[type="submit"]')).find((el) => {
      const text = String(el.innerText || el.value || el.getAttribute('aria-label') || '')
        .replace(/\s+/g, ' ')
        .trim();
      return visible(el) && !el.disabled && /^(Log In|Log in|Login|Sign in)$/i.test(text);
    });
    if (!button) return null;
    if (button.id) return `#${CSS.escape(button.id)}`;
    if (button.name) return `${button.localName}[name="${String(button.name).replace(/"/g, '\\"')}"]`;
    const parts = [];
    let node = button;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
      const siblings = Array.from(node.parentElement?.children || []).filter(
        (sibling) => sibling.localName === node.localName,
      );
      parts.unshift(`${node.localName}:nth-of-type(${siblings.indexOf(node) + 1})`);
      node = node.parentElement;
    }
    return `body > ${parts.join(' > ')}`;
  });
  if (!selector) throw new Error('Login submit button was not visible.');
  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
    page.click(selector),
  ]);
  await settle(page);
}

async function redactVisibleCredentials(page, email) {
  await page.evaluate((knownEmail) => {
    const redactedEmail = '[redacted email]';
    for (const input of document.querySelectorAll('input')) {
      const nameBlob = `${input.name || ''} ${input.id || ''} ${input.placeholder || ''}`;
      if (/password/i.test(input.type || nameBlob)) {
        input.value = '********';
        input.setAttribute('value', '********');
      } else if (/email|LoginForm\[email\]/i.test(`${input.type || ''} ${nameBlob}`)) {
        input.value = redactedEmail;
        input.setAttribute('value', redactedEmail);
      }
    }

    if (knownEmail) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        if (node.nodeValue?.includes(knownEmail)) {
          node.nodeValue = node.nodeValue.split(knownEmail).join(redactedEmail);
        }
      }
    }
  }, email);
}

const browser = await puppeteer.launch({
  executablePath: CONFIG.chromePath,
  headless: false,
  defaultViewport: null,
  userDataDir: CONFIG.userDataDir,
  args: ['--no-first-run', '--no-default-browser-check', '--disable-features=ChromeWhatsNewUI'],
});

try {
  const page = (await browser.pages())[0] || (await browser.newPage());
  page.setDefaultTimeout(15000);
  await page.goto(CONFIG.platformUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);

  let pageState = await state(page);
  let email = '';

  if (looksLikeLogin(pageState) && challengeLabels(pageState.text).length === 0) {
    email = readKeychainValue(CONFIG.keychainEmailService);
    const password = readKeychainValue(CONFIG.keychainPasswordService);
    await fill(page, 'input[name="LoginForm[email]"], input[type="email"]', email);
    await fill(page, 'input[name="LoginForm[password]"], input[type="password"]', password);
    await clickSubmit(page);
    pageState = await state(page);
  }

  await redactVisibleCredentials(page, email);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const labels = challengeLabels(pageState.text);
  console.log(JSON.stringify({
    screenshotPath,
    url: pageState.url,
    title: pageState.title,
    challengeLabels: labels,
    stillLoginPage: looksLikeLogin(pageState),
  }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
