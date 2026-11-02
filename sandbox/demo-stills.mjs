// Stills of agent demo runs for the owner's pick: each run's own share link reloaded in a
// fresh configurator session, screenshotted in both themes. No model, nothing rebuilt by
// hand: what is on screen is what the run left.
//   node sandbox/demo-stills.mjs <suite dir> [out dir]
import { mkdirSync, readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openHex, dismissCookies } from '../src/bridge.mjs';

const suite = process.argv[2];
const OUT = process.argv[3] ?? 'docs/paper/sandbox/demo/stills';
if (!suite) throw new Error('usage: node sandbox/demo-stills.mjs <suite dir> [out dir]');
mkdirSync(OUT, { recursive: true });
const runs = readdirSync(suite, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const done = [];
for (const runId of runs) {
  const t = JSON.parse(readFileSync(join(suite, runId, 'trace.json'), 'utf8'));
  const url = t.verdict?.shareUrl;
  if (!url) { console.log(`${runId}: no share link`); continue; }
  if (existsSync(join(OUT, `${runId}-dark.png`))) { done.push(runId); continue; }
  const hex = await openHex({ url, headless: true });
  try {
    await dismissCookies(hex.page);
    await hex.call('settle');
    const n = (await hex.call('getState')).nodes.length;
    if (n !== t.verdict.nodes) console.log(`${runId}: reloaded ${n} parts, run had ${t.verdict.nodes}`);
    await hex.page.waitForTimeout(800);
    await hex.page.screenshot({ path: join(OUT, `${runId}-light.png`) });
    await hex.page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await hex.page.waitForTimeout(1200);
    await hex.page.screenshot({ path: join(OUT, `${runId}-dark.png`) });
    done.push(runId);
    console.log(`${runId} ${t.briefId} ok`);
  } catch (e) {
    console.log(`${runId}: ${e.message}`);
  } finally {
    await hex.close();
  }
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ suite, runs: done }, null, 1) + '\n');
