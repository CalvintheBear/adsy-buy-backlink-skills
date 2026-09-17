import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME || '.'}/.codex`;
const PROJECT_SLUG = process.env.ADSY_PROJECT_SLUG || 'project';
const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const CONFIG = {
  chromePath: process.env.ADSY_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  userDataDir: process.env.ADSY_CHROME_PROFILE || `${CODEX_HOME}/chrome-profiles/adsy-puppeteer`,
  runtimeDir: process.env.ADSY_PUPPETEER_WORKDIR || `${CODEX_HOME}/adsy-puppeteer`,
  projectSlug: PROJECT_SLUG,
  platformUrl:
    process.env.ADSY_PLATFORM_URL ||
    `https://cp.adsy.com/marketer/platform?SiteSearch%5Bverified%5D=1&SiteSearch%5BsitePriceMin%5D=${numberFromEnv('ADSY_MIN_PRICE', 50)}&SiteSearch%5BsitePriceMax%5D=${numberFromEnv('ADSY_MAX_PRICE', 150)}&SiteSearch%5BcompletionRate%5D=7&SiteSearch%5Blifetime_invites_rate%5D=7&SiteSearch%5Breplace_invites_rate%5D=7&SiteSearch%5BsiteWorkedWith%5D=2`,
  keychainAccount: process.env.ADSY_KEYCHAIN_ACCOUNT || 'adsy-login',
  keychainEmailService: process.env.ADSY_KEYCHAIN_EMAIL_SERVICE || 'adsy-puppeteer-email',
  keychainPasswordService: process.env.ADSY_KEYCHAIN_PASSWORD_SERVICE || 'adsy-puppeteer-password',
  count: numberFromEnv('ADSY_COUNT', 1),
  minPrice: numberFromEnv('ADSY_MIN_PRICE', 50),
  maxPrice: numberFromEnv('ADSY_MAX_PRICE', 150),
  projectName: process.env.ADSY_PROJECT_NAME || 'Example Project',
  promotedUrl: process.env.ADSY_PROMOTED_URL || 'https://example.com/',
  anchorText: process.env.ADSY_ANCHOR_TEXT || 'Example Anchor',
  defaultCandidateLimit: numberFromEnv('ADSY_CANDIDATE_LIMIT', 80),
};

const REQUESTED_BUY_MODE = process.argv.includes('--buy');
const REQUESTED_DRY_RUN_MODE = process.argv.includes('--dry-run');
if (REQUESTED_BUY_MODE && REQUESTED_DRY_RUN_MODE) {
  console.error('Use either --buy or --dry-run, not both.');
  process.exit(1);
}
const BUY_MODE = !REQUESTED_DRY_RUN_MODE;
const CANDIDATE_LIMIT = readNumberFlag('--candidate-limit', CONFIG.defaultCandidateLimit);
let automaticLoginAttempted = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readNumberFlag(name, fallback) {
  const prefix = `${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const parsed = Number(raw.slice(prefix.length));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function log(message, data = null) {
  if (data == null) {
    console.log(message);
    return;
  }
  console.log(`${message} ${JSON.stringify(data, null, 2)}`);
}

function safeStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function dumpDomSnapshot(page, label) {
  const safeLabel = String(label || 'snapshot').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80);
  const path = `${CONFIG.runtimeDir}/${CONFIG.projectSlug}-dom-${safeLabel}-${safeStamp()}.json`;
  const snapshot = await page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const cssPath = (el) => {
      if (!el) return null;
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      let node = el;
      while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
        const tag = node.localName;
        const siblings = Array.from(node.parentElement?.children || []).filter(
          (sibling) => sibling.localName === tag,
        );
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
        node = node.parentElement;
      }
      return parts.length ? `body > ${parts.join(' > ')}` : null;
    };
    const redact = (el, value) => {
      const blob = `${el.name || ''} ${el.id || ''} ${el.type || ''}`.toLowerCase();
      if (/password|email|login|token|secret|credential/.test(blob)) return '[redacted]';
      return normalize(value).slice(0, 1000);
    };
    return {
      url: location.href,
      title: document.title,
      bodyText: normalize(document.body?.innerText).slice(0, 20000),
      elements: Array.from(document.querySelectorAll('body *')).map((el, index) => ({
        index,
        path: cssPath(el),
        tag: el.localName,
        id: el.id || '',
        className: String(el.className || '').slice(0, 300),
        name: el.getAttribute('name') || '',
        type: el.getAttribute('type') || '',
        role: el.getAttribute('role') || '',
        href: el.href || '',
        visible: visible(el),
        text: normalize(el.innerText || el.value || el.getAttribute('aria-label') || el.title).slice(0, 1200),
        value: 'value' in el ? redact(el, el.value) : '',
      })),
      forms: Array.from(document.querySelectorAll('form')).map((form) => ({
        path: cssPath(form),
        action: form.action || '',
        method: form.method || '',
        text: normalize(form.innerText).slice(0, 3000),
        fields: Array.from(form.querySelectorAll('input,textarea,select')).map((field) => ({
          path: cssPath(field),
          tag: field.localName,
          name: field.name || '',
          id: field.id || '',
          type: field.type || '',
          visible: visible(field),
          value: redact(field, field.value || ''),
        })),
      })),
      iframes: Array.from(document.querySelectorAll('iframe')).map((frame) => ({
        path: cssPath(frame),
        id: frame.id || '',
        name: frame.name || '',
        visible: visible(frame),
        text: normalize(frame.contentDocument?.body?.innerText).slice(0, 3000),
        html: String(frame.contentDocument?.body?.innerHTML || '').slice(0, 3000),
      })),
      errors: Array.from(
        document.querySelectorAll('.alert, .help-block, .error, .has-error, .invalid-feedback, .form-error'),
      )
        .filter(visible)
        .map((el) => normalize(el.innerText))
        .filter(Boolean)
        .slice(0, 50),
    };
  });
  writeFileSync(path, JSON.stringify(snapshot, null, 2));
  return path;
}

function readKeychainValue(service) {
  try {
    return execFileSync(
      '/usr/bin/security',
      [
        'find-generic-password',
        '-a',
        CONFIG.keychainAccount,
        '-s',
        service,
        '-w',
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 10000,
      },
    ).trim();
  } catch {
    throw new Error(`Missing or unreadable Keychain item: ${service}`);
  }
}

async function settle(page, ms = 800) {
  await page.waitForNetworkIdle({ idleTime: 700, timeout: 7000 }).catch(() => {});
  await sleep(ms);
}

async function getState(page) {
  return page.evaluate(() => ({
    url: location.href,
    title: document.title,
    text: document.body?.innerText || '',
    inputs: Array.from(document.querySelectorAll('input')).map((input) => ({
      name: input.getAttribute('name') || '',
      id: input.id || '',
      type: input.type || '',
      placeholder: input.getAttribute('placeholder') || '',
    })),
  }));
}

function isLoginPage(state) {
  const inputBlob = JSON.stringify(state.inputs || []);
  return (
    /\/login\b/i.test(state.url) ||
    /LoginForm\[email\]/i.test(inputBlob) ||
    (/password/i.test(inputBlob) && /\b(Log In|Login|Sign in)\b/i.test(state.text))
  );
}

function hasSecurityChallenge(text) {
  return /(captcha|recaptcha|hcaptcha|2fa|two-factor|two factor|verification code|authenticator|security check|security verification|otp|one-time password|verify it'?s you)/i.test(
    text,
  );
}

async function launchBrowser() {
  return puppeteer.launch({
    executablePath: CONFIG.chromePath,
    headless: false,
    defaultViewport: null,
    userDataDir: CONFIG.userDataDir,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=ChromeWhatsNewUI',
    ],
  });
}

async function fillSelector(page, selector, value) {
  await page.waitForSelector(selector, { visible: true, timeout: 10000 });
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(value, { delay: 6 });
  await page.keyboard.press('Tab');
}

async function clickAndWait(page, elementHandle) {
  await Promise.allSettled([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
    elementHandle.click(),
  ]);
  await settle(page);
}

async function findClickableByText(page, labels, selector = 'button,a,input[type="submit"]') {
  const handle = await page.evaluateHandle(
    (wantedLabels, wantedSelector) => {
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const labelsLower = wantedLabels.map((label) => label.toLowerCase());
      return (
        Array.from(document.querySelectorAll(wantedSelector)).find((el) => {
          if (!isVisible(el) || el.disabled) return false;
          const text = normalize(el.innerText || el.value || el.getAttribute('aria-label'));
          const lower = text.toLowerCase();
          return labelsLower.some((label) => lower === label || lower.includes(label));
        }) || null
      );
    },
    labels,
    selector,
  );
  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    return null;
  }
  return element;
}

async function ensureLoggedIn(page) {
  let state = await getState(page);
  if (!isLoginPage(state)) return;
  if (automaticLoginAttempted) {
    if (hasSecurityChallenge(state.text)) {
      throw new Error('Adsy login is blocked by captcha/2FA/security verification.');
    }
    throw new Error('Adsy returned to the login page after the one allowed automatic login.');
  }
  if (hasSecurityChallenge(state.text)) {
    throw new Error('Adsy login is blocked by captcha/2FA/security verification.');
  }

  automaticLoginAttempted = true;
  const email = readKeychainValue(CONFIG.keychainEmailService);
  const password = readKeychainValue(CONFIG.keychainPasswordService);
  if (!email || !password) {
    throw new Error('Keychain returned an empty Adsy credential value.');
  }

  log('Login page detected. Filling Adsy credentials from Keychain.');
  await fillSelector(page, 'input[name="LoginForm[email]"], input[type="email"]', email);
  await fillSelector(page, 'input[name="LoginForm[password]"], input[type="password"]', password);

  const rememberSelector = await page.evaluate(() => {
    const checkbox =
      document.querySelector('input[name="LoginForm[rememberMe]"]') ||
      Array.from(document.querySelectorAll('input[type="checkbox"]')).find((input) =>
        /remember/i.test(`${input.name} ${input.id} ${input.closest('label')?.innerText || ''}`),
      );
    if (!checkbox) return null;
    if (checkbox.id) return `#${CSS.escape(checkbox.id)}`;
    if (checkbox.name) return `input[name="${String(checkbox.name).replace(/"/g, '\\"')}"]`;
    return null;
  });
  if (rememberSelector) {
    const checked = await page.$eval(rememberSelector, (input) => input.checked).catch(() => true);
    if (!checked) await page.click(rememberSelector).catch(() => {});
  }

  const submit = await findClickableByText(page, ['Log In', 'Log in', 'Login']);
  if (!submit) throw new Error('Could not find the Adsy login submit button.');
  await clickAndWait(page, submit);

  state = await getState(page);
  if (isLoginPage(state)) {
    if (hasSecurityChallenge(state.text)) {
      throw new Error('Adsy login is blocked by captcha/2FA/security verification.');
    }
    throw new Error('Adsy login did not reach an authenticated marketer page.');
  }
  if (!/cp\.adsy\.com\/marketer/i.test(state.url)) {
    if (hasSecurityChallenge(state.text)) {
      throw new Error('Adsy login is blocked by captcha/2FA/security verification.');
    }
    throw new Error('Adsy login did not reach an authenticated marketer page.');
  }
}

