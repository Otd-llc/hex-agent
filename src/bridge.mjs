// Browser bridge: drives the real Hex configurator tab through the
// documented window.hexAPI only. The model never reaches this file directly;
// the tool layer calls these methods with validated arguments.
import { chromium } from 'playwright-core';

export const HEX_ORIGIN = 'https://hex.onethousanddrones.com';

const READ = new Set(['getState', 'listParts', 'listProps', 'openSockets', 'validate', 'bom', 'toUrl', 'settle']);
const WRITE = new Set(['apply', 'applyAll', 'load', 'undo', 'redo']);

export async function openHex({ url = HEX_ORIGIN + '/', headless = true, timeoutMs = 90_000 } = {}) {
  // System Chrome: WebGL works and no Playwright browser download is needed.
  const browser = await chromium.launch({ headless, channel: process.env.HEX_BROWSER_CHANNEL || 'chrome' });
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
    close: () => browser.close(),
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
