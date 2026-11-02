#!/usr/bin/env node
// Replay a recorded run on the live configurator, for filming at no model cost. It walks
// the trace's events in time order (accelerated): the overlay shows the model's own
// messages and tool calls, the configurator's rulings and the checks, as in the live run;
// only what the configurator accepted is re-applied (and the undos); the model's own look
// stills appear where it took them. The header says REPLAY, never live. No model is called.
// It ends with the run's verdict lines and checks that the build matches the original:
// parts list, families, and the staging (props and soil) that show a planter's purpose.
//   node bin/replay.mjs runs/<suite>/<run>/trace.json [--speed=4] [--max-gap-ms=2500]
//     [--headless] [--shot=final.png] [--clean-shot=clean.png --view=az,polar,fit] [--hold-ms=8000]
// src/overlay.mjs is read, never edited here: the live agent loads it (demo pre-flight).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openHex, dismissCookies } from '../src/bridge.mjs';
import { installOverlay, pushLines, linesFor } from '../src/overlay.mjs';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}`));
  if (!a) return dflt;
  const [, v] = a.split('=');
  return v ?? true;
};
const path = args.find((a) => !a.startsWith('--'));
if (!path) {
  console.error('usage: node bin/replay.mjs <trace.json> [--speed=4] [--headless] [--shot=png] [--clean-shot=png --view=az,polar,fit]');
  process.exit(2);
}
const trace = JSON.parse(readFileSync(path, 'utf8'));
if (!trace.events || !trace.verdict) {
  console.error('not a complete trace');
  process.exit(2);
}
const runDir = dirname(path);
const speed = Number(flag('speed', 4));
const maxGap = Number(flag('max-gap-ms', 2500));
const label = `REPLAY of recorded run ${trace.runId} · ${trace.provider} · ${trace.model} · effort ${trace.effort ?? 'default'} · no model is running`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The model's still N, as a data URL for the overlay (still events carry no index: count them).
const stillUrl = (n) => {
  const p = join(runDir, `still-${n}.png`);
  return existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null;
};

async function showStill(page, src, caption, t) {
  await page.evaluate(({ src, caption, t }) => {
    const ol = document.querySelector('#hexagent ol');
    if (!ol) return;
    const li = document.createElement('li');
    li.className = 'model';
    const ts = document.createElement('span');
    ts.className = 't';
    ts.textContent = `${t.toFixed(0).padStart(3, ' ')}s`;
    const img = document.createElement('img');
    img.src = src;
    img.setAttribute('style', 'display:block;width:100%;margin-top:4px;border:1px solid rgba(122,162,247,.6)');
    li.append(ts, document.createTextNode(caption), img);
    ol.appendChild(li);
    ol.scrollTop = ol.scrollHeight;
  }, { src, caption, t });
}

const hex = await openHex({ headless: !!flag('headless', false) });
try {
  await dismissCookies(hex.page);
  await installOverlay(hex.page, { brief: trace.brief, provider: trace.provider, model: trace.model });
  // The overlay's header says "live"; a replay says what it is.
  await hex.page.evaluate((text) => { const k = document.querySelector('#hexagent header .k'); if (k) k.textContent = text; }, label);
  console.log(label);

  let prev = trace.events[0]?.t ?? 0;
  let stills = 0, applied = 0, diverged = 0;
  for (const e of trace.events) {
    const t = e.t ?? prev;
    await sleep(Math.min(maxGap, Math.max(120, (t - prev) / speed)));
    prev = t;
    await pushLines(hex.page, linesFor(e), t / 1000);
    if (e.type === 'apply' && !e.rolledBack) {
      const ops = e.ops.filter((_, i) => e.outcomes[i]?.ok);
      if (ops.length) {
        const r = await hex.call('applyAll', ops);
        const bad = r.outcomes.filter((o) => !o.ok);
        applied++;
        if (bad.length) diverged++;
        console.log(`  ${(t / 1000).toFixed(0)}s ${ops.map((o) => o.op).join(', ')}${bad.length ? `  DIVERGED: ${bad.map((o) => o.code).join(', ')}` : ''}`);
        await hex.call('settle');
      }
    }
    if (e.type === 'tool' && e.name === 'undo' && e.result?.undone) {
      await hex.call('undo');
      await hex.call('settle');
      console.log(`  ${(t / 1000).toFixed(0)}s undo`);
    }
    if (e.type === 'still') {
      const src = stillUrl(stills);
      if (src) await showStill(hex.page, src, `the model looks (az ${e.az}, polar ${e.polar})`, t / 1000);
      stills++;
    }
  }

  // The run's own verdict, as the live run showed it at the end.
  const c = trace.verdict.checks ?? {};
  await pushLines(hex.page, [
    ...Object.entries(c).map(([k, v]) => ({ layer: 'code', text: `${k}: ${v}` })),
    { layer: 'code', text: trace.verdict.success ? 'VERIFIED' : 'NOT VERIFIED' },
  ], (trace.elapsedMs ?? prev) / 1000);

  const bom = await hex.call('bom');
  const state = await hex.call('getState');
  const fam = {};
  for (const n of state.nodes) fam[n.family] = (fam[n.family] ?? 0) + 1;
  const sameBom = JSON.stringify(bom.lines) === JSON.stringify(trace.verdict.bom.lines);
  const sameFam = JSON.stringify(Object.entries(fam).sort()) === JSON.stringify(Object.entries(trace.verdict.families).sort());
  const propIds = (s) => (s?.props ?? []).map((p) => p.id).sort().join(',');
  const want = trace.finalStaging ?? { props: [], soil: [] };
  const sameStaging = propIds(state.staging) === propIds(want) && (state.staging?.soil ?? []).length === (want.soil ?? []).length;
  console.log(`\n${applied} steps, ${diverged} diverged, ${stills} model stills`);
  console.log(`matches original: parts list ${sameBom ? 'yes' : 'NO'}, families ${sameFam ? 'yes' : 'NO'}, staging ${sameStaging ? 'yes' : 'NO'} (${state.nodes.length} parts, ${(state.staging?.props ?? []).length} props, ${(state.staging?.soil ?? []).length} soil)`);

  if (flag('shot', null)) await hex.page.screenshot({ path: flag('shot') });
  // The final frame without the overlay, at a fixed view, for the film.
  if (flag('clean-shot', null)) {
    const [az, polar, fit] = String(flag('view', '')).split(',').map((x) => (x === '' ? undefined : Number(x)));
    await hex.page.evaluate(() => { const o = document.getElementById('hexagent'); if (o) o.style.display = 'none'; });
    if (az != null || polar != null || fit != null) await hex.call('view', Object.fromEntries(Object.entries({ az, polar, fit }).filter(([, v]) => v != null && !Number.isNaN(v))));
    await hex.call('settle');
    await sleep(800);
    await hex.page.screenshot({ path: flag('clean-shot') });
    await hex.page.evaluate(() => { const o = document.getElementById('hexagent'); if (o) o.style.display = ''; });
  }
  if (!flag('headless', false)) await sleep(Number(flag('hold-ms', 8000)));
  process.exitCode = sameBom && sameFam && sameStaging ? 0 : 1;
} finally {
  await hex.close();
}