async function gotoPlatform(page) {
  await page.goto(CONFIG.platformUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);
  await ensureLoggedIn(page);
  await page.goto(CONFIG.platformUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await settle(page);
  await ensureLoggedIn(page);
  const state = await getState(page);
  if (!/cp\.adsy\.com\/marketer/i.test(state.url)) {
    throw new Error('Adsy did not reach an authenticated marketer page after login.');
  }
}

function moneyToNumber(raw) {
  if (!raw) return null;
  const value = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : null;
}

function wordCountFromHtml(html) {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function canonicalGeoText(value) {
  return normalizeText(value)
    .replace(/\u{1F1FA}\u{1F1F8}/gu, 'United States')
    .replace(/\b(?:USA|U\.S\.A\.|U\.S\.|US)\b/g, 'United States')
    .toLowerCase();
}

function hasContextualUsSignal(canonicalText, contexts) {
  const country = '(?:united states|america|american)';
  return contexts.some((context) => {
    const pattern = new RegExp(
      `(?:${context})[^.;|\\n]{0,120}${country}|${country}[^.;|\\n]{0,120}(?:${context})`,
      'i',
    );
    return pattern.test(canonicalText);
  });
}

function candidatePreferenceSignals(candidate) {
  const canonicalText = canonicalGeoText(candidate.text);
  const hostContexts = [
    'host(?:ed|ing)?',
    'server',
    'server location',
    'datacenter',
    'data center',
    'ip location',
  ];
  const audienceContexts = [
    'audience',
    'traffic',
    'visitors?',
    'users?',
    'readers?',
    'market',
    'geo',
    'country',
    'location',
    'top countries',
    'main country',
    'language',
  ];
  const siteTypeHaystack = canonicalGeoText(`${candidate.domain || ''} ${candidate.text || ''}`);
  const siteTypes = [
    {
      name: 'directory',
      pattern:
        /\b(?:directory|directories|web\s+directory|link\s+directory|resource\s+directory|tools?\s+directory|catalog|catalogue|listing|navigation\s+site)\b/i,
    },
    {
      name: 'blog',
      pattern: /\b(?:blogs?|blogger|wordpress|article|magazine|news|journal|insights?)\b/i,
    },
    {
      name: 'forum',
      pattern: /\b(?:forum|forums|community|discussion|message\s+board|questions?\s+and\s+answers?|q&a)\b/i,
    },
  ]
    .filter((siteType) => siteType.pattern.test(siteTypeHaystack))
    .map((siteType) => siteType.name);
  const usDomainHint = /\.(?:us|edu)$/i.test(candidate.domain || '');

  return {
    usHost: hasContextualUsSignal(canonicalText, hostContexts),
    usAudience: hasContextualUsSignal(canonicalText, audienceContexts),
    usCountry: /(?:united states|america|american)/i.test(canonicalText),
    usDomainHint,
    siteTypes,
  };
}

function withCandidatePreferences(candidate) {
  const preference = candidatePreferenceSignals(candidate);
  return {
    ...candidate,
    preference,
    geoPreferenceScore:
      (preference.usHost ? 4 : 0) +
      (preference.usAudience ? 4 : 0) +
      (preference.usCountry ? 2 : 0) +
      (preference.usDomainHint ? 1 : 0),
    siteTypePreferenceScore: preference.siteTypes.length ? 2 + Math.min(preference.siteTypes.length, 2) : 0,
  };
}

function compareCandidates(a, b) {
  const dofollowDelta = Number(b.dofollow) - Number(a.dofollow);
  if (dofollowDelta) return dofollowDelta;
  const geoDelta = (b.geoPreferenceScore || 0) - (a.geoPreferenceScore || 0);
  if (geoDelta) return geoDelta;
  const siteTypeDelta = (b.siteTypePreferenceScore || 0) - (a.siteTypePreferenceScore || 0);
  if (siteTypeDelta) return siteTypeDelta;
  const workedDelta = Number(b.workedNa) - Number(a.workedNa);
  if (workedDelta) return workedDelta;
  const trafficDelta = (b.traffic || 0) - (a.traffic || 0);
  if (trafficDelta) return trafficDelta;
  const drDelta = (b.dr || 0) - (a.dr || 0);
  if (drDelta) return drDelta;
  return a.price - b.price;
}

function candidatePreferenceSummary(candidate) {
  const preference = candidate.preference || {};
  return {
    domain: candidate.domain,
    price: candidate.price,
    geoPreferenceScore: candidate.geoPreferenceScore || 0,
    siteTypePreferenceScore: candidate.siteTypePreferenceScore || 0,
    siteTypes: preference.siteTypes || [],
    usHost: Boolean(preference.usHost),
    usAudience: Boolean(preference.usAudience),
    usCountry: Boolean(preference.usCountry || preference.usDomainHint),
    traffic: candidate.traffic || null,
    dr: candidate.dr || null,
  };
}

async function collectCandidates(page, limit) {
  const seen = new Set();
  const candidates = [];

  for (let pageNumber = 1; pageNumber <= 6 && candidates.length < limit; pageNumber += 1) {
    const extracted = await page.evaluate(() => {
      const cssPath = (el) => {
        if (!el) return null;
        if (el.id) return `#${CSS.escape(el.id)}`;
        const parts = [];
        let node = el;
        while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
          const tag = node.localName;
          const siblings = Array.from(node.parentElement?.children || []).filter(
            (sibling) => sibling.localName === tag,
          );
          const index = siblings.indexOf(node) + 1;
          parts.unshift(`${tag}:nth-of-type(${index})`);
          node = node.parentElement;
        }
        return parts.length ? `body > ${parts.join(' > ')}` : null;
      };
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const allMoney = (text) =>
        Array.from(text.matchAll(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g)).map((m) =>
          Number(m[1].replace(/,/g, '')),
        );
      const priceNearContentPlacement = (text) => {
        const compact = normalize(text);
        const match =
          compact.match(/Content\s+placement[^$]{0,80}\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ||
          compact.match(/Article\s+Posting[^$]{0,80}\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
        return match ? Number(match[1].replace(/,/g, '')) : null;
      };
      const domainFromText = (text, links) => {
        const fromLinks = links
          .map((link) => link.href || link.innerText || '')
          .map((value) => {
            const match = String(value).match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);
            return match?.[1]?.toLowerCase() || null;
          })
          .find(Boolean);
        if (fromLinks && !/adsy\.com$/i.test(fromLinks)) return fromLinks;
        const textMatch = normalize(text).match(/\b(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i);
        return textMatch?.[1]?.toLowerCase() || null;
      };
      const parseMetric = (text, label) => {
        const re = new RegExp(`${label}[^0-9]{0,40}([0-9][0-9,.]*)`, 'i');
        const match = normalize(text).match(re);
        return match ? Number(match[1].replace(/,/g, '')) : null;
      };
      const roots = Array.from(
        document.querySelectorAll(
          [
            'tr',
            'article',
            'li',
            '.card',
            '.site',
            '.publisher',
            '.platform-item',
            '.panel',
            '.inv-item',
            '.elastic-inv-item',
            '.list-view-common__holder',
            '[class*="inv-item"]',
          ].join(', '),
        ),
      ).filter((root) => {
        const text = normalize(root.innerText);
        return text.length > 50 && /\$\s*[0-9]/.test(text) && /Buy\s+Post|Content\s+placement/i.test(text);
      });

      return roots
        .map((root) => {
          const text = normalize(root.innerText);
          const links = Array.from(root.querySelectorAll('a'));
          const button = Array.from(root.querySelectorAll('a,button,input[type="button"],input[type="submit"]')).find(
            (el) => visible(el) && /Buy\s+Post|Content\s+placement|Select/i.test(normalize(el.innerText || el.value)),
          );
          const domain = domainFromText(text, links);
          const price = priceNearContentPlacement(text);
          const prices = allMoney(text);
          const href = button?.href ? new URL(button.href, location.href).href : null;
          return {
            domain,
            href,
            buySelector: cssPath(button),
            text,
            price,
            prices,
            dofollow: /\bdofollow\b/i.test(text) && !/\bnofollow\s+only\b/i.test(text),
            nofollowOnly: /\bnofollow\s+only\b/i.test(text),
            workedNa: /worked\s+with[^A-Z0-9]{0,30}N\/A|I.?ve\s+worked[^A-Z0-9]{0,30}N\/A/i.test(text),
            traffic: parseMetric(text, 'Traffic'),
            da: parseMetric(text, 'DA'),
            dr: parseMetric(text, 'DR'),
          };
        })
        .filter((candidate) => candidate.domain && (candidate.href || candidate.buySelector));
    });

    for (const candidate of extracted) {
      const key = `${candidate.domain}:${candidate.href || candidate.buySelector}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const price = candidate.price ?? candidate.prices.find((value) => value >= CONFIG.minPrice && value <= CONFIG.maxPrice);
      if (price == null || price < CONFIG.minPrice || price > CONFIG.maxPrice) continue;
      if (candidate.nofollowOnly) continue;
      candidates.push(withCandidatePreferences({
        ...candidate,
        price,
      }));
      if (candidates.length >= limit) break;
    }

    if (candidates.length >= limit) break;
    const next = await findClickableByText(page, ['Next', '>', '»'], 'a,button');
    if (!next) break;
    await clickAndWait(page, next);
  }

  candidates.sort(compareCandidates);

  return candidates.slice(0, limit);
}

async function extractPerformers(page) {
  return page.evaluate(() => {
    const cssPath = (el) => {
      if (!el) return null;
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      let node = el;
      while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
        const tag = node.localName;
        const siblings = Array.from(node.parentElement?.children || []).filter(
          (sibling) => sibling.localName === tag,
        );
        const index = siblings.indexOf(node) + 1;
        parts.unshift(`${tag}:nth-of-type(${index})`);
        node = node.parentElement;
      }
      return parts.length ? `body > ${parts.join(' > ')}` : null;
    };
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const contentPlacementPrice = (text) => {
      const compact = normalize(text);
      const match =
        compact.match(/Content\s+placement[^$]{0,100}\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ||
        compact.match(/Article\s+Posting[^$]{0,100}\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ||
        compact.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
      return match ? Number(match[1].replace(/,/g, '')) : null;
    };
    const percentAfter = (text, label) => {
      const match = normalize(text).match(new RegExp(`${label}[^0-9]{0,40}([0-9]{1,3})\\s*%`, 'i'));
      return match ? Number(match[1]) : null;
    };
    const wordCount = (text) => {
      const match = normalize(text).match(/([0-9]{3,5})\s*words?/i);
      return match ? Number(match[1]) : null;
    };
    const roots = Array.from(
      document.querySelectorAll(
        [
          'tr',
          'article',
          'li',
          '.card',
          '.performer',
          '.publisher',
          '.panel',
          '.inv-item',
          '.elastic-inv-item',
          '.list-view-common__holder',
          '[class*="inv-item"]',
        ].join(', '),
      ),
    ).filter((root) => {
        const text = normalize(root.innerText);
        return text.length > 40 && /\$\s*[0-9]/.test(text) && /Buy\s+Post|Content\s+placement/i.test(text);
      });
    return roots
      .map((root) => {
        const text = normalize(root.innerText);
        const button = Array.from(root.querySelectorAll('a,button,input[type="button"],input[type="submit"]')).find(
          (el) => visible(el) && /Buy\s+Post|Select|Apply/i.test(normalize(el.innerText || el.value)),
        );
        return {
          selector: cssPath(button),
          href: button?.href ? new URL(button.href, location.href).href : null,
          text,
          price: contentPlacementPrice(text),
          dofollow: /\bdofollow\b/i.test(text) && !/\bnofollow\s+only\b/i.test(text),
          nofollowOnly: /\bnofollow\s+only\b/i.test(text),
          completion: percentAfter(text, 'Completion'),
          lifetime: percentAfter(text, 'Lifetime'),
          replacement: percentAfter(text, 'Replace|Replacement'),
          words: wordCount(text),
        };
      })
      .filter((performer) => performer.selector || performer.href);
  });
}

function choosePerformer(performers) {
  const filtered = performers
    .filter((performer) => performer.price >= CONFIG.minPrice && performer.price <= CONFIG.maxPrice)
    .filter((performer) => performer.dofollow && !performer.nofollowOnly)
    .filter((performer) => (performer.completion == null || performer.completion >= 80))
    .filter((performer) => (performer.lifetime == null || performer.lifetime >= 80));

  filtered.sort((a, b) => {
    const completionDelta = (b.completion || 0) - (a.completion || 0);
    if (completionDelta) return completionDelta;
    const lifetimeDelta = (b.lifetime || 0) - (a.lifetime || 0);
    if (lifetimeDelta) return lifetimeDelta;
    const wordDelta = (a.words || 1000) - (b.words || 1000);
    if (wordDelta) return wordDelta;
    return a.price - b.price;
  });

  return filtered[0] || null;
}

async function openCandidate(page, candidate) {
  if (candidate.href) {
    await page.goto(candidate.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settle(page);
    return;
  }
  if (candidate.buySelector) {
    await page.click(candidate.buySelector);
    await settle(page);
    return;
  }
  throw new Error(`Candidate has no usable UI target: ${candidate.domain}`);
}

async function choosePerformerIfNeeded(page) {
  const state = await getState(page);
  if (/Available performers|performers for your task/i.test(state.text)) {
    const performers = await extractPerformers(page);
    const selected = choosePerformer(performers);
    if (!selected) {
      return { skipped: 'No performer with in-range Content placement price and dofollow support.' };
    }
    if (selected.selector) {
      await page.click(selected.selector);
      await settle(page);
    } else {
      await page.goto(selected.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await settle(page);
    }
    return { selected };
  }
  return { selected: null };
}

function publisherRequirementsConflict(text) {
  const compact = String(text || '')
    .replace(/Get more protection by adding Two-Factor Authentication \(2FA\) via Google Authenticator/gi, ' ')
    .replace(/\s+/g, ' ');
  const topicPattern = /(ai|artificial intelligence|video|video generation|software|technology|saas|automation|digital tool)/i;
  const restrictionPattern =
    /(not\s+allowed|not\s+accepted|forbidden|prohibited|do\s+not\s+accept|restricted|\bno\s+(?:ai|artificial intelligence|video|video generation|software|technology|saas|automation|digital tool)\b)/i;
  const negativeSentence = compact
    .split(/(?<=[.!?])\s+|;/)
    .find((sentence) =>
      topicPattern.test(sentence) &&
      restrictionPattern.test(sentence),
    );
  if (negativeSentence) return negativeSentence.trim();
  if (/(AI|Artificial Intelligence|Software|Technology|Video)\s+Not\s+Allowed/i.test(compact)) {
    return 'AI/software/video topics are not allowed';
  }
  return null;
}

async function advancePublisherRequirementsIfNeeded(page) {
  let state = await getState(page);
  if (!/Platform special requirements|Media partner'?s special requirements|I have read and agree/i.test(state.text)) {
    return { advanced: false };
  }

  const conflict = publisherRequirementsConflict(state.text);
  if (conflict) {
    return { skipped: `publisher requirements conflict: ${conflict}` };
  }

  const checkboxSelector = '#requirements_agree';
  const checkbox = await page.$(checkboxSelector);
  if (checkbox) {
    await checkbox.dispose();
    const checked = await page.$eval(checkboxSelector, (input) => input.checked).catch(() => true);
    if (!checked) {
      await page.click(checkboxSelector);
      await settle(page, 300);
    }
  }

  const next = await findClickableByText(page, ['Next'], 'button,a,input[type="submit"]');
  if (!next) {
    return { skipped: 'publisher requirements page did not expose a Next button' };
  }
  await clickAndWait(page, next);
  await settle(page);

  state = await getState(page);
  if (/Platform special requirements|I have read and agree/i.test(state.text) && !/URL\*|Anchor text\*|Content \*/i.test(state.text)) {
    return { skipped: 'publisher requirements page did not advance to the task form' };
  }

  return { advanced: true };
}

function extractRequiredWords(text) {
  const compact = String(text || '').replace(/\s+/g, ' ');
  const explicit =
    compact.match(/(?:Content\s+size|Article\s+size|Minimum\s+word(?:s)?|Words)[^0-9]{0,40}([0-9]{3,5})\s*words?/i) ||
    compact.match(/([0-9]{3,5})\s*words?\s*(?:minimum|required|min)/i);
  const value = explicit ? Number(explicit[1]) : 1000;
  return Number.isFinite(value) ? Math.max(value, 1000) : 1000;
}

function buildArticleHtml(requiredWords) {
  const paragraphs = [
    'AI video generation has moved from a novelty into a practical part of the creative production stack. Marketing teams, founders, educators, and independent creators are using text prompts, source images, and short direction notes to create clips that would previously have required a camera crew or a long editing cycle. The change is not only about speed. It is also about making visual iteration easier before a concept becomes expensive. Teams can test a scene, refine pacing, adjust the mood, and decide whether an idea deserves a larger production budget.',
    'This shift matters because short-form video has become a default communication format. Product launches, social campaigns, tutorials, explainers, internal announcements, and landing page assets all benefit from motion. At the same time, many teams do not have constant access to video specialists. AI generation tools give those teams a way to prototype movement and storyboards without waiting for a full production schedule. The best results still require judgment, but the first draft is much easier to reach.',
    `For creators comparing modern options, <a href="${CONFIG.promotedUrl}">${CONFIG.anchorText}</a> is relevant because it reflects the growing demand for fast, controllable video generation. A good tool in this category should help users move from a written idea to a usable visual sequence while preserving enough control over style, motion, subject, and framing. It should also make revisions straightforward, since most creative work improves through iteration rather than a single perfect prompt.`,
    'A useful AI video workflow usually begins with a clear purpose. A founder may need a product teaser that communicates one benefit in a few seconds. A social media manager may need several variations of a visual hook. A teacher may want a simple animated scene that makes an abstract concept easier to understand. In each case, the prompt should define the subject, action, environment, camera behavior, and tone. Specific direction gives the model more structure and gives the user a better basis for evaluating the output.',
    'Image-to-video workflows are especially valuable when visual consistency matters. A brand may already have product shots, interface mockups, mascot art, or campaign photography. Turning those still assets into controlled video can extend the life of existing creative work. It also reduces the risk of generating a scene that feels disconnected from the brand. When the starting image is strong, the video model can focus more on movement, transitions, and atmosphere instead of inventing the entire frame from scratch.',
    'Text-to-video workflows are better suited for early exploration. They allow teams to test ideas before design assets are ready. A marketer can compare several scene directions, an educator can explore metaphors for a lesson, and a creator can experiment with visual styles before committing to a final look. This type of exploration can be messy, but that is part of its value. The goal is to discover which direction has energy, not to replace the final creative decision.',
    'Quality control remains important. AI video can look impressive at a glance while still containing awkward motion, inconsistent objects, strange hands, unstable text, or unclear transitions. A professional workflow should include review criteria: whether the subject remains recognizable, whether the motion supports the message, whether the clip fits the intended platform, and whether any visual artifacts could distract viewers. Short videos are judged quickly, so small flaws can weaken the impact.',
    'Another practical factor is prompt management. Teams that use AI video repeatedly benefit from saving prompts, version notes, successful style descriptions, and negative instructions. This turns creative experimentation into a repeatable process. Instead of starting from scratch every time, a team can build a library of approaches that match its brand voice and production needs. Over time, that library can make each new campaign faster and more consistent.',
    'AI video generation also encourages more thoughtful collaboration. Designers, marketers, writers, and product teams can react to visual drafts earlier in the process. A short generated clip can clarify whether everyone imagines the same scene. It can also reveal where the message is too complicated, where the visual metaphor is weak, or where a product feature needs a simpler explanation. Used well, the technology improves alignment before teams spend money on final production.',
    'The future of this category will likely depend on control and reliability. Users want more than surprising clips. They need repeatable outputs, better character and product consistency, clearer camera controls, higher resolution, and export settings that fit real publishing channels. As the tools mature, AI video will become less about isolated experiments and more about everyday creative operations.',
  ];

  const filler = [
    'The most successful teams treat generated video as a flexible draft rather than a shortcut around planning. Clear goals, concise prompts, and careful review help the output serve the message instead of becoming a visual distraction.',
    'For smaller teams, the advantage is access. They can test motion-driven ideas, prepare campaign variations, and communicate concepts visually without making every experiment depend on a large production budget.',
  ];

  const html = [
    `<h1>How AI Video Generation Supports Modern Creative Workflows</h1>`,
    ...paragraphs.map((p) => `<p>${p}</p>`),
  ];
  let index = 0;
  while (wordCountFromHtml(html.join('\n')) < requiredWords) {
    html.push(`<p>${filler[index % filler.length]}</p>`);
    index += 1;
  }
  return html.join('\n');
}

async function selectorForField(page, alternatives, options = {}) {
  return page.evaluate(
    ({ wanted, textareaOnly, inputOnly, excluded }) => {
      const cssPath = (el) => {
        if (el.id) return `#${CSS.escape(el.id)}`;
        if (el.name) return `${el.localName}[name="${String(el.name).replace(/"/g, '\\"')}"]`;
        const parts = [];
        let node = el;
        while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.body) {
          const tag = node.localName;
          const siblings = Array.from(node.parentElement?.children || []).filter(
            (sibling) => sibling.localName === tag,
          );
          const index = siblings.indexOf(node) + 1;
          parts.unshift(`${tag}:nth-of-type(${index})`);
          node = node.parentElement;
        }
        return parts.length ? `body > ${parts.join(' > ')}` : null;
      };
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const labelFor = (el) => {
        const explicit = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
        const parentLabel = el.closest('label');
        const wrapper = el.closest('.form-group,.field,.control-group,.row,.input-group,div');
        return [
          explicit?.innerText,
          parentLabel?.innerText,
          wrapper?.innerText,
          el.getAttribute('aria-label'),
          el.getAttribute('placeholder'),
          el.name,
          el.id,
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .toLowerCase();
      };
      const nodes = Array.from(document.querySelectorAll('input,textarea')).filter((el) => {
        if (!visible(el) || el.disabled || el.readOnly) return false;
        if (el.localName === 'input' && ['hidden', 'checkbox', 'radio', 'submit', 'button', 'file'].includes(el.type)) {
          return false;
        }
        if (textareaOnly && el.localName !== 'textarea') return false;
        if (inputOnly && el.localName !== 'input') return false;
        return true;
      });
      const match = nodes.find((el) => {
        const haystack = labelFor(el);
        if (excluded.some((term) => haystack.includes(term))) return false;
        return wanted.some((term) => haystack.includes(term.toLowerCase()));
      });
      return match ? cssPath(match) : null;
    },
    {
      wanted: alternatives,
      textareaOnly: Boolean(options.textareaOnly),
      inputOnly: Boolean(options.inputOnly),
      excluded: Array.isArray(options.exclude) ? options.exclude.map((term) => String(term).toLowerCase()) : [],
    },
  );
}

async function fillField(page, alternatives, value, options = {}) {
  const selector = await selectorForField(page, alternatives, options);
  if (!selector) {
    if (options.required) {
      const dump = await dumpDomSnapshot(page, `field-missing-${alternatives.join('-')}`);
      throw new Error(`Could not find required field: ${alternatives.join(' / ')}; DOM dump: ${dump}`);
    }
    return false;
  }
  await fillSelector(page, selector, value);
  return true;
}

async function fillFirstVisibleSelector(page, selectors, value) {
  for (const selector of selectors) {
    const handle = await page.$(selector);
    if (!handle) continue;
    await handle.dispose();
    const filled = await fillSelector(page, selector, value)
      .then(() => true)
      .catch(() => false);
    if (filled) return true;
  }
  return false;
}

async function selectProjectOption(page) {
  const selectedProject = await page.evaluate((projectName) => {
    const cssPath = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      if (el.name) return `${el.localName}[name="${String(el.name).replace(/"/g, '\\"')}"]`;
      return null;
    };
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const select = document.querySelector('select[name="Invite[invite_project_id]"], #invite-invite_project_id');
    const option = select
      ? Array.from(select.options).find((item) => normalize(item.textContent) === normalize(projectName))
      : null;
    return select && option ? { selector: cssPath(select), value: option.value } : null;
  }, CONFIG.projectName);

  if (selectedProject?.selector) {
    await page.select(selectedProject.selector, selectedProject.value);
    await page.$eval(selectedProject.selector, (select) => {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle(page, 500);
    const selectedText = await page.$eval(selectedProject.selector, (select) =>
      Array.from(select.selectedOptions)
        .map((option) => option.textContent.trim())
        .join(' '),
    );
    if (new RegExp(CONFIG.projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(selectedText)) {
      return true;
    }
  }

  return false;
}

async function createProject(page) {
  const addProject = await findClickableByText(page, ['Add project'], 'button,a');
  if (!addProject) {
    const dump = await dumpDomSnapshot(page, 'project-add-button-missing');
    throw new Error(`Could not find Add project button; DOM dump: ${dump}`);
  }
  await addProject.click();
  await settle(page, 600);
  await page.waitForSelector('#projectaddeditform-name', { visible: true, timeout: 10000 });
  await fillSelector(page, '#projectaddeditform-name', CONFIG.projectName);
  await fillSelector(
    page,
    '#projectaddeditform-description',
    `Project for ${CONFIG.promotedUrl}`,
  );

  const submitHandle = await page.evaluateHandle(() => {
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const modal = document.querySelector('#modal_project_add_edit');
    const form = document.querySelector('#project_add_edit_form');
    if (!modal || !form || !visible(modal)) return null;
    return (
      Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]')).find((button) => {
        const text = String(button.innerText || button.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return visible(button) && !button.disabled && /add project|edit project|save|project/.test(text);
      }) || null
    );
  });
  const submit = submitHandle.asElement();
  if (!submit) {
    await submitHandle.dispose();
    const dump = await dumpDomSnapshot(page, 'project-submit-missing');
    throw new Error(`Could not find project submit button; DOM dump: ${dump}`);
  }
  await submit.click();
  await settle(page, 1200);
  await submitHandle.dispose();

  const created = await page.waitForFunction(
    (projectName) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const select = document.querySelector('select[name="Invite[invite_project_id]"], #invite-invite_project_id');
      return Boolean(select && Array.from(select.options).some((option) => normalize(option.textContent) === normalize(projectName)));
    },
    { timeout: 15000 },
    CONFIG.projectName,
  ).then(() => true, () => false);

  if (!created) {
    const dump = await dumpDomSnapshot(page, 'project-create-failed');
    throw new Error(`Project "${CONFIG.projectName}" was not added to the project selector; DOM dump: ${dump}`);
  }
}

async function chooseProject(page) {
  if (await selectProjectOption(page)) return true;
  await createProject(page);
  if (await selectProjectOption(page)) return true;
  const dump = await dumpDomSnapshot(page, 'project-select-failed');
  throw new Error(`Could not select project "${CONFIG.projectName}"; DOM dump: ${dump}`);
}

async function setArticleContent(page, html) {
  await page.waitForSelector('#invite-invite_article_ifr', { visible: true, timeout: 10000 }).catch(() => {});
  const result = await page.evaluate((articleHtml) => {
    const fire = (el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
    };
    const visible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const saveBackingTextarea = () => {
      const textarea = document.querySelector('#invite-invite_article, textarea[name="Invite[invite_article]"]');
      if (textarea) {
        textarea.value = articleHtml;
        fire(textarea);
      }
    };

    const articleFrame = document.querySelector('#invite-invite_article_ifr');
    const articleBody = articleFrame?.contentDocument?.body;
    if (articleBody) {
      articleBody.innerHTML = articleHtml;
      articleBody.dispatchEvent(new Event('input', { bubbles: true }));
      articleBody.dispatchEvent(new Event('change', { bubbles: true }));
      articleBody.dispatchEvent(new Event('blur', { bubbles: true }));
      articleBody.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
      fire(articleBody);
      saveBackingTextarea();
      return { method: 'tinymce-iframe', text: articleBody.innerText };
    }

    const editable = Array.from(document.querySelectorAll('[contenteditable="true"]')).find((el) => {
      return visible(el);
    });
    if (editable) {
      editable.innerHTML = articleHtml;
      fire(editable);
      return { method: 'contenteditable', text: editable.innerText };
    }

    const textarea = Array.from(document.querySelectorAll('textarea')).find((el) => {
      const blob = `${el.name} ${el.id} ${el.closest('.form-group,.field,.control-group,div')?.innerText || ''}`.toLowerCase();
      return /content|article|text|body/.test(blob);
    });
    if (textarea) {
      textarea.value = articleHtml;
      fire(textarea);
      return { method: 'textarea', text: textarea.value.replace(/<[^>]*>/g, ' ') };
    }

    return { method: null, text: '' };
  }, html);

  if (!result.method) {
    throw new Error('Could not find TinyMCE/content editor for article content.');
  }
  await settle(page, 600);
  const verification = await page.evaluate(() => {
    const wordCount = (value) =>
      String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .split(/\s+/)
        .filter(Boolean).length;
    const frameHtml = document.querySelector('#invite-invite_article_ifr')?.contentDocument?.body?.innerHTML || '';
    const frameText = document.querySelector('#invite-invite_article_ifr')?.contentDocument?.body?.innerText || '';
    const textareaValue = document.querySelector('#invite-invite_article, textarea[name="Invite[invite_article]"]')?.value || '';
    const visibleWordCounter = Array.from(document.querySelectorAll('.tox-statusbar, .tox-statusbar__wordcount, .tox-tinymce'))
      .map((el) => el.innerText || '')
      .join(' ');
    return {
      frameWords: wordCount(frameHtml || frameText),
      textareaWords: wordCount(textareaValue),
      frameTextStart: frameText.slice(0, 300),
      textareaLength: textareaValue.length,
      visibleWordCounter,
    };
  });
  if (verification.frameWords < 100 || verification.textareaWords < 100) {
    const dump = await dumpDomSnapshot(page, 'article-editor-not-filled');
    throw new Error(`Article editor did not retain content: ${JSON.stringify({ ...verification, dump })}`);
  }
  return result;
}

async function getEditorHtml(page) {
  return page.evaluate(() => {
    const articleFrame = document.querySelector('#invite-invite_article_ifr');
    const articleBody = articleFrame?.contentDocument?.body;
    if (articleBody?.innerHTML) {
      return articleBody.innerHTML;
    }
    const editable = Array.from(document.querySelectorAll('[contenteditable="true"]')).find((el) => el.innerText?.trim());
    if (editable) return editable.innerHTML;
    const textarea = Array.from(document.querySelectorAll('textarea')).find((el) => {
      const blob = `${el.name} ${el.id} ${el.closest('.form-group,.field,.control-group,div')?.innerText || ''}`.toLowerCase();
      return /content|article|text|body/.test(blob) && el.value;
    });
    return textarea?.value || '';
  });
}

function linkReview(html) {
  const normalizedTarget = normalizeUrl(CONFIG.promotedUrl);
  const anchorMatches = Array.from(
    String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis),
  ).map((match) => ({
    href: normalizeUrl(match[1]),
    text: match[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
  }));
  const exactMatches = anchorMatches.filter(
    (link) => link.href === normalizedTarget && link.text === CONFIG.anchorText,
  );
  return {
    totalLinks: anchorMatches.length,
    exactMatches: exactMatches.length,
    ok: anchorMatches.length === 1 && exactMatches.length === 1,
  };
}

async function fillLinkFields(page) {
  if (
    !(await fillFirstVisibleSelector(
      page,
      ['#invite-invite_url_1', 'input[name="Invite[invite_url_1]"]'],
      CONFIG.promotedUrl,
    ))
  ) {
    await fillField(page, ['promoted url', 'promoted link', 'target url', 'url', 'link to promote'], CONFIG.promotedUrl, {
      required: true,
      inputOnly: true,
      exclude: ['google doc', 'import', 'paste a link', 'content by pasting'],
    });
  }
  if (
    !(await fillFirstVisibleSelector(
      page,
      ['#invite-invite_anchor_1', 'input[name="Invite[invite_anchor_1]"]'],
      CONFIG.anchorText,
    ))
  ) {
    await fillField(page, ['anchor text', 'anchor'], CONFIG.anchorText, {
      required: true,
      inputOnly: true,
    });
  }
}

async function fillTaskForm(page, requiredWords) {
  const articleHtml = buildArticleHtml(requiredWords);
  await chooseProject(page);
  await fillField(page, ['article title', 'post title', 'title'], 'How AI Video Generation Supports Modern Creative Workflows', {
    required: false,
    inputOnly: true,
  });
  await setArticleContent(page, articleHtml);
  await sleep(1200);
  await fillLinkFields(page);
  await fillField(
    page,
    ['special requirements', 'special instructions', 'requirements', 'comments'],
    `Please publish the supplied article as provided. Keep the anchor text "${CONFIG.anchorText}" linked to ${CONFIG.promotedUrl}. Use a dofollow link if possible and avoid changing the anchor unless editorial policy requires it.`,
    { required: false, textareaOnly: true },
  );
  return articleHtml;
}

async function checkedPaidExtras(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('input[type="checkbox"]'))
      .filter((input) => input.checked)
      .map((input) => {
        const blob = [
          input.name,
          input.id,
          input.closest('label')?.innerText,
          input.closest('.form-group,.field,.control-group,div')?.innerText,
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        return blob;
      })
      .filter((text) => /special\s+topic|extra|additional|paid/i.test(text)),
  );
}

