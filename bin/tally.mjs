// API confirmations from traces: per refusal code, how often it came with a
// tryInstead, how often the agent sent that op next, and how often that op went
// on; plus the validate issues left on finished builds (PROP_INSIDE,
// PLANT_NOT_IN_SOIL, ...) and how many runs overclaimed.
// node bin/tally.mjs <suite dir|summary.json> ... [--json]
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const dirs = args.filter((a) => !a.startsWith('--')).map((a) => (a.endsWith('.json') ? dirname(a) : a));
if (!dirs.length) {
  console.error('usage: node bin/tally.mjs <suite dir|summary.json> ... [--json]');
  process.exit(2);
}

// Key order does not matter when matching the op the agent sent to the one offered.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const tryOf = (o) => {
  const t = o.details?.tryInstead ?? o.tryInstead;
  // The op itself, or an offer row {op: {...}} around it.
  return t ? (typeof t.op === 'object' ? t.op : t) : null;
};

export function tally(traces) {
  const codes = {};
  const issues = {};
  let runs = 0, overclaimed = 0;
  for (const { t, row } of traces) {
    runs++;
    if (row?.overclaimed) overclaimed++;
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
  return { runs, overclaimed, codes, issues };
}

const traces = [];
for (const dir of dirs) {
  const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  for (const row of s.rows) {
    const p = join(dir, row.trace);
    if (existsSync(p)) traces.push({ t: JSON.parse(readFileSync(p, 'utf8')), row });
  }
}
const r = tally(traces);
if (asJson) console.log(JSON.stringify(r, null, 2));
else {
  console.log(`${r.runs} runs, ${r.overclaimed} overclaimed`);
  console.log('code | refused | with tryInstead | sent next | next ok');
  for (const [code, c] of Object.entries(r.codes).sort((a, b) => b[1].refused - a[1].refused)) {
    console.log(`${code} | ${c.refused} | ${c.withTry} | ${c.sentNext} | ${c.nextOk}`);
  }
  console.log('validate issues on finished builds:', Object.keys(r.issues).length ? JSON.stringify(r.issues) : 'none');
}
