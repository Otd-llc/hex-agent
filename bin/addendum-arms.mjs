#!/usr/bin/env node
// Addendum data: the tool-layer fixes (branch improve/tool-layer) against the frozen
// agent (tag eval-final) on the fresh held-out set and the eight first-version demo
// briefs, three rounds, both arms started together (docs/plans/2026-11-03-addendum-protocol.md).
// Both arms are scored from rescore-0c840bc.json (the eval-final grader), never as run.
// A run whose page build or contract differs from the round's other arm is left out with its pair.
//   node C:/zzz/hex-agent-ef/bin/rescore.mjs runs/<suite>/summary.json --briefs=<set> --versioned   (each suite, from this repo)
//   node bin/addendum-arms.mjs [--write]   (--write: docs/data/addendum/arms.json)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, readJson, rows, pairedRows, clustered, mean } from './addendum-lib.mjs';

const GRADER = 'rescore-0c840bc.json';
const suiteOf = (log) => readFileSync(join(root, 'runs', log), 'utf8').match(/^(suite-[0-9TZ-]+):/)?.[1];
const SETS = { heldout2: 'h2', demoV1: 'demo' };
const out = { generatedBy: 'bin/addendum-arms.mjs', addendum: 'after the paper gate; not part of the submitted numbers', protocol: 'docs/plans/2026-11-03-addendum-protocol.md',
  arms: { base: 'eval-final 0c840bc', fix: 'improve/tool-layer 06a6adf' }, grader: GRADER, sets: {} };
const strata = Object.fromEntries(readJson(join(root, 'evals/briefs-heldout2.json')).map((b) => [b.id, { stratum: b.stratum, theme: b.theme }]));

for (const [set, tag] of Object.entries(SETS)) {
  const suites = { base: [], fix: [] };
  for (const r of [1, 2, 3]) for (const a of ['base', 'fix']) {
    let s = suiteOf(`addendum-${a}-${tag}-r${r}.log`);
    if (!s) throw new Error(`no suite in addendum-${a}-${tag}-r${r}.log`);
    // Both arms started in one millisecond share a suite id: read the per-arm split (bin/split-collided.mjs).
    if (s === suiteOf(`addendum-${a === 'base' ? 'fix' : 'base'}-${tag}-r${r}.log`)) s = `${s}-${a}`;
    if (!existsSync(join(root, 'runs', s, GRADER))) throw new Error(`${s}: run the eval-final rescore first`);
    suites[a].push(s);
  }
  // rows() reads the newest rescore file; check it is the eval-final one.
  const R = { base: rows(suites.base), fix: rows(suites.fix) };
  // Pair by round and brief: both runs must share page build and contract.
  const key = (r) => `${suites.base.includes(r.suite) ? suites.base.indexOf(r.suite) : suites.fix.indexOf(r.suite)}|${r.id}`;
  const fixBy = new Map(R.fix.map((r) => [key(r), r]));
  const dropped = [];
  const keepBase = [], keepFix = [];
  for (const b of R.base) {
    const f = fixBy.get(key(b));
    if (!f) { dropped.push({ pair: key(b), why: 'fix run cut or missing' }); continue; }
    if (b.pageBuild !== f.pageBuild || b.contract !== f.contract) { dropped.push({ pair: key(b), why: 'page or contract differs' }); continue; }
    keepBase.push(b); keepFix.push(f);
  }
  for (const f of R.fix) if (!R.base.some((b) => key(b) === key(f))) dropped.push({ pair: key(f), why: 'base run cut or missing' });
  // strict: a pass with no requirement the agent itself reported unmet (rescore `strict`).
  const arm = (rs) => ({ ...clustered(rs), strict: clustered(rs, (r) => r.strict), overclaims: rs.filter((r) => r.over).length,
    costPerRunUsd: +mean(rs.map((r) => r.costUsd ?? 0)).toFixed(4), callsPerRun: +mean(rs.map((r) => r.calls ?? 0)).toFixed(1),
    passAll3: (() => { const m = new Map(); for (const r of rs) m.set(r.id, [...(m.get(r.id) ?? []), r.pass]); return [...m.values()].filter((v) => v.length === 3 && v.every(Boolean)).length; })(),
    provenance: { agent: [...new Set(rs.map((r) => r.agent))], dirty: [...new Set(rs.map((r) => r.dirty))], pageBuild: [...new Set(rs.map((r) => r.pageBuild))], contract: [...new Set(rs.map((r) => r.contract))] } });
  const p = pairedRows(keepBase, keepFix);
  const res = { suites, keptPairs: keepBase.length, dropped, base: arm(keepBase), fix: arm(keepFix), fixMinusBase: p,
    overclaimFixMinusBase: pairedRows(keepBase, keepFix, (r) => r.over),
    regressions: Object.entries(p.perBrief).filter(([, v]) => v.diff < 0).map(([id, v]) => ({ id, ...v })),
    gains: Object.entries(p.perBrief).filter(([, v]) => v.diff > 0).map(([id, v]) => ({ id, ...v })) };
  if (set === 'heldout2') {
    res.themed = pairedRows(keepBase, keepFix, (r) => r.pass, (id) => strata[id]?.stratum === 'themed');
    res.general = pairedRows(keepBase, keepFix, (r) => r.pass, (id) => strata[id]?.stratum === 'general');
    res.byTheme = Object.fromEntries([...new Set(Object.values(strata).map((s) => s.theme).filter(Boolean))].map((t) => {
      const q = pairedRows(keepBase, keepFix, (r) => r.pass, (id) => strata[id]?.theme === t);
      return [t, { briefs: q.briefs, basePct: q.aPct, fixPct: q.bPct, diffPoints: q.diffPoints }];
    }));
  }
  out.sets[set] = res;
}
console.log(JSON.stringify(out, (k, v) => (k === 'perBrief' ? undefined : v), 2));
if (process.argv.includes('--write')) writeFileSync(join(root, 'docs/data/addendum/arms.json'), JSON.stringify(out, null, 2) + '\n');
