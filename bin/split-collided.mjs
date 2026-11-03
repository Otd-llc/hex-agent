#!/usr/bin/env node
// Two suites started in the same millisecond share one suite id: both arms wrote their
// run folders into one directory and the last to finish overwrote summary.json
// (addendum demo rounds, 2026-11-03). Every trace survived. This writes one summary
// per agent commit into runs/<suite>-<label>/, rows pointing back at the shared traces,
// so each arm can be rescored and read on its own. Run folders are not moved.
//   node bin/split-collided.mjs <suite-id> <commit7>=<label> [<commit7>=<label> ...]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/ledger.mjs';

const [suite, ...pairs] = process.argv.slice(2);
const labels = Object.fromEntries(pairs.map((p) => p.split('=')));
const dir = join(ROOT, 'runs', suite);
const shared = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
const byCommit = {};
for (const d of readdirSync(dir).sort()) {
  const tp = join(dir, d, 'trace.json');
  if (!existsSync(tp)) continue;
  const t = JSON.parse(readFileSync(tp, 'utf8'));
  const c = t.agent?.commit?.slice(0, 7);
  if (!labels[c]) throw new Error(`${d}: agent ${c} has no label`);
  const rows = (byCommit[c] ??= []);
  const attempt = rows.filter((r) => r.id === t.briefId).length + 1;
  rows.push({ id: t.briefId, attempt, pass: t.verdict?.success === true, overclaimed: null, outcome: t.finish?.outcome ?? null, stop: t.stop ?? null,
    calls: t.counters?.modelCalls ?? null, costUsd: t.usage?.costUsd ?? null, trace: `../${suite}/${d}/trace.json`, set: shared.rows[0]?.set ?? null,
    note: 'pass and overclaimed as recorded are not used: read the rescore file' });
}
for (const [c, rows] of Object.entries(byCommit)) {
  const out = join(ROOT, 'runs', `${suite}-${labels[c]}`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ ...shared, suiteId: `${suite}-${labels[c]}`, splitFrom: suite, agentCommit: c, rows }, null, 2) + '\n');
  console.log(`${suite}-${labels[c]}: ${rows.length} rows (agent ${c})`);
}
