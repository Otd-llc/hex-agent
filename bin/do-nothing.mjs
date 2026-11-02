// The do-nothing baseline: what an agent that changes nothing would score, by the same rules
// rescore.mjs applies to real runs. No model. One browser session verifies each distinct start
// (the starter base as served, or a brief's own saved start) and the empty build, with the
// same verify() the suite uses; then three do-nothing finishes are scored per brief:
//   unmet: the start left as is, every requirement reported unmet (worst case for us)
//   noList: the start left as is, a finish with no requirements (reads as built)
//   empty:  every part removed, every requirement unmet (reads as declined)
//   node bin/do-nothing.mjs [--write]   (--write: docs/data/do-nothing.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openHex } from '../src/bridge.mjs';
import { verify, outOfScopeClaims } from '../src/agent.mjs';
import { checkBrief, configuratorPass, outcomeOf, overclaimed } from '../src/checks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const SETS = {
  dev36: ['evals/briefs.json', 'evals/briefs-hard.json', 'evals/briefs-wide.json'],
  heldout: ['evals/briefs-heldout.json'],
  a58: ['evals/briefs-a58.json'],
};
// The same start the suite loads (bin/suite.mjs startOf).
const startOf = (b) => (!b.start ? null : typeof b.start !== 'string' ? b.start : ((j) => j.state ?? j)(readJson(b.start)));

// One verified state per distinct start, plus the empty build.
const FINISH = { outcome: undefined, requirements: [{ requirement: 'the brief', status: 'unmet' }] };
async function measure(start) {
  const hex = await openHex({ headless: true });
  try {
    if (start) {
      const loaded = await hex.call('load', start);
      if (!loaded.ok) throw new Error(`start did not load: ${loaded.code}`);
    }
    await hex.call('settle');
    const asServed = { state: await hex.call('getState'), verdict: await verify({ hex, openFresh: () => hex.fresh(), finish: FINISH }) };
    const nodes = asServed.state.nodes.map((n) => n.ref);
    if (nodes.length) await hex.call('applyAll', nodes.map((ref) => ({ op: 'remove', ref })));
    await hex.call('settle');
    const empty = { state: await hex.call('getState'), verdict: await verify({ hex, openFresh: () => hex.fresh(), finish: FINISH }) };
    return { asServed, empty };
  } finally {
    await hex.close();
  }
}

function score(expect, { state, verdict }, finish) {
  const v = { ...verdict, checks: { ...verdict.checks, agentFinished: 'pass' } };
  const checks = checkBrief(expect, { state, verdict: v, finish, events: [] });
  const trace = { finish, verdict: v, briefChecks: checks };
  const scope = outOfScopeClaims(finish).length ? 'fail' : 'pass';
  return configuratorPass(outcomeOf(finish, v.nodes), trace) && checks.pass && !overclaimed(trace) && scope !== 'fail';
}

const starts = new Map();
const out = { generatedBy: 'bin/do-nothing.mjs', rules: 'rescore.mjs pass rules (configuratorPass, brief checks, overclaimed, scope)', variants: { unmet: 'start left as is, every requirement unmet', noList: 'start left as is, no requirements listed', empty: 'every part removed, every requirement unmet' }, sets: {} };
for (const [set, files] of Object.entries(SETS)) {
  const briefs = files.flatMap((f) => readJson(f));
  const per = {};
  for (const b of briefs) {
    const key = b.start ? JSON.stringify(b.start) : 'starter';
    if (!starts.has(key)) starts.set(key, await measure(startOf(b)));
    const m = starts.get(key);
    const reqs = { requirements: [{ requirement: b.brief, status: 'unmet' }] };
    per[b.id] = {
      start: b.start ?? 'starter',
      unmet: score(b.expect, m.asServed, reqs),
      noList: score(b.expect, m.asServed, { requirements: [] }),
      // A saved start whose parts could not all be removed in one batch never reached empty: not scored.
      empty: m.empty.verdict.nodes === 0 ? score(b.expect, m.empty, reqs) : null,
    };
  }
  const n = Object.keys(per).length;
  const count = (k) => Object.values(per).filter((x) => x[k]).length;
  const emptyNotReached = Object.entries(per).filter(([, x]) => x.empty === null).map(([id]) => id);
  const any = Object.values(per).filter((x) => x.unmet || x.noList || x.empty).length;
  out.sets[set] = { briefs: n, unmet: count('unmet'), noList: count('noList'), empty: count('empty'), anyVariant: any, emptyNotReached, perBrief: per };
  console.log(`${set}: ${n} briefs; do-nothing passes unmet ${count('unmet')}, noList ${count('noList')}, empty ${count('empty')}, any ${any}`);
}
out.startVerdicts = Object.fromEntries([...starts].map(([k, m]) => [k, { asServed: { nodes: m.asServed.verdict.nodes, checks: m.asServed.verdict.checks }, empty: { nodes: m.empty.verdict.nodes, checks: m.empty.verdict.checks } }]));
if (process.argv.includes('--write')) writeFileSync(join(root, 'docs/data/do-nothing.json'), JSON.stringify(out, null, 2) + '\n');
