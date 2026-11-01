// Browser bridge: drives the real Hex configurator tab through the
// documented window.hexAPI only. The model never reaches this file directly;
// the tool layer calls these methods with validated arguments.
import { chromium } from 'playwright-core';

export const HEX_ORIGIN = 'https://hex.onethousanddrones.com';
// The page to drive: HEX_URL (a local dev server, e.g. http://127.0.0.1:5310/hex.html) or the live site.
export const hexUrl = () => process.env.HEX_URL || HEX_ORIGIN + '/';

const READ = new Set(['getState', 'listParts', 'listProps', 'openSockets', 'validate', 'bom', 'toUrl', 'settle', 'measure', 'surfaces', 'suggestPlants', 'view', 'still']);
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
  // Which deployed build answered: its hashed entry script (/assets/hex-<hash>.js), so a run is tied to a site version.
  const build = await page.evaluate(() => [...document.scripts].map((s) => s.getAttribute('src')).find((s) => s && /assets[/].+[.]js$/.test(s)) ?? null);
  await call(page, 'settle');

  return {
    page,
    version,
    build,
    call: (method, ...args) => call(page, method, ...args),
    close: () => context.close(),
  };
}

// A page call that never answers (a settle that hangs) must not hold a run, and the GPU, forever.
export const CALL_TIMEOUT_MS = Number(process.env.HEX_CALL_TIMEOUT_MS ?? 90_000);
// A prop op can work for a long while and still be right (deploy 14): up to 20 s of BUSY waits,
// 30 s of compute and 30 s to drain it, and a refused one dry-runs its candidates for up to 20 s.
// So a call carrying prop ops gets that much more each, up to PROP_CALL_CAP_MS.
export const PROP_OP_MS = Number(process.env.HEX_PROP_OP_MS ?? 80_000);
export const PROP_CALL_CAP_MS = Number(process.env.HEX_PROP_CALL_CAP_MS ?? 600_000);
const PROP_OPS = new Set(['addProp', 'moveProp', 'plant', 'removeProp']);

export function callTimeoutMs(method, args) {
  if (method !== 'apply' && method !== 'applyAll') return CALL_TIMEOUT_MS;
  const ops = Array.isArray(args[0]) ? args[0] : [args[0]];
  const props = ops.filter((o) => PROP_OPS.has(o?.op)).length;
  return props ? Math.min(CALL_TIMEOUT_MS + props * PROP_OP_MS, Math.max(PROP_CALL_CAP_MS, CALL_TIMEOUT_MS)) : CALL_TIMEOUT_MS;
}

async function call(page, method, ...args) {
  if (!READ.has(method) && !WRITE.has(method)) throw new Error(`not a documented hexAPI method: ${method}`);
  return withTimeout(page.evaluate(
    async ([m, a]) => {
      const api = window.hexAPI;
      if (!api) throw new Error('hexAPI not loaded');
      return await api[m](...a);
    },
    [method, args],
  ), callTimeoutMs(method, args), `hexAPI ${method}`);
}

export function withTimeout(promise, ms, what) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${what} did not answer in ${Math.round(ms / 1000)} s`), { code: 'CALL_TIMEOUT' })), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

export const isWrite = (method) => WRITE.has(method);

// Our own fresh session: decline optional cookies so the banner does not cover the scene.
export async function dismissCookies(page) {
  const reject = page.getByRole('button', { name: /reject all/i });
  if (await reject.isVisible().catch(() => false)) await reject.click().catch(() => {});
}
