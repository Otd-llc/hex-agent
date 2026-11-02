// Steps of one warm window on the Modal Dedicated Endpoint (GPU seconds bill while it is up).
//   MODAL_DEDICATED_ALLOWED=1 node bin/modal-window.mjs --host=<x.modal.run> --step=warmup|validate|run [--segment=<name>]
// warmup    tiny requests until one answers 200 fast (the cold start); a 400/401/403/404
//           stops it at once (no amount of waiting fixes those).
// validate  warmup, then the fixed validation spec (minimal-bin + three-storey) checked; the
//           outcome is written to the ledger, and a later segment needs it passed.
// run       --segment=<name>: the segment the owner approved in this window
//           (bin/modal-session.mjs approve), run with exactly its spec.
// Every suite runs at effort low. Needs an up window for the same host. SIGINT / SIGTERM
// stop the suite and everything it started (the whole process tree on Windows) and write
// the report. A failed step exits non-zero. It never stops the endpoint: it says when to.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { loadEnv } from '../src/env.mjs';
import { modelFor } from '../src/session.mjs';
import { liveNote } from '../src/provenance.mjs';
import { dedicatedHost } from '../src/hosted.mjs';
import { freemem } from 'node:os';
import { validationChecks, validationPassed, warmup, isHarnessFailure, HARNESS_TRIP_LIMIT, memoryOk } from '../src/modal-checks.mjs';
import { VALIDATE_SPEC } from '../src/uptime.mjs';

loadEnv();
const args = process.argv.slice(2);
const flag = (name, dflt = null) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? dflt;
const fail = (msg, code = 1) => {
  console.error(msg);
  process.exit(code);
};
const step = flag('step');
if (!['warmup', 'validate', 'run'].includes(step)) fail('usage: node bin/modal-window.mjs --host=<x.modal.run> --step=warmup|validate|run [--segment=<approved name>]', 2);
let host;
try {
  host = dedicatedHost(`modal-dedicated:${flag('host') ?? ''}`);
} catch (e) {
  fail(e.message);
}
if (!host) fail('--host is required', 2);
const modelId = `modal-dedicated:${host}`;

// The segment and its spec: the validation's fixed one, or the approved one, read from the ledger.
const segment = step === 'run' ? flag('segment') : 'validate';
if (!segment) fail('--step=run needs --segment=<name> (approved in this window with bin/modal-session.mjs approve)', 2);
let model, ledger, spec;
try {
  // The same gates any run has; modelFor checks the window, host, validation and approval.
  ({ ledger } = modelFor({ modelId, purpose: 'eval', effort: 'low', segment: 'validate', spec: VALIDATE_SPEC }));
  spec = segment === 'validate' ? VALIDATE_SPEC : ledger.approval(segment)?.spec;
  if (!spec) throw new Error(`segment ${segment} is not approved in this window`);
  ({ model } = modelFor({ modelId, purpose: 'eval', effort: 'low', segment, spec }));
} catch (e) {
  fail(e.message);
}
if (!(ledger.headroom() > 0)) fail(`no headroom: ${JSON.stringify(ledger.summary())}`);

const report = { step, segment, spec, startedAt: new Date().toISOString(), windowBefore: ledger.summary(), note: liveNote() };
const reportPath = `runs/modal-window-${report.startedAt.replace(/[:.]/g, '-')}.json`;
const writeReport = () => {
  report.windowAfter = ledger.summary();
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
};
function endNote() {
  console.log(`window: ${JSON.stringify(ledger.summary())}`);
  console.log('>>> When the last segment is done: tell lane 1 (zzz-2e) to have the owner DELETE the endpoint and the proxy token, then: node bin/modal-session.mjs stop --down-at=<ISO+zone>; 30 min later reconcile from the usage page.');
}

let child = null;
// The suite and every browser under it: on Windows a signal does not reach a child's tree.
function killTree(sig) {
  if (!child) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
  } else child.kill(sig);
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    const had = !!child;
    killTree(sig);
    report.interrupted = sig;
    writeReport();
    console.error(`${sig}: stopped${had ? ' the suite and its browsers' : ''}; report ${reportPath}. The endpoint is still up and billing.`);
    endNote();
    process.exit(130);
  });
}

// The window's own watchdog: a suite that outlives its spec's minutes (or 3 h) by 20 min is killed
// with every browser under it, so a hang cannot keep the endpoint billing unattended.
const WATCHDOG_MS = ((spec?.maxMinutes ?? 180) + 20) * 60_000;

