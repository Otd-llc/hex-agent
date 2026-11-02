#!/usr/bin/env node
// Run the brief set and report every attempt.
//   node bin/suite.mjs --model=claude-opus-5-5 --purpose=dev [--repeat=1] [--only=id,id]
// A brief passes when the configurator's checks pass (rules, mesh, pack, round
// trip, agent finished), the code-side brief checks pass, and the model did
// not claim "met" for something code says is missing. Negative briefs expect
// an honest "unmet" rather than a claim that everything is met.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadEnv } from '../src/env.mjs';
import { modelFor, runSession } from '../src/session.mjs';
import { overclaimed, outcomeOf, strictPass, configuratorPass } from '../src/checks.mjs';
import { parseFeatures } from '../src/agent.mjs';
import { publicModelId } from '../src/hosted.mjs';
import { baselineOf, tripped } from '../src/tripwires.mjs';

loadEnv();
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}`));
  if (!a) return dflt;
  const [, v] = a.split('=');
  return v ?? true;
};
const purpose = flag('purpose', 'dev');
// No default model: a run names its model, so nothing reaches the Meta Model API by omission.
const modelId = flag('model', null);
if (typeof modelId !== 'string' || !modelId) {
  console.error('name the model: --model=<id>');
  process.exit(2);
}
const repeat = Number(flag('repeat', 1));
const strategy = flag('strategy', 'interactive');
const only = flag('only', null)?.split(',');
// A64 acceptance tests + A63 roles, A58 abstention: --features=acceptance,abstain, or none; absent: the defaults.
const features = parseFeatures(flag('features', null));
const featureList = Object.keys(features).filter((f) => features[f]);
// A brief's start: a build file (tools/catalog/builds/*.json, its state; props are left out) or a state object.
const startOf = (b) => {
  if (!b.start) return null;
  if (typeof b.start !== 'string') return b.start;
  const j = JSON.parse(readFileSync(b.start, 'utf8'));
  return j.state ?? j;
};
// --briefs takes one file or several (comma-separated): one queue over all of them.
const briefFiles = String(flag('briefs', 'evals/briefs.json')).split(',');
// The held-out set runs once, on the final agent (Fireworks plan F4/F5): never in a fix loop.
if (briefFiles.some((f) => /heldout/.test(f)) && flag('heldout-final', null) !== true) {
  console.error('evals/briefs-heldout.json runs only as the final held-out check: pass --heldout-final (docs/plans/2026-11-02-fireworks-plan.md F4)');
  process.exit(2);
}
const briefs = briefFiles.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')).map((b) => ({ ...b, set: f })))
  .filter((b) => !only || only.includes(b.id));
// --max-minutes: no run starts after this long (runs already going finish).
const maxMinutes = flag('max-minutes', null) == null ? null : Number(flag('max-minutes'));

const concurrency = Math.max(1, Number(flag('concurrency', 1)));
// The segment spec a Modal Dedicated run is checked against (the ledger's approval for MODAL_SEGMENT).
const spec = {
  sets: briefFiles.map((f) => f.replace(/^.*[\\/]/, '').replace(/[.]json$/, '')),
  only: only ?? null,
  repeat,
  concurrency,
  maxMinutes,
  effort: flag('effort', 'default'),
};
const { model, ledger } = modelFor({ modelId, purpose, effort: flag('effort', undefined), spec });
const suiteId = `suite-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const root = `runs/${suiteId}`;
mkdirSync(root, { recursive: true });
console.log(`${suiteId}: ${briefs.length} briefs x ${repeat}, ${model.provider}/${publicModelId(model.model)}, ${purpose}, strategy ${strategy}, features ${featureList.join('+') || 'none'}, effort ${model.effort}`);

// --checkpoint=<summary.json,...>: the last checkpoint's suites; the tripwires (src/tripwires.mjs)
// stop new runs when this batch breaks from them. A Fireworks batch always has one (the plan).
const checkpointFiles = typeof flag('checkpoint', null) === 'string' ? flag('checkpoint').split(',') : [];
if (model.provider === 'fireworks' && !checkpointFiles.length) {
  console.error('a Fireworks batch needs --checkpoint=<summary.json of the last checkpoint>[,...] (docs/plans/2026-11-02-fireworks-plan.md)');
  process.exit(2);
}
const checkpoint = checkpointFiles.length ? baselineOf(checkpointFiles.map((f) => JSON.parse(readFileSync(f, 'utf8')))) : null;
let tripwire = null;

