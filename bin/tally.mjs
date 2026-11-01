// API confirmations from traces, one table per provider + model (never mixed):
// runs attempted / completed / passed (a run refused or stopped by the budget is
// not a result and is left out of completed and passed), and per refusal code how
// often it came with a tryInstead, how often the agent sent that op next, and how
// often that op went on; plus the validate issues left on finished builds
// (PROP_INSIDE, PLANT_NOT_IN_SOIL, ...) and how many runs overclaimed.
// node bin/tally.mjs <suite dir|summary.json> ... [--json]
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Key order does not matter when matching the op the agent sent to the one offered.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const tryOf = (o) => {
  const t = o.details?.tryInstead ?? o.tryInstead;
  // The op itself, or an offer row {op: {...}} around it.
  return t ? (typeof t.op === 'object' ? t.op : t) : null;
};

// rows: [{ row, t }] with t the trace (null when none was written). One group's tally.
export function tally(runs) {
  const codes = {};
  const issues = {};
  let attempted = 0, completed = 0, passed = 0, overclaimed = 0, budget = 0;
  for (const { row, t } of runs) {
    attempted++;
    if (row.budget) {
      budget++;
      continue;
    }
    if (row.error || !t) continue;
    completed++;
    if (row.pass) passed++;
    if (row.overclaimed) overclaimed++;
    const applies = (t.events ?? []).filter((e) => e.type === 'apply');
    applies.forEach((e, i) => (e.outcomes ?? []).forEach((o) => {
      if (o.ok) return;
      const c = (codes[o.code] ??= { refused: 0, withTry: 0, sentNext: 0, nextOk: 0 });
      c.refused++;
      const t2 = tryOf(o);
      if (!t2) return;
      c.withTry++;
      const next = applies[i + 1];
      const k = next ? next.ops.findIndex((op) => same(op, t2)) : -1;
      if (k < 0) return;
      c.sentNext++;
      if (next.outcomes?.[k]?.ok) c.nextOk++;
    }));
    for (const is of t.verdict?.validation?.issues ?? []) {
      const code = is.code ?? is.rule ?? String(is);
      issues[code] = (issues[code] ?? 0) + 1;
    }
  }
  return { attempted, completed, passed, budgetExcluded: budget, overclaimed, codes, issues };
}

// Runs from suite dirs, grouped by provider + model as each summary names them.
export function groups(dirs) {
  const out = new Map();
  for (const dir of dirs) {
    const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    const key = `${s.provider}/${s.model}`;
    if (!out.has(key)) out.set(key, []);
    for (const row of s.rows) {
      const p = row.trace ? join(dir, row.trace) : null;
      const t = p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
      // A trace that names another provider or model than its summary is not counted under it.
      if (t && (t.provider !== s.provider || (t.model && t.model !== s.model))) throw new Error(`${p}: trace is ${t.provider}/${t.model}, summary says ${key}`);
      out.get(key).push({ row, t });
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const dirs = args.filter((a) => !a.startsWith('--')).map((a) => (a.endsWith('.json') ? dirname(a) : a));
  if (!dirs.length) {
    console.error('usage: node bin/tally.mjs <suite dir|summary.json> ... [--json]');
    process.exit(2);
  }
  const result = Object.fromEntries([...groups(dirs)].map(([k, runs]) => [k, tally(runs)]));
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else {
    for (const [key, r] of Object.entries(result)) {
      console.log(`\n## ${key}: ${r.attempted} attempted, ${r.completed} completed, ${r.passed} passed${r.budgetExcluded ? `, ${r.budgetExcluded} left out (budget)` : ''}, ${r.overclaimed} overclaimed`);
      console.log('code | refused | with tryInstead | sent next | next ok');
      for (const [code, c] of Object.entries(r.codes).sort((a, b) => b[1].refused - a[1].refused)) {
        console.log(`${code} | ${c.refused} | ${c.withTry} | ${c.sentNext} | ${c.nextOk}`);
      }
      console.log('validate issues on finished builds:', Object.keys(r.issues).length ? JSON.stringify(r.issues) : 'none');
    }
  }
}
