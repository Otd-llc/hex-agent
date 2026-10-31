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
import { overclaimed } from '../src/checks.mjs';

loadEnv();
const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}`));
  if (!a) return dflt;
  const [, v] = a.split('=');
  return v ?? true;
};
const purpose = flag('purpose', 'dev');
const modelId = flag('model', purpose === 'dev' ? 'muse-spark-1.3' : 'muse-wonder-1.0');
const repeat = Number(flag('repeat', 1));
const strategy = flag('strategy', 'interactive');
const only = flag('only', null)?.split(',');
// A brief's start: a build file (tools/catalog/builds/*.json, its state; props are left out) or a state object.
const startOf = (b) => {
  if (!b.start) return null;
  if (typeof b.start !== 'string') return b.start;
  const j = JSON.parse(readFileSync(b.start, 'utf8'));
  return j.state ?? j;
};
const briefs = JSON.parse(readFileSync(flag('briefs', 'evals/briefs.json'), 'utf8')).filter((b) => !only || only.includes(b.id));

const { model, ledger } = modelFor({ modelId, purpose, effort: flag('effort', undefined) });
const suiteId = `suite-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const root = `runs/${suiteId}`;
mkdirSync(root, { recursive: true });
console.log(`${suiteId}: ${briefs.length} briefs x ${repeat}, ${model.provider}/${model.model}, ${purpose}, strategy ${strategy}, effort ${model.effort}`);

const rows = [];
const concurrency = Math.max(1, Number(flag('concurrency', 1)));
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
        ({ trace } = await runSession({ brief: b.brief, briefId: b.id, expect: b.expect, start: startOf(b), model, ledger, purpose, strategy, outRoot: root }));
        break;
      } catch (e) {
        if (reloads >= 2 || !/hexAPI not loaded|Execution context was destroyed|api\[m\] is not a function/.test(String(e.message))) throw e;
        reloads++;
        console.log(`  ${b.id}#${attempt}: the page reloaded mid-run, running it again (${reloads})`);
      }
    }
    const c = trace.verdict.checks;
    const configurator = ['agentFinished', 'rules', 'mesh', 'printPack', 'roundTrip'].every((k2) => c[k2] === 'pass');
    const over = overclaimed(trace);
    row = {
      id: b.id,
      attempt,
      pass: configurator && trace.briefChecks.pass && !over && c.claimsInScope !== 'fail',
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
    row = { id: b.id, attempt, pass: false, error: String(e.message ?? e).slice(0, 300) };
  }
  rows.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.id}#${row.attempt} ${row.error ?? `parts=${row.parts} refusals=${JSON.stringify(row.refusals)} calls=${row.calls} ${row.seconds}s $${row.costUsd}${row.overclaimed ? ' OVERCLAIMED' : ''}${row.forcedFinish ? ' FORCED-FINISH' : ''}${row.claimed?.some((c) => c !== 'met') ? ` claims=${row.claimed.join('/')}` : ''} ${row.briefChecks.filter((x) => x.startsWith('FAIL')).join(' ')}`}`);
  rows.sort((x, y) => jobs.findIndex((j) => j.b.id === x.id && j.attempt === x.attempt) - jobs.findIndex((j) => j.b.id === y.id && j.attempt === y.attempt));
  writeFileSync(`${root}/summary.json`, JSON.stringify({ suiteId, provider: model.provider, model: model.model, purpose, strategy, effort: model.effort, concurrency, rows }, null, 2) + '\n');
}

// N workers pull from one queue; each run has its own browser.
let next = 0;
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
  while (next < jobs.length) await runJob(jobs[next++]);
}));
const passed = rows.filter((r) => r.pass).length;
const cost = rows.reduce((s, r) => s + (r.costUsd ?? 0), 0);
console.log(`\n${passed}/${rows.length} passed, $${cost.toFixed(4)}, ${Math.round((Date.now() - started) / 1000)} s wall clock at concurrency ${concurrency}, summary ${root}/summary.json`);
console.log(`spend: ${JSON.stringify(ledger.summary())}`);