const rows = [];
// Consecutive runs that ended on a model error before the queue stops (--infra-stop).
const INFRA_STOP = Math.max(1, Number(flag('infra-stop', 3)));
let infraStreak = 0;
const jobs = briefs.flatMap((b) => Array.from({ length: repeat }, (_, k) => ({ b, attempt: k + 1 })));
const started = Date.now();

async function runJob({ b, attempt }) {
  let row;
  try {
    // A dev server reloads its page when its source changes, which ends a run
    // mid-way (the build is gone): run it again, at most twice, and say so.
    let trace, reloads = 0;
    for (;;) {
      try {
        ({ trace } = await runSession({ brief: b.brief, briefId: b.id, expect: b.expect, start: startOf(b), model, ledger, purpose, strategy, features, outRoot: root }));
        break;
      } catch (e) {
        if (reloads >= 2 || !/hexAPI not loaded|Execution context was destroyed|api\[m\] is not a function/.test(String(e.message))) throw e;
        reloads++;
        console.log(`  ${b.id}#${attempt}: the page reloaded mid-run, running it again (${reloads})`);
      }
    }
    const c = trace.verdict.checks;
    const outcome = outcomeOf(trace.finish, trace.verdict.nodes);
    const configurator = configuratorPass(outcome, trace);
    const over = overclaimed(trace);
    const metButFails = (trace.acceptance?.checks ?? []).filter((x) => x.metButFails).map((x) => `${x.id}: ${x.why}`);
    row = {
      id: b.id,
      attempt,
      pass: configurator && trace.briefChecks.pass && !over && c.claimsInScope !== 'fail' && !metButFails.length,
      // E8: a pass with no core miss the model reported itself (every requirement met), negative briefs aside.
      strict: strictPass(configurator && trace.briefChecks.pass && !over && c.claimsInScope !== 'fail' && !metButFails.length, trace.finish, b),
      outcome,
      ...(trace.acceptance ? { declared: trace.acceptance.requirements.length, pushbacks: trace.acceptance.pushbacks, metButFails } : {}),
      claimsInScope: c.claimsInScope,
      configurator,
      mesh: c.mesh,
      briefChecks: trace.briefChecks.results.map((r) => `${r.pass ? 'ok' : 'FAIL'} ${JSON.stringify(r.expect)}=${r.saw}`),
      overclaimed: over,
      claimed: trace.finish?.requirements?.map((r) => r.status) ?? null,
      stop: trace.stop,
      forcedFinish: trace.forcedFinish ?? false,
      parts: trace.verdict.nodes,
      refusals: trace.counters.refusalCodes,
      calls: trace.usage.calls,
      seconds: Math.round(trace.elapsedMs / 1000),
      costUsd: Number((trace.usage.costUsd ?? 0).toFixed(4)),
      trace: `${trace.runId}/trace.json`,
      ...(reloads ? { reloads } : {}),
    };
  } catch (e) {
    const error = String(e.message ?? e).slice(0, 300);
    // Refused for budget before it began: not a result, and scores leave it out.
    // Refused for budget, or the browser/page failed (a harness error, not the model's result).
    row = { id: b.id, attempt, pass: false, error, ...(/^no \w+ budget left/.test(error) ? { budget: 'refused' } : { infra: 'harness' }) };
  }
  // Stopped part-way by the budget: kept, but not scored as the model's result.
  if (row.stop && /^(cost budget|\w+ credit budget)$/.test(row.stop)) row.budget = 'stopped';
  row.set = b.set;
  // The model host failing (cold, down, refusing) is not the model's result: the row is marked
  // infra and left out like a budget cut, and after INFRA_STOP in a row the queue stops.
  if (row.stop === 'model error') {
    row.infra = 'model error';
    if (++infraStreak >= INFRA_STOP && !stopping) {
      stopping = 'infra';
      console.log(`${INFRA_STOP} runs in a row ended on a model error: the host is not answering, no new runs`);
    }
  } else if (!row.error) infraStreak = 0;
  rows.push(row);
  if (checkpoint && !tripwire && !stopping && (tripwire = tripped(rows, checkpoint))) {
    stopping = 'tripwire';
    console.log(`TRIPWIRE ${tripwire}: no new runs; this batch goes to a checkpoint`);
  }
  console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.id}#${row.attempt} ${row.error ?? `parts=${row.parts} refusals=${JSON.stringify(row.refusals)} calls=${row.calls} ${row.seconds}s $${row.costUsd}${row.overclaimed ? ' OVERCLAIMED' : ''}${row.forcedFinish ? ' FORCED-FINISH' : ''}${row.claimed?.some((c) => c !== 'met') ? ` claims=${row.claimed.join('/')}` : ''}${row.outcome && row.outcome !== 'built' ? ` ${row.outcome}` : ''}${row.metButFails?.length ? ` MET-BUT-FAILS=${row.metButFails.length}` : ''}${row.pushbacks ? ` pushbacks=${row.pushbacks}` : ''} ${row.briefChecks.filter((x) => x.startsWith('FAIL')).join(' ')}`}`);
  rows.sort((x, y) => jobs.findIndex((j) => j.b.id === x.id && j.attempt === x.attempt) - jobs.findIndex((j) => j.b.id === y.id && j.attempt === y.attempt));
  writeSummary();
}

