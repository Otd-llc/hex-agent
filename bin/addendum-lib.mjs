// Scoring for the addendum generators: the same rules as bin/presentation-extra.mjs
// (newest rescore file per suite, host- and budget-cut runs left out, paired differences
// by brief with bin/stats.mjs intervals), copied here because that script writes D2 when
// imported. Addendum numbers never feed D1 to D8.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { budgetCut, infraCut, rescoreFiles } from '../src/runkey.mjs';
import { critOrNull } from './stats.mjs';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const pct = (x) => Math.round(x * 1000) / 10;
export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// One row per scored run: id, pass, overclaim, plus what the trace says about where it ran.
export function rows(suites, { rescore = true } = {}) {
  const out = [];
  for (const id of suites) {
    const dir = join(root, 'runs', id);
    const s = readJson(join(dir, 'summary.json'));
    const re = rescore ? rescoreFiles(dir)[0] : null;
    const by = new Map((re?.rows ?? []).map((r) => [`${r.id}#${r.attempt}`, r]));
    for (const row of s.rows) {
      const tp = row.trace ? join(dir, row.trace) : null;
      const t = tp && existsSync(tp) ? readJson(tp) : null;
      const r = by.get(`${row.id}#${row.attempt}`);
      if (budgetCut(row, t) || infraCut(row, t)) continue;
      out.push({ suite: id, id: row.id, attempt: row.attempt, pass: r ? r.after : row.pass, over: r?.overclaimed ?? row.overclaimed,
        costUsd: row.costUsd ?? t?.usage?.costUsd ?? null, calls: t?.counters?.modelCalls ?? null, pageBuild: t?.pageBuild ?? null, contract: t?.contractHash?.slice(0, 8) ?? null,
        agent: t?.agent?.commit?.slice(0, 7) ?? null, dirty: t?.agent?.dirty ?? null });
    }
  }
  return out;
}
export function byBrief(rs, f) { const m = new Map(); for (const r of rs) { const a = m.get(r.id) ?? []; a.push(f(r) ? 1 : 0); m.set(r.id, a); } return m; }
// b minus a, by brief, over briefs both arms ran.
export function pairedRows(ra, rb, f = (r) => r.pass, keep = () => true) {
  const A = byBrief(ra.filter((r) => keep(r.id)), f), B = byBrief(rb.filter((r) => keep(r.id)), f);
  const ids = [...A.keys()].filter((k) => B.has(k));
  const xa = ids.map((k) => mean(A.get(k))), xb = ids.map((k) => mean(B.get(k)));
  const d = ids.map((_, i) => xb[i] - xa[i]), md = mean(d);
  const se = Math.sqrt(d.reduce((s, x) => s + (x - md) ** 2, 0) / (d.length - 1) / d.length);
  const ma = mean(xa), mb = mean(xb);
  const cov = ids.reduce((s, _, i) => s + (xa[i] - ma) * (xb[i] - mb), 0);
  const sd = (xs, m) => Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0));
  const c = critOrNull(ids.length);
  return { briefs: ids.length, aPct: pct(ma), bPct: pct(mb), diffPoints: pct(md), sePoints: pct(se), crit: c?.name ?? null, ci95Points: c ? [pct(md - c.value * se), pct(md + c.value * se)] : null,
    correlation: +(cov / (sd(xa, ma) * sd(xb, mb) || 1)).toFixed(2), minDetectablePoints: c ? pct((c.value + 0.842) * se) : null,
    perBrief: Object.fromEntries(ids.map((k, i) => [k, { a: A.get(k), b: B.get(k), diff: +d[i].toFixed(2) }])) };
}
// Pass rate with a clustered-by-brief interval (the paper's rule).
export function clustered(rs, f = (r) => r.pass) {
  const B = byBrief(rs, f);
  const ids = [...B.keys()];
  const n = rs.length, k = rs.filter(f).length, p = k / n;
  const sums = ids.map((id) => B.get(id).reduce((a, b) => a + b, 0) - p * B.get(id).length);
  const se = Math.sqrt(sums.reduce((s, x) => s + x * x, 0)) / n * Math.sqrt(ids.length / (ids.length - 1));
  const c = critOrNull(ids.length);
  return { runs: n, passed: k, pct: pct(p), briefs: ids.length, ci95Pct: c ? [pct(Math.max(0, p - c.value * se)), pct(Math.min(1, p + c.value * se))] : null, crit: c?.name ?? null };
}