function parseBalance(text) {
  const compact = String(text || '').replace(/\s+/g, ' ');
  const matches = Array.from(
    compact.matchAll(/(?:Main\s+balance|Available\s+balance|Balance)\D{0,30}\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi),
  );
  return matches.length ? moneyToNumber(matches[0][1]) : null;
}

function parseDisplayedPrice(text, fallback) {
  const compact = String(text || '').replace(/\s+/g, ' ');
  const match =
    compact.match(/(?:Total\s+price|Task\s+price|Price|Content\s+placement)\D{0,80}\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ||
    compact.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  return match ? moneyToNumber(match[1]) : fallback;
}

async function readFormReview(page, candidate, selectedPerformer, requiredWords) {
  const state = await getState(page);
  const editorHtml = await getEditorHtml(page);
  const link = linkReview(editorHtml);
  const extras = await checkedPaidExtras(page);
  const formData = await page.evaluate(() => {
    const labelFor = (el) => {
      const explicit = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      const parentLabel = el.closest('label');
      const wrapper = el.closest('.form-group,.field,.control-group,.row,.input-group,div');
      return [
        explicit?.innerText,
        parentLabel?.innerText,
        wrapper?.innerText,
        el.getAttribute('aria-label'),
        el.getAttribute('placeholder'),
        el.name,
        el.id,
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();
    };
    const inputs = Array.from(document.querySelectorAll('input,textarea,select')).map((el) => ({
      tag: el.localName,
      name: el.name || '',
      id: el.id || '',
      label: labelFor(el),
      value:
        el.localName === 'select'
          ? Array.from(el.selectedOptions)
              .map((option) => option.textContent.trim())
              .join(' ')
          : el.value || '',
    }));
    const visibleProjectWidgets = Array.from(
      document.querySelectorAll('.select2-selection, .select2-choice, [role="combobox"]'),
    )
      .map((el) => `${el.innerText || ''} ${el.closest('.form-group,.field,.control-group,div')?.innerText || ''}`)
      .filter((text) => /project|campaign/i.test(text));
    return {
      inputs,
      projectEvidence: [
        ...inputs
          .filter((input) => input.tag === 'select' && /project|campaign/.test(input.label))
          .map((input) => input.value),
        ...visibleProjectWidgets,
      ],
      urlEvidence: inputs
        .filter((input) => input.tag === 'input' && /(promoted|target|url|link\s+to\s+promote)/.test(input.label))
        .map((input) => input.value),
      anchorEvidence: inputs
        .filter((input) => input.tag === 'input' && /anchor/.test(input.label))
        .map((input) => input.value),
    };
  });
  const price = parseDisplayedPrice(state.text, selectedPerformer?.price ?? candidate.price);
  const balance = parseBalance(state.text);
  const articleWords = wordCountFromHtml(editorHtml);
  const projectRegex = new RegExp(CONFIG.projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const dofollowEvidence = [state.text, candidate.text, selectedPerformer?.text].filter(Boolean).join(' ');
  return {
    domain: candidate.domain,
    price,
    priceInRange: price >= CONFIG.minPrice && price <= CONFIG.maxPrice,
    formEvidence: {
      projectEvidence: formData.projectEvidence,
      urlEvidence: formData.urlEvidence,
      anchorEvidence: formData.anchorEvidence,
    },
    projectOk: formData.projectEvidence.some((value) => projectRegex.test(value)),
    urlOk: formData.urlEvidence.some((value) => normalizeUrl(value).includes(normalizeUrl(CONFIG.promotedUrl))),
    anchorOk: formData.anchorEvidence.some((value) => value.includes(CONFIG.anchorText)),
    articleWords,
    requiredWords,
    wordCountOk: articleWords >= requiredWords,
    link,
    checkedPaidExtras: extras,
    extrasOk: extras.length === 0,
    dofollowOk: /\bdofollow\b/i.test(dofollowEvidence) && !/\bnofollow\s+only\b/i.test(dofollowEvidence),
    balance,
    balanceOk: balance == null ? true : balance >= price,
    url: state.url,
  };
}

function assertReviewPasses(review) {
  const failures = [];
  if (!review.priceInRange) failures.push(`price ${review.price} outside range`);
  if (!review.projectOk) failures.push('project mismatch');
  if (!review.urlOk) failures.push('promoted URL mismatch');
  if (!review.anchorOk) failures.push('anchor text mismatch');
  if (!review.wordCountOk) failures.push(`article has ${review.articleWords}, needs ${review.requiredWords}`);
  if (!review.link.ok) failures.push(`link review failed: ${JSON.stringify(review.link)}`);
  if (!review.extrasOk) failures.push(`paid extras checked: ${review.checkedPaidExtras.join(' | ')}`);
  if (!review.dofollowOk) failures.push('dofollow support not visible');
  if (!review.balanceOk) failures.push(`insufficient visible balance ${review.balance} for price ${review.price}`);
  if (failures.length) {
    throw new Error(`Pre-purchase review failed: ${failures.join('; ')}`);
  }
}

async function clickFinalPurchase(page) {
  const finalButtonHandle = await page.evaluateHandle(
    ({ promotedUrl, anchorText }) => {
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const labelMatches = (el) => {
        const label = normalize(el.innerText || el.value || el.getAttribute('aria-label')).toLowerCase();
        return ['apply task', 'buy post', 'buy'].some((wanted) => label === wanted || label.includes(wanted));
      };
      const formFor = (el) => el.closest('form') || (el.getAttribute('form') ? document.getElementById(el.getAttribute('form')) : null);
      const formContainsTask = (form) => {
        if (!form) return false;
        const values = Array.from(form.querySelectorAll('input,textarea,select,[contenteditable="true"]'))
          .map((field) => ('value' in field ? field.value : field.innerText))
          .join(' ');
        return values.includes(promotedUrl) && values.includes(anchorText);
      };
      const candidates = Array.from(document.querySelectorAll('button,input[type="submit"],a'))
        .filter((el) => isVisible(el) && !el.disabled && labelMatches(el))
        .filter((el) => formContainsTask(formFor(el)))
        .sort((a, b) => {
          const aSubmit = /submit/i.test(a.type || '') || a.tagName.toLowerCase() === 'button';
          const bSubmit = /submit/i.test(b.type || '') || b.tagName.toLowerCase() === 'button';
          return Number(bSubmit) - Number(aSubmit);
        });
      return candidates[0] || null;
    },
    { promotedUrl: CONFIG.promotedUrl, anchorText: CONFIG.anchorText },
  );
  const finalButton = finalButtonHandle.asElement();
  if (!finalButton) {
    await finalButtonHandle.dispose();
    throw new Error('Could not find a task-form Apply task / Buy Post / Buy button.');
  }
  await clickAndWait(page, finalButton);
}

function extractCompletion(text, url) {
  const id =
    String(url || '').match(/(?:task|order|id)[=/:-]?([0-9]{5,})/i)?.[1] ||
    String(text || '').match(/Task\s+ID\s+(?:is\s+)?([0-9]{5,})/i)?.[1] ||
    String(text || '').match(/\bID[:\s#]+([0-9]{5,})/i)?.[1] ||
    null;
  const status =
    String(text || '').match(/Task'?s\s+Acceptance/i)?.[0] ||
    String(text || '').match(/\bIn\s+Progress\b/i)?.[0] ||
    String(text || '').match(/\bTask\s+Review\b/i)?.[0] ||
    null;
  return { taskId: id, status };
}

async function processCandidate(page, candidate) {
  log(`Checking candidate ${candidate.domain}`, {
    price: candidate.price,
    dofollowSeen: candidate.dofollow,
    workedNaSeen: candidate.workedNa,
    geoPreferenceScore: candidate.geoPreferenceScore || 0,
    siteTypePreferenceScore: candidate.siteTypePreferenceScore || 0,
    preference: candidate.preference,
  });

  await openCandidate(page, candidate);
  let state = await getState(page);
  const earlyConflict = publisherRequirementsConflict(state.text);
  if (earlyConflict) {
    return { skipped: `${candidate.domain}: publisher requirements conflict: ${earlyConflict}` };
  }

  const performerChoice = await choosePerformerIfNeeded(page);
  if (performerChoice.skipped) {
    return { skipped: `${candidate.domain}: ${performerChoice.skipped}` };
  }

  const requirementsAdvance = await advancePublisherRequirementsIfNeeded(page);
  if (requirementsAdvance.skipped) {
    return { skipped: `${candidate.domain}: ${requirementsAdvance.skipped}` };
  }

  state = await getState(page);
  const conflict = publisherRequirementsConflict(state.text);
  if (conflict) {
    return { skipped: `${candidate.domain}: publisher requirements conflict: ${conflict}` };
  }

  const requiredWords = extractRequiredWords(state.text);
  await fillTaskForm(page, requiredWords);
  const review = await readFormReview(page, candidate, performerChoice.selected, requiredWords);
  try {
    assertReviewPasses(review);
  } catch (error) {
    const domDump = await dumpDomSnapshot(page, 'pre-purchase-review-failed');
    log('Pre-purchase review diagnostic.', {
      domDump,
      domain: review.domain,
      price: review.price,
      projectOk: review.projectOk,
      urlOk: review.urlOk,
      anchorOk: review.anchorOk,
      wordCountOk: review.wordCountOk,
      link: review.link,
      extrasOk: review.extrasOk,
      dofollowOk: review.dofollowOk,
      balanceOk: review.balanceOk,
      formEvidence: review.formEvidence,
    });
    throw error;
  }

  if (!BUY_MODE) {
    return {
      dryRun: true,
      review,
      note: 'Dry-run mode stopped before the financial click. Run without --dry-run to submit.',
    };
  }

  log('Pre-purchase review passed. Clicking the final UI purchase button.', {
    domain: review.domain,
    price: review.price,
    project: CONFIG.projectName,
    promotedUrl: CONFIG.promotedUrl,
    anchorText: CONFIG.anchorText,
    articleWords: review.articleWords,
    balance: review.balance,
  });

  await clickFinalPurchase(page);
  state = await getState(page);

  if (/Ready\s+for\s+Purchase/i.test(state.text) && /Checkout\s+Now|Buy/i.test(state.text)) {
    const followUpReview = await readFormReview(page, candidate, performerChoice.selected, requiredWords).catch(() => review);
    assertReviewPasses(followUpReview);
    const checkout = await findClickableByText(page, ['Buy', 'Checkout Now'], 'button,a,input[type="submit"]');
    if (checkout) {
      await clickAndWait(page, checkout);
      state = await getState(page);
    }
  }

  const completion = extractCompletion(state.text, state.url);
  if (
    !completion.taskId &&
    !/Task\s+has\s+been\s+successfully\s+sent|Task'?s\s+Acceptance|In\s+Progress|reserved balance|Task payment/i.test(
      state.text,
    )
  ) {
    const failureScreenshot = `${CONFIG.runtimeDir}/${CONFIG.projectSlug}-post-click-failure-${safeStamp()}.png`;
    await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => {});
    const domDump = await dumpDomSnapshot(page, 'post-click-failure');
    const failureContext = await page.evaluate(() => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      return {
        url: location.href,
        title: document.title,
        alerts: Array.from(
          document.querySelectorAll('.alert, .help-block, .error, .has-error, .invalid-feedback, .form-error'),
        )
          .filter(visible)
          .map((el) => normalize(el.innerText))
          .filter(Boolean)
          .slice(0, 20),
        buttons: Array.from(document.querySelectorAll('button,a,input[type="submit"]'))
          .filter(visible)
          .map((el) => normalize(el.innerText || el.value || el.getAttribute('aria-label')))
          .filter(Boolean)
          .slice(0, 40),
        textMatches: Array.from(
          normalize(document.body.innerText).matchAll(
            /.{0,120}(?:cannot|blank|required|error|failed|invalid|Buy Post|Apply task|Ready for Purchase|Checkout Now).{0,160}/gi,
          ),
        )
          .map((match) => match[0])
          .slice(0, 20),
      };
    });
    log('Post-click verification failed.', {
      screenshot: failureScreenshot,
      domDump,
      ...failureContext,
    });
    throw new Error('Purchase click completed, but task completion/reserved status was not visible.');
  }

  return {
    purchased: true,
    domain: candidate.domain,
    price: review.price,
    taskId: completion.taskId,
    status: completion.status,
    url: state.url,
  };
}

async function main() {
  log(
    BUY_MODE
      ? `${CONFIG.projectName} Adsy runner starting in BUY mode.`
      : `${CONFIG.projectName} Adsy runner starting in DRY-RUN mode.`,
  );

  const browser = await launchBrowser();
  try {
    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());
    page.setDefaultTimeout(20000);

    await gotoPlatform(page);
    const candidates = await collectCandidates(page, CANDIDATE_LIMIT);
    log('Candidate pool collected.', {
      count: candidates.length,
      domains: candidates.slice(0, 10).map((candidate) => `${candidate.domain} $${candidate.price}`),
      preferences: candidates.slice(0, 10).map(candidatePreferenceSummary),
    });

    if (!candidates.length) {
      throw new Error('No verified in-range candidate sites were found.');
    }

    const skipped = [];
    const purchased = [];

    for (const candidate of candidates) {
      const result = await processCandidate(page, candidate);
      if (result.skipped) {
        skipped.push(result.skipped);
        log('Skipped candidate.', result.skipped);
        await gotoPlatform(page);
        continue;
      }
      if (result.dryRun) {
        log('Dry-run review result.', result);
        return;
      }
      if (result.purchased) {
        purchased.push(result);
        if (purchased.length >= CONFIG.count) break;
        await gotoPlatform(page);
      }
    }

    if (purchased.length < CONFIG.count) {
      throw new Error(`Submitted ${purchased.length}/${CONFIG.count}; skipped: ${skipped.join(' || ')}`);
    }

    log(`Completed ${CONFIG.projectName} Adsy purchase run.`, { purchased, skipped });
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
