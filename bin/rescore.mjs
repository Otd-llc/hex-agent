#!/usr/bin/env node
// Re-apply the current brief checks to the traces of an earlier suite, when a
// check turned out to be wrong. Prints old and new verdicts side by side and
// writes rescore.json next to the summary; never edits the original summary.
// --versioned writes rescore-<grader commit>.json instead and leaves earlier rescores as
// they are (refused on a dirty tree, where the commit would not name the grader).
//   node bin/rescore.mjs runs/<suite-id>/summary.json [--briefs=evals/briefs.json] [--versioned]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { agentCommit } from '../src/provenance.mjs';
import { checkBrief, overclaimed, strictPass, configuratorPass, outcomeOf, NEEDS_CELLS } from '../src/checks.mjs';
import { outOfScopeClaims } from '../src/agent.mjs';

const args = process.argv.slice(2);
const summaryPath = args.find((a) => !a.startsWith('--'));
const briefsArg = args.find((a) => a.startsWith('--briefs='))?.split('=')[1];
const root = dirname(summaryPath);
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
const versioned = args.includes('--versioned');
if (versioned && agentCommit().dirty) {
  console.error('rescore --versioned: tracked files have changes; commit first so the file name names the grader');
  process.exit(2);
}
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
  const fresh = checkBrief(expect, { state: { nodes, staging: trace.finalStaging ?? undefined }, verdict: trace.verdict, finish: trace.finish, events: trace.events ?? [] });
  if (!trace.finalNodes) {
    // No cells to read: the original verdict where the check existed then, else not counted.
    fresh.results = fresh.results.map((r) => {
      if (!NEEDS_CELLS.some((k) => r.expect[k])) return r;
      const was = (trace.briefChecks?.results ?? []).find((x) => JSON.stringify(x.expect) === JSON.stringify(r.expect));
      return was ? { ...was, kept: 'needs cells' } : { ...r, pass: true, kept: 'needs cells: not counted' };
    });
    fresh.pass = fresh.results.every((r) => r.pass);
  }
  const t2 = { ...trace, briefChecks: fresh };
  // The scope check as it is now, from the trace's own finish (the suite's pass needs it too).
  const scope = trace.finish ? (outOfScopeClaims(trace.finish).length ? 'fail' : 'pass') : 'unverified';
  // The configurator verdict recomputed with the current rule (G0: the decline gate changed).
  const configurator = configuratorPass(outcomeOf(trace.finish, trace.verdict.nodes), trace);
  const after = configurator && fresh.pass && !overclaimed(t2) && scope !== 'fail' && !(trace.acceptance?.checks ?? []).some((x) => x.metButFails);
  out.push({ id: row.id, attempt: row.attempt, before: row.pass, after, strict: strictPass(after, trace.finish, found.brief), changed: before(row) !== after, brief: found.brief.file, briefMatch: found.match, ...(fresh.pass ? {} : { failed: fresh.results.filter((x) => !x.pass).map((x) => `${JSON.stringify(x.expect)}=${x.saw}`) }) });
}
function before(row) { return row.pass; }

for (const r of out.filter((x) => x.changed)) console.log(`${r.id}#${r.attempt}: ${r.before ? 'PASS' : 'FAIL'} -> ${r.after ? 'PASS' : 'FAIL'}`);
const n = (k) => out.filter((r) => r[k]).length;
console.log(`${summary.model}: ${n('before')}/${out.length} as first scored -> ${n('after')}/${out.length} with current checks, ${n('strict')}/${out.length} strict`);
// Which grader and which briefs: a rescore is only comparable with one by the same code on the same files.
const grader = agentCommit();
writeFileSync(join(root, versioned ? `rescore-${grader.commit.slice(0, 7)}.json` : 'rescore.json'), JSON.stringify({ rescoredAt: new Date().toISOString(), graderCommit: grader.commit, graderDirty: grader.dirty, briefsSha256, briefFiles: files, rows: out }, null, 2) + '\n');
