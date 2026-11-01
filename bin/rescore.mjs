#!/usr/bin/env node
// Re-apply the current brief checks to the traces of an earlier suite, when a
// check turned out to be wrong. Prints old and new verdicts side by side and
// writes rescore.json next to the summary; never edits the original summary.
//   node bin/rescore.mjs runs/<suite-id>/summary.json [--briefs=evals/briefs.json]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { agentCommit } from '../src/provenance.mjs';
import { checkBrief, overclaimed } from '../src/checks.mjs';
import { outOfScopeClaims } from '../src/agent.mjs';

const args = process.argv.slice(2);
const summaryPath = args.find((a) => !a.startsWith('--'));
const briefsArg = args.find((a) => a.startsWith('--briefs='))?.split('=')[1];
const root = dirname(summaryPath);
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
// Every brief file (an id can be in more than one, with other text or checks): each trace is
// scored against the brief it actually ran, found by its brief hash.
const sha = (t) => createHash('sha256').update(t).digest('hex');
const files = [...new Set([briefsArg, ...readdirSync('evals').filter((f) => f.endsWith('.json')).map((f) => `evals/${f}`)].filter(Boolean))].sort();
const briefs = files.flatMap((p) => JSON.parse(readFileSync(p, 'utf8')).map((b) => ({ ...b, file: p, sha: sha(b.brief) })));
const briefsSha256 = sha(files.map((p) => `${p}\n${readFileSync(p, 'utf8')}`).join('\n'));
function briefFor(id, trace) {
  const same = briefs.filter((b) => b.id === id);
  const exact = same.find((b) => b.sha === trace.briefSha256);
  if (exact) return { brief: exact, match: 'hash' };
  // An older trace with no hash: the suite's own brief set, when it names one, then the first.
  const set = summary.briefSets?.map((f) => f.replace(/\\/g, '/'));
  const inSet = set && same.find((b) => set.includes(b.file));
  if (inSet ?? same[0]) return { brief: inSet ?? same[0], match: trace.briefSha256 ? 'id only (brief text changed)' : 'id only (no hash)' };
  return { brief: null, match: 'none' };
}

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
  const found = briefFor(row.id, trace);
  if (!found.brief) {
    out.push({ id: row.id, attempt: row.attempt, before: row.pass, after: row.pass, note: 'brief not found in evals/: unchanged' });
    continue;
  }
  const expect = found.brief.expect;
  const fresh = checkBrief(expect, { state: { nodes, staging: trace.finalStaging ?? undefined }, verdict: trace.verdict, finish: trace.finish });
  if (!trace.finalNodes) {
    fresh.results = fresh.results.map((r, i) => (r.expect.levels ? { ...trace.briefChecks.results[i], kept: 'needs cells' } : r));
    fresh.pass = fresh.results.every((r) => r.pass);
  }
  const t2 = { ...trace, briefChecks: fresh };
  // The scope check as it is now, from the trace's own finish (the suite's pass needs it too).
  const scope = trace.finish ? (outOfScopeClaims(trace.finish).length ? 'fail' : 'pass') : 'unverified';
  const after = row.configurator && fresh.pass && !overclaimed(t2) && scope !== 'fail' && !(trace.acceptance?.checks ?? []).some((x) => x.metButFails);
  out.push({ id: row.id, attempt: row.attempt, before: row.pass, after, changed: before(row) !== after, brief: found.brief.file, briefMatch: found.match });
}
function before(row) { return row.pass; }

for (const r of out.filter((x) => x.changed)) console.log(`${r.id}#${r.attempt}: ${r.before ? 'PASS' : 'FAIL'} -> ${r.after ? 'PASS' : 'FAIL'}`);
const n = (k) => out.filter((r) => r[k]).length;
console.log(`${summary.model}: ${n('before')}/${out.length} as first scored -> ${n('after')}/${out.length} with current checks`);
// Which grader and which briefs: a rescore is only comparable with one by the same code on the same files.
const grader = agentCommit();
writeFileSync(join(root, 'rescore.json'), JSON.stringify({ rescoredAt: new Date().toISOString(), graderCommit: grader.commit, graderDirty: grader.dirty, briefsSha256, briefFiles: files, rows: out }, null, 2) + '\n');
