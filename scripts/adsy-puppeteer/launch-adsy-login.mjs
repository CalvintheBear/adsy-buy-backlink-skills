import puppeteer from 'puppeteer-core';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const CODEX_HOME = process.env.CODEX_HOME || `${process.env.HOME || '.'}/.codex`;
const chromePath = process.env.ADSY_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = process.env.ADSY_CHROME_PROFILE || `${CODEX_HOME}/chrome-profiles/adsy-puppeteer`;
const startUrl = 'https://cp.adsy.com/marketer/platform?SiteSearch%5Bverified%5D=1';

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: false,
  defaultViewport: null,
  userDataDir,
  args: [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=ChromeWhatsNewUI'
  ]
});

const [page] = await browser.pages();
await page.goto(startUrl, { waitUntil: 'domcontentloaded' });

console.log('');
console.log('Adsy login window is open.');
console.log(`Profile: ${userDataDir}`);
console.log('Log in manually, then press Enter here to close this launcher.');
console.log('You can also leave the Chrome window open and stop this script later.');

const rl = readline.createInterface({ input, output });
await rl.question('');
rl.close();

await browser.close();
