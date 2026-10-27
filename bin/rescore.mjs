#!/usr/bin/env node
// Re-apply the current brief checks to the traces of an earlier suite, when a
// check turned out to be wrong. Prints old and new verdicts side by side and
// writes rescore.json next to the summary; never edits the original summary.
//   node bin/rescore.mjs runs/<suite-id>/summary.json [--briefs=evals/briefs.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { checkBrief, overclaimed } from '../src/checks.mjs';

const args = process.argv.slice(2);
const summaryPath = args.find((a) => !a.startsWith('--'));
const briefsArg = args.find((a) => a.startsWith('--briefs='))?.split('=')[1];
const root = dirname(summaryPath);
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const briefs = [briefsArg, 'evals/briefs.json', 'evals/briefs-hard.json', 'evals/briefs-wide.json']
  .filter(Boolean)
  .flatMap((p) => JSON.parse(readFileSync(p, 'utf8')));
const byId = new Map(briefs.map((b) => [b.id, b]));

const out = [];
for (const row of summary.rows) {
  if (!row.trace) {
    out.push({ id: row.id, attempt: row.attempt, before: row.pass, after: row.pass, note: 'no trace (harness error); unchanged' });
    continue;
  }
  const trace = JSON.parse(readFileSync(join(root, row.trace), 'utf8'));
  // Older traces have family counts but not nodes: rebuild nodes without cells,
  // and keep the original verdict for storey checks, which need cells.
  const nodes = trace.finalNodes ?? Object.entries(trace.verdict.families).flatMap(([family, n]) => Array.from({ length: n }, () => ({ family, at: null })));
  const expect = byId.get(row.id).expect;
  const fresh = checkBrief(expect, { state: { nodes }, verdict: trace.verdict, finish: trace.finish });
  if (!trace.finalNodes) {
    fresh.results = fresh.results.map((r, i) => (r.expect.levels ? { ...trace.briefChecks.results[i], kept: 'needs cells' } : r));
    fresh.pass = fresh.results.every((r) => r.pass);
  }
  const t2 = { ...trace, briefChecks: fresh };
  const after = row.configurator && fresh.pass && !overclaimed(t2);
  out.push({ id: row.id, attempt: row.attempt, before: row.pass, after, changed: before(row) !== after });
}
function before(row) { return row.pass; }

for (const r of out.filter((x) => x.changed)) console.log(`${r.id}#${r.attempt}: ${r.before ? 'PASS' : 'FAIL'} -> ${r.after ? 'PASS' : 'FAIL'}`);
const n = (k) => out.filter((r) => r[k]).length;
console.log(`${summary.model}: ${n('before')}/${out.length} as first scored -> ${n('after')}/${out.length} with current checks`);
writeFileSync(join(root, 'rescore.json'), JSON.stringify({ rescoredAt: new Date().toISOString(), rows: out }, null, 2) + '\n');
