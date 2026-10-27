#!/usr/bin/env node
// Per-brief pass rates across suites, using each suite's rescore.json when
// there is one (current checks), else its summary.
//   node bin/compare.mjs runs/<suite-a>/summary.json runs/<suite-b>/summary.json ...
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const table = new Map(); // brief -> model -> [pass, total]
const models = [];
for (const p of process.argv.slice(2)) {
  const s = JSON.parse(readFileSync(p, 'utf8'));
  const re = join(dirname(p), 'rescore.json');
  const rows = existsSync(re) ? JSON.parse(readFileSync(re, 'utf8')).rows.map((r) => ({ id: r.id, pass: r.after })) : s.rows;
  // One column per model and working method: strategy and effort shown when not the default.
  const label = [s.model.replace(/^meta-models\//, ''), s.strategy && s.strategy !== 'interactive' ? s.strategy : '', s.effort && s.effort !== 'medium' ? `effort ${s.effort}` : ''].filter(Boolean).join(' · ');
  if (!models.includes(label)) models.push(label);
  for (const r of rows) {
    const m = table.get(r.id) ?? new Map();
    const [ok, n] = m.get(label) ?? [0, 0];
    m.set(label, [ok + (r.pass ? 1 : 0), n + 1]);
    table.set(r.id, m);
  }
}
const cell = (v) => (v ? `${v[0]}/${v[1]}` : '-');
console.log(`| brief | ${models.join(' | ')} |`);
console.log(`|---|${models.map(() => '---').join('|')}|`);
for (const [id, m] of table) console.log(`| ${id} | ${models.map((x) => cell(m.get(x))).join(' | ')} |`);
const tot = models.map((x) => [...table.values()].reduce((a, m) => { const v = m.get(x) ?? [0, 0]; return [a[0] + v[0], a[1] + v[1]]; }, [0, 0]));
console.log(`| **total** | ${tot.map(cell).join(' | ')} |`);
