// Steps of one warm window on the Modal Dedicated Endpoint (GPU seconds bill while it is up).
//   MODAL_DEDICATED_ALLOWED=1 MODAL_CREDIT_USD=130 MODAL_RESERVE_USD=5 \
//   node bin/modal-window.mjs --host=<x.modal.run> --step=warmup|validate|run [options]
// warmup    tiny requests until one answers 200 fast (the cold start), nothing else.
// validate  warmup, then minimal-bin x1 + three-storey x1 in one queue, checked: each passed,
//           no model error left unrecovered, the host said what it served, the page build
//           matches lane 1's latest live note (and its viz commit), three-storey had a
//           refusal with a tryInstead.
// run       one pre-approved segment (--approved): --sets=briefs,briefs-hard,briefs-wide
//           [--only=ids] --repeat=N --concurrency=C [--max-minutes=M], one shared queue.
// Every suite runs at --effort=low (Baseten's setting for the same NVFP4 weights).
// Needs an up window for the same host (bin/modal-session.mjs start). SIGINT / SIGTERM
// stop the suite it started. It never stops the endpoint: it says when to.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { loadEnv } from '../src/env.mjs';
import { modelFor } from '../src/session.mjs';
import { liveNote } from '../src/provenance.mjs';
import { dedicatedHost } from '../src/hosted.mjs';
import { validationChecks, validationPassed } from '../src/modal-checks.mjs';

loadEnv();
const args = process.argv.slice(2);
const flag = (name, dflt = null) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? dflt;
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const step = flag('step');
if (!['warmup', 'validate', 'run'].includes(step)) fail('usage: node bin/modal-window.mjs --host=<x.modal.run> --step=warmup|validate|run [--approved --sets=... --repeat=N --concurrency=C --max-minutes=M]');
let host;
try {
  host = dedicatedHost(`modal-dedicated:${flag('host') ?? ''}`);
} catch (e) {
  fail(e.message);
}
if (!host) fail('--host is required');
const modelId = `modal-dedicated:${host}`;
// The same gates a run has (flag on the command line, credit, no account tokens, the window pinned to this host).
let model, ledger;
try {
  ({ model, ledger } = modelFor({ modelId, purpose: 'eval', effort: 'low' }));
} catch (e) {
  fail(e.message);
}
if (ledger.headroom('eval') <= 0) fail(`no headroom: ${JSON.stringify(ledger.summary())}`);
if (step === 'run' && !args.includes('--approved')) fail('--step=run needs --approved (the owner\'s OK for this segment)');

let child = null;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (child) child.kill(sig);
    console.error(`${sig}: stopped${child ? ' the suite' : ''}. The endpoint is still up and billing: see the last line.`);
    endNote();
    process.exit(130);
  });
}

function endNote() {
  console.log(`window: ${JSON.stringify(ledger.summary())}`);
  console.log('>>> When the last segment is done: tell lane 1 (zzz-2e) to have the owner DELETE the endpoint and the proxy token, then: node bin/modal-session.mjs stop --down-at=<ISO+zone>; 30 min later reconcile from the usage page.');
}

// Tiny requests until one is a fast 200. Each try is logged; the window bills either way.
async function warmup({ maxMinutes = Number(flag('warmup-minutes', 30)), fastMs = Number(flag('fast-ms', 20000)), everyMs = 15000 } = {}) {
  const until = Date.now() + maxMinutes * 60_000;
  const tries = [];
  while (Date.now() < until) {
    if (ledger.headroom('eval') <= 0) return { ok: false, tries, why: 'headroom gone during warm-up' };
    const p = await model.probe();
    tries.push(p);
    console.log(`warmup ${tries.length}: ${p.status ?? p.error} in ${p.ms} ms${p.servedBy ? ` (${p.servedBy})` : ''}`);
    if (p.ok && p.ms <= fastMs) return { ok: true, tries };
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return { ok: false, tries, why: `no fast 200 in ${maxMinutes} min` };
}

// One suite as a child process, at effort low; resolves to its summary path (null if none).
function suite({ sets, only = null, repeat = 1, concurrency = 1, maxMinutes = null }) {
  return new Promise((done) => {
    const a = ['bin/suite.mjs', `--model=${modelId}`, '--purpose=eval', '--effort=low', `--briefs=${sets.map((s) => `evals/${s}.json`).join(',')}`,
      `--repeat=${repeat}`, `--concurrency=${concurrency}`, ...(only ? [`--only=${only}`] : []), ...(maxMinutes ? [`--max-minutes=${maxMinutes}`] : [])];
    child = spawn(process.execPath, a, { stdio: ['ignore', 'pipe', 'inherit'], env: process.env });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.on('close', () => {
      child = null;
      done(out.match(/summary (\S+summary\.json)/)?.[1] ?? null);
    });
  });
}

const report = { step, startedAt: new Date().toISOString(), windowBefore: ledger.summary(), note: liveNote() };
const t0 = Date.now();
if (step === 'warmup' || step === 'validate') {
  report.warmup = await warmup();
  if (!report.warmup.ok) console.log(`warm-up failed: ${report.warmup.why}`);
}
if (step === 'validate' && report.warmup.ok) {
  report.summary = await suite({ sets: ['briefs-wide', 'briefs-hard'], only: 'minimal-bin,three-storey', repeat: 1, concurrency: 2 });
  report.checks = validationChecks(report.summary, report.note);
  for (const c of report.checks) console.log(`${c.ok ? 'ok  ' : c.gate === false ? 'miss' : 'FAIL'} ${c.check}${c.gate === false ? ' (reported, not gated)' : ''}${c.saw != null ? ` (saw ${c.saw})` : ''}`);
  report.ok = validationPassed(report.checks);
  console.log(report.ok ? 'VALIDATION PASSED' : 'VALIDATION FAILED: no segment until it is understood');
}
if (step === 'run') {
  const sets = String(flag('sets', 'briefs,briefs-hard,briefs-wide')).split(',');
  report.segment = { sets, only: flag('only'), repeat: Number(flag('repeat', 1)), concurrency: Number(flag('concurrency', 9)), maxMinutes: flag('max-minutes') ? Number(flag('max-minutes')) : null };
  report.summary = await suite(report.segment);
}
report.seconds = Math.round((Date.now() - t0) / 1000);
report.windowAfter = ledger.summary();
const out = `runs/modal-window-${report.startedAt.replace(/[:.]/g, '-')}.json`;
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
if (report.summary) console.log(`tally: node bin/tally.mjs ${report.summary}`);
console.log(`report: ${out} (gitignored: it is local only)`);
endNote();
