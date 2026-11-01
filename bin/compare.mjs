#!/usr/bin/env node
// Per-brief pass rates across suites, using each suite's rescore.json when
// there is one (current checks), else its summary.
//   node bin/compare.mjs runs/<suite-a>/summary.json runs/<suite-b>/summary.json ...
// One column per comparable group (provider, model, effort, contract, page build,
// agent commit: src/runkey.mjs); runs the budget refused or cut short are left out.
import { dirname } from 'node:path';
import { loadRuns, KEY_FIELDS } from '../src/runkey.mjs';

const dirs = process.argv.slice(2).map((p) => (p.endsWith('.json') ? dirname(p) : p));
if (!dirs.length) {
  console.error('usage: node bin/compare.mjs <suite dir|summary.json> ...');
  process.exit(2);
}
const runs = loadRuns(dirs);
const table = new Map(); // brief -> group -> [pass, total]
const groups = [];
let cut = 0;
for (const r of runs) {
  if (r.cut) {
    cut++;
    continue;
  }
  if (!groups.includes(r.key)) groups.push(r.key);
  const m = table.get(r.row.id) ?? new Map();
  const [ok, n] = m.get(r.key) ?? [0, 0];
  m.set(r.key, [ok + (r.row.pass ? 1 : 0), n + 1]);
  table.set(r.row.id, m);
}
const cell = (v) => (v ? `${v[0]}/${v[1]}` : '-');
groups.forEach((g, i) => console.log(`G${i + 1}: ${KEY_FIELDS.join(' | ')} = ${g}`));
console.log(`\n| brief | ${groups.map((_, i) => `G${i + 1}`).join(' | ')} |`);
console.log(`|---|${groups.map(() => '---').join('|')}|`);
for (const [id, m] of table) console.log(`| ${id} | ${groups.map((x) => cell(m.get(x))).join(' | ')} |`);
const tot = groups.map((x) => [...table.values()].reduce((a, m) => { const v = m.get(x) ?? [0, 0]; return [a[0] + v[0], a[1] + v[1]]; }, [0, 0]));
console.log(`| **total** | ${tot.map(cell).join(' | ')} |`);
if (cut) console.log(`\n${cut} runs left out: refused or cut short by the budget`);
