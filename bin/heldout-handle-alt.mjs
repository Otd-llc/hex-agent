// The held-out handle check, both ways. ho-drawer-handle-side checks {family: 'handle'}, the
// form briefs-wide fixed to {bom: 'handle'} in e196a37 (a handle is a BOM line, not a part
// family), so it fails builds that have the handle. Held-out checks are never edited
// (RULES.md), and rescore.mjs is never run in a held-out suite dir, so this script applies
// exactly that substitution in memory, scores every held-out run with the rescore rules, and
// writes the alternate count to docs/data only. The as-run count stays primary. Found by
// reading held-out traces; the brief's same-side requirement has no coded check either way.
//   node bin/heldout-handle-alt.mjs [--write]   (--write: docs/data/heldout-handle-alt.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { checkBrief, overclaimed, configuratorPass, outcomeOf } from '../src/checks.mjs';
import { outOfScopeClaims } from '../src/agent.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha = (t) => createHash('sha256').update(t).digest('hex');
const BRIEF = 'ho-drawer-handle-side';
const SUITES = { x1: 'suite-2026-11-02T14-02-50-056Z', x4: 'suite-2026-11-02T15-47-26-043Z' };
const briefs = new Map(readJson(join(root, 'evals/briefs-heldout.json')).map((b) => [b.id, b]));
// The e196a37 substitution, and nothing else.
const swap = (expect) => expect.map((e) => (e.family === 'handle' ? (({ family, ...rest }) => ({ bom: 'handle', ...rest }))(e) : e));

function score(trace, expect) {
  const fresh = checkBrief(expect, { state: { nodes: trace.finalNodes, staging: trace.finalStaging ?? undefined }, verdict: trace.verdict, finish: trace.finish, events: trace.events ?? [] });
  const t2 = { ...trace, briefChecks: fresh };
  const scope = trace.finish ? (outOfScopeClaims(trace.finish).length ? 'fail' : 'pass') : 'unverified';
  const configurator = configuratorPass(outcomeOf(trace.finish, trace.verdict.nodes), trace);
  return { pass: configurator && fresh.pass && !overclaimed(t2) && scope !== 'fail' && !(trace.acceptance?.checks ?? []).some((x) => x.metButFails), over: overclaimed(t2) };
}

const out = { generatedBy: 'bin/heldout-handle-alt.mjs', brief: BRIEF, substitution: '{family: handle} -> {bom: handle} (e196a37)', primary: 'as run', suites: {} };
for (const [k, suite] of Object.entries(SUITES)) {
  const dir = join(root, 'runs', suite);
  const s = readJson(join(dir, 'summary.json'));
  const acc = { runs: 0, asRun: 0, alt: 0, asRunOverclaimed: 0, altOverclaimed: 0, recomputedMatchesAsRun: 0, briefRuns: [] };
  for (const row of s.rows) {
    const t = readJson(join(dir, row.trace));
    const b = briefs.get(row.id);
    if (!b || sha(b.brief) !== t.briefSha256) throw new Error(`${row.id}: brief hash differs from the trace`);
    const base = score(t, b.expect);
    const alt = row.id === BRIEF ? score(t, swap(b.expect)) : base;
    acc.runs++;
    if (row.pass) acc.asRun++;
    if (row.overclaimed) acc.asRunOverclaimed++;
    if (base.pass === row.pass) acc.recomputedMatchesAsRun++;
    if (alt.pass) acc.alt++;
    if (alt.over) acc.altOverclaimed++;
    if (row.id === BRIEF) acc.briefRuns.push({ attempt: row.attempt, asRun: row.pass, alt: alt.pass, handleInBom: (t.verdict.bom?.lines ?? []).some((l) => l.key.includes('handle')) });
  }
  out.suites[k] = { suite, ...acc };
}
const x1 = out.suites.x1, x4 = out.suites.x4;
out.pooled = { runs: x1.runs + x4.runs, asRun: x1.asRun + x4.asRun, alt: x1.alt + x4.alt, asRunOverclaimed: x1.asRunOverclaimed + x4.asRunOverclaimed, altOverclaimed: x1.altOverclaimed + x4.altOverclaimed };
const text = JSON.stringify(out, null, 2) + '\n';
if (process.argv.includes('--write')) writeFileSync(join(root, 'docs/data/heldout-handle-alt.json'), text);
process.stdout.write(text);