// One suite as a child process, at the spec's effort, exactly the spec; resolves to its summary path.
function suite(s) {
  return new Promise((done) => {
    const a = ['bin/suite.mjs', `--model=${modelId}`, '--purpose=eval', `--effort=${s.effort}`, `--briefs=${s.sets.map((x) => `evals/${x}.json`).join(',')}`,
      `--repeat=${s.repeat}`, `--concurrency=${s.concurrency}`, ...(s.only ? [`--only=${s.only.join(',')}`] : []), ...(s.maxMinutes ? [`--max-minutes=${s.maxMinutes}`] : [])];
    child = spawn(process.execPath, a, { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MODAL_SEGMENT: segment, SUITE_PARENT_PID: String(process.pid) } });
    const dog = setTimeout(() => {
      report.watchdog = true;
      console.error(`watchdog: the suite ran past ${Math.round(WATCHDOG_MS / 60_000)} min; killing it and its browsers`);
      killTree('SIGTERM');
    }, WATCHDOG_MS);
    // Keep warm: browsers that hang make no model calls, and past the 15 min scaledown the
    // endpoint goes cold (a ~26 min cold start, 2026-11-02). A probe bills nothing extra while up.
    const warm = setInterval(() => model.probe().catch(() => {}), 4 * 60_000);
    // Harness trip: at HARNESS_TRIP_LIMIT browser/page failures the segment stops; they score nothing.
    let harness = 0;
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      process.stdout.write(d);
      for (const line of String(d).split('\n')) {
        if (!isHarnessFailure(line) || report.harnessTrip) continue;
        if (++harness >= HARNESS_TRIP_LIMIT) {
          report.harnessTrip = harness;
          console.error(`harness trip: ${harness} browser/page failures; killing the suite and its browsers (free memory ${memoryOk(freemem(), s.concurrency).freeGb} GB)`);
          killTree('SIGTERM');
        }
      }
    });
    child.on('close', (code) => {
      clearTimeout(dog);
      clearInterval(warm);
      child = null;
      report.suiteExit = code;
      done(out.match(/summary (\S+summary\.json)/)?.[1] ?? null);
    });
  });
}

const t0 = Date.now();
let ok = true;
// Every step warms up first: after a gap longer than the idle timeout the endpoint is cold again,
// and a cold start must not be scored as the model failing.
{
  report.warmup = await warmup(() => model.probe(), {
    maxMinutes: Number(flag('warmup-minutes', 30)), fastMs: Number(flag('fast-ms', 20000)), everyMs: 15000, headroom: () => ledger.headroom(),
    log: (p, n) => console.log(`warmup ${n}: ${p.status ?? p.error} in ${p.ms} ms${p.servedBy ? ` (${p.servedBy})` : ''}`),
  });
  if (!report.warmup.ok) console.log(`warm-up failed: ${report.warmup.why}`);
  ok = report.warmup.ok;
}
if (step === 'validate' && ok) {
  report.summary = await suite(VALIDATE_SPEC);
  report.checks = validationChecks(report.summary, report.note);
  for (const c of report.checks) console.log(`${c.ok ? 'ok  ' : c.gate === false ? 'miss' : 'FAIL'} ${c.check}${c.gate === false ? ' (reported, not gated)' : ''}${c.saw != null ? ` (saw ${c.saw})` : ''}`);
  ok = validationPassed(report.checks);
  console.log(ok ? 'VALIDATION PASSED' : 'VALIDATION FAILED: no segment until it is understood');
}
if (step === 'validate') ledger.recordValidation({ passed: ok, summary: report.summary ?? null });
if (step === 'run' && ok) {
  const mem = memoryOk(freemem(), spec.concurrency);
  report.memory = mem;
  if (!mem.ok) {
    console.log(`memory: ${mem.freeGb} GB free, ${mem.needGb} GB needed for ${spec.concurrency} browsers; not starting (free memory, or approve a lower concurrency)`);
    ok = false;
  }
}
if (step === 'run' && ok) {
  report.summary = await suite(spec);
  ok = report.summary != null && report.suiteExit === 0;
}
report.ok = ok;
report.seconds = Math.round((Date.now() - t0) / 1000);
writeReport();
if (report.summary) console.log(`tally: node bin/tally.mjs ${report.summary}`);
console.log(`report: ${reportPath} (gitignored: it is local only)`);
endNote();
process.exit(ok ? 0 : 1);
