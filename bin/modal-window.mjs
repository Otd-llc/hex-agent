// One warm window on the Modal Dedicated Endpoint: the validation runs, then (only
// with --approved) the batch, back to back, then the call to scale it down.
//   MODAL_ALLOWED=1 MODAL_CREDIT_USD=130 MODAL_RESERVE_USD=5 node bin/modal-window.mjs --host=<endpoint host>
//     [--batch=3|5 --approved] [--concurrency=3]
// Needs an open up window (bin/modal-session.mjs start). Validation is minimal-bin x1 and
// three-storey x1; the batch is every brief in briefs, briefs-hard and briefs-wide x N, the
// three sets at once. Each suite refuses its runs on its own when the window nears the cap.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../src/env.mjs';
import { openUptimeLedger } from '../src/uptime.mjs';

loadEnv();
const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;
const host = flag('host');
const batch = flag('batch') ? Number(flag('batch')) : null;
const approved = args.includes('--approved');
const concurrency = Number(flag('concurrency') ?? 3);
const model = `modal-dedicated:${host}`;

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (!host) fail('usage: node bin/modal-window.mjs --host=<endpoint host> [--batch=3|5 --approved] [--concurrency=3]');
if (process.env.MODAL_ALLOWED !== '1') fail('MODAL_ALLOWED is not 1: Modal runs need the owner\'s OK');
if (batch != null && ![3, 5].includes(batch)) fail('--batch is 3 or 5');
if (batch != null && !approved) fail('a batch needs --approved (the owner\'s OK, given after the validation)');
const ledger = openUptimeLedger({ creditUsd: Number(process.env.MODAL_CREDIT_USD), reserveUsd: Number(process.env.MODAL_RESERVE_USD ?? 0) });
const up = ledger.open();
if (!up) fail('no up window: record it first with node bin/modal-session.mjs start --host=<h> --up-at=<when the owner started it>');
if (up.host !== host) fail(`the open window is for ${up.host}, not ${host}`);

// One suite as a child process; resolves to its summary path (null if it wrote none).
function suite(briefs, only, repeat) {
  return new Promise((done) => {
    const a = ['bin/suite.mjs', `--model=${model}`, '--purpose=eval', `--briefs=evals/${briefs}.json`, `--repeat=${repeat}`, `--concurrency=${concurrency}`, ...(only ? [`--only=${only}`] : [])];
    const child = spawn(process.execPath, a, { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(`[${briefs}] ${d}`);
    });
    child.on('close', () => done(out.match(/summary (\S+summary\.json)/)?.[1] ?? null));
  });
}

// A run reached the model and the page when its trace has model turns and no model error.
function healthy(summaryPath) {
  if (!summaryPath) return { ok: false, why: 'no summary written' };
  const dir = summaryPath.replace(/[\\/]summary\.json$/, '');
  const s = JSON.parse(readFileSync(summaryPath, 'utf8'));
  for (const r of s.rows) {
    if (r.error) return { ok: false, why: `${r.id}: ${r.error}` };
    const t = JSON.parse(readFileSync(join(dir, r.trace), 'utf8'));
    const err = t.events.find((e) => e.type === 'model_error');
    if (err) return { ok: false, why: `${r.id}: ${err.message}` };
    if (!t.events.some((e) => e.type === 'model')) return { ok: false, why: `${r.id}: no model turn` };
  }
  return { ok: true, rows: s.rows.map((r) => `${r.id} ${r.pass ? 'PASS' : 'FAIL'} ${r.seconds}s`) };
}

const report = { host, startedAt: new Date().toISOString(), windowBefore: ledger.summary(), validation: [], batch: [] };
const t0 = Date.now();
const val = await Promise.all([suite('briefs-wide', 'minimal-bin', 1), suite('briefs-hard', 'three-storey', 1)]);
report.validation = val;
const checks = val.map(healthy);
console.log('\nvalidation:', JSON.stringify(checks));
const ok = checks.every((c) => c.ok);
if (ok && batch != null) {
  report.batch = await Promise.all(['briefs', 'briefs-hard', 'briefs-wide'].map((b) => suite(b, null, batch)));
}
report.seconds = Math.round((Date.now() - t0) / 1000);
report.windowAfter = ledger.summary();
const out = `runs/modal-window-${report.startedAt.replace(/[:.]/g, '-')}.json`;
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(`\n${ok ? 'validation passed' : 'VALIDATION FAILED: no batch'}${ok && batch == null ? ' (no batch asked for)' : ''}; ${report.seconds} s; window ${JSON.stringify(report.windowAfter)}`);
const dirs = [...report.validation, ...report.batch].filter(Boolean).join(' ');
if (dirs) console.log(`tally: node bin/tally.mjs ${dirs}`);
console.log(`report: ${out}`);
console.log('\n>>> DONE ON THE ENDPOINT: tell lane 1 (zzz-2e) to have the owner scale it down / stop it now, then record it: node bin/modal-session.mjs stop --down-at=<when it went down>');