function writeSummary() {
  writeFileSync(`${root}/summary.json`, JSON.stringify({ suiteId, provider: model.provider, model: publicModelId(model.model), origin: process.env.HEX_URL || 'live', purpose, strategy, features, effort: model.effort, concurrency, briefSets: briefFiles, ...(maxMinutes != null ? { maxMinutes } : {}), planned: jobs.length, ...(checkpoint ? { checkpoint: checkpointFiles } : {}), ...(tripwire ? { tripwire } : {}), ...(stopping ? { stopped: stopping, notStarted: jobs.length - rows.length } : {}), rows }, null, 2) + '\n');
}

// N workers pull from one queue; each run has its own browser.
let next = 0;
let stopping = null;
const deadline = maxMinutes == null ? Infinity : started + maxMinutes * 60_000;
// --max-minutes stops new runs; the watchdog ends the suite if the runs going then have not
// finished within a run's own time cap more (a hung page or a stuck call).
if (maxMinutes != null) {
  const graceMs = Number(flag('watchdog-grace-minutes', 15)) * 60_000;
  setTimeout(() => {
    stopping = 'watchdog';
    console.log(`\nwatchdog: ${maxMinutes} min + grace passed with runs still going; writing the summary and ending`);
    writeSummary();
    process.exit(124);
  }, maxMinutes * 60_000 + graceMs).unref();
}
// SIGINT / SIGTERM: start nothing new, write what finished, and exit (Playwright closes its browsers).
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (stopping) process.exit(130);
    stopping = sig;
    console.log(`\n${sig}: no new runs; writing the summary of the ${rows.length} that finished`);
    writeSummary();
    process.exit(130);
  });
}
// Started by bin/modal-window.mjs: if that process is gone (killed, closed), stop as on a signal.
const parentPid = Number(process.env.SUITE_PARENT_PID);
if (parentPid > 0) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      if (!stopping) {
        stopping = 'parent gone';
        console.log(`\nthe window process (${parentPid}) is gone: no new runs; writing the summary`);
        writeSummary();
        process.exit(130);
      }
    }
  }, 5000).unref();
}
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
  while (next < jobs.length && !stopping) {
    if (Date.now() > deadline) {
      stopping = 'max-minutes';
      break;
    }
    await runJob(jobs[next++]);
  }
}));
if (stopping) {
  console.log(`${jobs.length - next} runs not started (${stopping})`);
  writeSummary();
}
const passed = rows.filter((r) => r.pass).length;
const cost = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
console.log(`\n${passed}/${rows.length} passed, $${cost.toFixed(4)}, ${Math.round((Date.now() - started) / 1000)} s wall clock at concurrency ${concurrency}, summary ${root}/summary.json`);
console.log(`spend: ${JSON.stringify(ledger.summary())}`);
