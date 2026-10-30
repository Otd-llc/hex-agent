// Browser bridge: drives the real Hex configurator tab through the
// documented window.hexAPI only. The model never reaches this file directly;
// the tool layer calls these methods with validated arguments.
import { chromium } from 'playwright-core';

export const HEX_ORIGIN = 'https://hex.onethousanddrones.com';
// The page to drive: HEX_URL (a local dev server, e.g. http://127.0.0.1:5310/hex.html) or the live site.
export const hexUrl = () => process.env.HEX_URL || HEX_ORIGIN + '/';

const READ = new Set(['getState', 'listParts', 'listProps', 'openSockets', 'validate', 'bom', 'toUrl', 'settle', 'measure', 'surfaces']);
const WRITE = new Set(['apply', 'applyAll', 'load', 'undo', 'redo']);

// A slow page load is retried once in a fresh browser before giving up.
export async function openHex(options = {}) {
  try {
    return await openOnce(options);
  } catch (e) {
    console.error(`configurator did not load (${String(e.message).split('\n')[0]}); retrying once`);
    return openOnce(options);
  }
}

async function openOnce({ url = hexUrl(), headless = true, timeoutMs = 90_000 } = {}) {
  // System Chrome: WebGL works and no Playwright browser download is needed.
  const browser = await chromium.launch({ headless, channel: process.env.HEX_BROWSER_CHANNEL || 'chrome' });
  try {
    const hex = await bind(browser, { url, timeoutMs });
    // close() ends the browser; fresh() opens another isolated session (its
    // own context: no shared storage) in the same browser, which is half the
    // memory of a second Chrome.
    return { ...hex, close: () => browser.close(), fresh: () => bind(browser, { url, timeoutMs }) };
  } catch (e) {
    await browser.close();
    throw e;
  }
}

async function bind(browser, { url, timeoutMs }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
  await page.waitForFunction(() => typeof window.__loadHexAPI === 'function', null, { timeout: timeoutMs });
  const version = await page.evaluate(async () => (await window.__loadHexAPI()).version);
  await call(page, 'settle');

  return {
    page,
    version,
    call: (method, ...args) => call(page, method, ...args),
    close: () => context.close(),
  };
}

async function call(page, method, ...args) {
  if (!READ.has(method) && !WRITE.has(method)) throw new Error(`not a documented hexAPI method: ${method}`);
  return page.evaluate(
    async ([m, a]) => {
      const api = window.hexAPI;
      if (!api) throw new Error('hexAPI not loaded');
      return await api[m](...a);
    },
    [method, args],
  );
}

export const isWrite = (method) => WRITE.has(method);

// Our own fresh session: decline optional cookies so the banner does not cover the scene.
export async function dismissCookies(page) {
  const reject = page.getByRole('button', { name: /reject all/i });
  if (await reject.isVisible().catch(() => false)) await reject.click().catch(() => {});
}
