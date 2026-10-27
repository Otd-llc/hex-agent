// Build sandbox configurations by hand through the public API, check them,
// screenshot them in both themes and write sandbox/out/<id>.json.
//   node sandbox/run.mjs <id> [<id> ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { builder, finish } from './lib.mjs';
import { dismissCookies } from '../src/bridge.mjs';
import { CONFIGS } from './configs.mjs';

mkdirSync('sandbox/out', { recursive: true });
for (const id of process.argv.slice(2)) {
  const c = CONFIGS.find((x) => x.id === id);
  if (!c) throw new Error(`no config ${id}`);
  const lines = [];
  const log = (s) => { lines.push(s); console.log(`[${id}] ${s}`); };
  const b = await builder({ log });
  const t0 = Date.now();
  try {
    await dismissCookies(b.hex.page);
    await c.build(b);
    const report = await finish(b, { name: c.title });
    report.id = id;
    report.title = c.title;
    report.pitch = c.pitch;
    report.buildSeconds = Math.round((Date.now() - t0) / 1000);
    report.log = lines;
    // Both themes, from the same page: the configurator has its own theme button.
    await b.hex.page.waitForTimeout(800);
    await b.hex.page.screenshot({ path: `sandbox/out/${id}-light.png` });
    await b.hex.page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await b.hex.page.waitForTimeout(1200);
    await b.hex.page.screenshot({ path: `sandbox/out/${id}-dark.png` });
    writeFileSync(`sandbox/out/${id}.json`, JSON.stringify(report, null, 2) + '\n');
    log(`DONE ${report.parts} parts, levels ${report.levels.join('/')}, rules ${report.rulesOk}, mesh ${JSON.stringify(report.meshClash)}, roundTrip ${report.roundTrip}, issues ${report.issues.join(' ')}`);
  } catch (e) {
    log(`ERROR ${e.stack ?? e}`);
  } finally {
    await b.close();
  }
}
