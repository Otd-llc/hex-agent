#!/usr/bin/env node
// Replay a recorded run on the live configurator, for filming retakes at no
// model cost. It re-applies only what the configurator accepted in the
// original run, in order (and the undos), with a label on screen naming the
// run, provider and model. No model is called. It ends by checking the build
// matches the original's parts list and families.
//   node bin/replay.mjs runs/<run-id>/trace.json [--step-ms=1200] [--headless]
import { readFileSync } from 'node:fs';
import { openHex, dismissCookies } from '../src/bridge.mjs';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}`));
  if (!a) return dflt;
  const [, v] = a.split('=');
  return v ?? true;
};
const path = args.find((a) => !a.startsWith('--'));
if (!path) {
  console.error('usage: node bin/replay.mjs <trace.json> [--step-ms=1200] [--headless]');
  process.exit(2);
}
const trace = JSON.parse(readFileSync(path, 'utf8'));
if (!trace.events || !trace.verdict) {
  console.error('not a complete trace');
  process.exit(2);
}
const stepMs = Number(flag('step-ms', 1200));
const label = `REPLAY of recorded run ${trace.runId} · ${trace.provider}/${trace.model} · no model is running`;

// Steps from the trace: accepted ops per apply (one batch, one undo step), and undos.
function stepsOf(events) {
  const steps = [];
  for (const e of events) {
    if (e.type === 'apply' && !e.rolledBack) {
      const ops = e.ops.filter((_, i) => e.outcomes[i]?.ok);
      if (ops.length) steps.push({ kind: 'apply', ops });
    }
    if (e.type === 'tool' && e.name === 'undo' && e.result?.undone) steps.push({ kind: 'undo' });
  }
  return steps;
}

const hex = await openHex({ headless: !!flag('headless', false) });
try {
  await dismissCookies(hex.page);
  await hex.page.evaluate((text) => {
    const el = document.createElement('div');
    el.textContent = text;
    el.setAttribute('style', 'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:8px 12px;' +
      'font:12px/1.4 ui-monospace,monospace;letter-spacing:.04em;background:#08090d;color:#faf7f0;border:1px solid #c8963e;pointer-events:none');
    document.body.appendChild(el);
  }, label);

  const steps = stepsOf(trace.events);
  console.log(`${label}\n${steps.length} steps`);
  for (const [i, s] of steps.entries()) {
    await new Promise((r) => setTimeout(r, stepMs));
    if (s.kind === 'undo') {
      await hex.call('undo');
      console.log(`  ${i + 1}. undo`);
    } else {
      const r = await hex.call('applyAll', s.ops);
      const bad = r.outcomes.filter((o) => !o.ok);
      console.log(`  ${i + 1}. ${s.ops.map((o) => o.op).join(', ')}${bad.length ? `  DIVERGED: ${bad.map((o) => o.code).join(', ')}` : ''}`);
    }
    await hex.call('settle');
  }

  const bom = await hex.call('bom');
  const state = await hex.call('getState');
  const fam = {};
  for (const n of state.nodes) fam[n.family] = (fam[n.family] ?? 0) + 1;
  const sameBom = JSON.stringify(bom.lines) === JSON.stringify(trace.verdict.bom.lines);
  const sameFam = JSON.stringify(Object.entries(fam).sort()) === JSON.stringify(Object.entries(trace.verdict.families).sort());
  console.log(`\nmatches original: parts list ${sameBom ? 'yes' : 'NO'}, families ${sameFam ? 'yes' : 'NO'} (${state.nodes.length} parts)`);
  if (flag('shot', null)) await hex.page.screenshot({ path: flag('shot') });
  if (!flag('headless', false)) await new Promise((r) => setTimeout(r, Number(flag('hold-ms', 8000))));
  process.exitCode = sameBom && sameFam ? 0 : 1;
} finally {
  await hex.close();
}
