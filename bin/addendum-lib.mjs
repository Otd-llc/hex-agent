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
        costUsd: row.costUsd ?? t?.usage?.costUsd ?? null, calls: t?.usage?.calls ?? null, pageBuild: t?.pageBuild ?? null, contract: t?.contractHash?.slice(0, 8) ?? null,
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
    // Undefined when an arm has no variance across briefs.
    correlation: sd(xa, ma) * sd(xb, mb) ? +(cov / (sd(xa, ma) * sd(xb, mb))).toFixed(2) : null, minDetectablePoints: c ? pct((c.value + 0.842) * se) : null,
    perBrief: Object.fromEntries(ids.map((k, i) => [k, { a: A.get(k), b: B.get(k), diff: +d[i].toFixed(2) }])) };
}
// Wilson 95% interval for k of n, in percent.
export function wilson(k, n, z = 1.96) {
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z / d) * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [pct(c - h), pct(c + h)];
}
// Pass rate clustered by brief, the paper's estimator (bin/presentation-data.mjs clustered):
// the mean of per-brief means, SE = sd of those means / sqrt(briefs). pooledPct is passed/runs,
// which differs when briefs have unequal runs. No interval when every brief mean is equal
// (a zero-width interval is not reported, statistics.md section 2).
export function clustered(rs, f = (r) => r.pass) {
  const items = [...byBrief(rs, f).values()].map(mean);
  const B = items.length, mu = mean(items);
  const n = rs.length, k = rs.filter(f).length;
  const se = B > 1 ? Math.sqrt(items.reduce((a, x) => a + (x - mu) ** 2, 0) / (B - 1) / B) : null;
  const c = se ? critOrNull(B) : null;
  return { runs: n, passed: k, pct: pct(mu), pooledPct: pct(k / n), briefs: B, ci95Pct: c ? [pct(Math.max(0, mu - c.value * se)), pct(Math.min(1, mu + c.value * se))] : null, crit: c?.name ?? null };
}
