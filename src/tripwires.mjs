// Tripwires for a measured batch (docs/plans/2026-11-02-fireworks-plan.md): checked after every
// finished run against the last checkpoint's summaries; the first that trips stops new runs, so the
// batch comes to a checkpoint early instead of spending on a broken system.
//   harness    browser/page failures over 5% of finished runs (at least 2)
//   regression a brief drops more than 20 points from the checkpoint AND that few passes would be
//              under 5% likely by chance (binomial, Bonferroni over the briefs, checkpoint rate smoothed)
//   cost       mean cost per scored run drifts more than 30% from the checkpoint (10+ runs)
//   refusal    a refusal code no checkpoint run ever saw, in 3+ runs (rare codes appear once by chance)
export const LIMITS = { harnessShare: 0.05, harnessMin: 2, regressionPts: 0.2, regressionMinRuns: 3, regressionAlpha: 0.05, costDrift: 0.3, costMinRuns: 10, refusalMinRuns: 3 };

// Rows that are results: not budget cuts, not harness errors, not host outages.
const scored = (rows) => rows.filter((r) => !r.budget && !r.error && !r.infra);
const harnessFailed = (r) => !!r.error && !r.budget;

export function baselineOf(summaries) {
  const rows = summaries.flatMap((s) => s.rows ?? []);
  const byBrief = {};
  for (const r of scored(rows)) (byBrief[r.id] ??= []).push(r.pass);
  const rate = Object.fromEntries(Object.entries(byBrief).map(([id, xs]) => [id, xs.filter(Boolean).length / xs.length]));
  // Laplace-smoothed, so one fail on a brief that always passed is not "impossible".
  const smoothed = Object.fromEntries(Object.entries(byBrief).map(([id, xs]) => [id, (xs.filter(Boolean).length + 1) / (xs.length + 2)]));
  const costs = scored(rows).map((r) => r.costUsd).filter((x) => Number.isFinite(x));
  const codes = new Set(rows.flatMap((r) => Object.keys(r.refusals ?? {})));
  return { rate, smoothed, costPerRun: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null, codes, runs: rows.length };
}

// P(X <= k) for X ~ Binomial(n, p).
export function binomCdf(k, n, p) {
  let c = 1, sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += c * p ** i * (1 - p) ** (n - i);
    c = (c * (n - i)) / (i + 1);
  }
  return sum;
}

export function tripped(rows, base, lim = LIMITS) {
  const done = rows.filter((r) => !r.budget);
  const h = done.filter(harnessFailed).length;
  if (h >= lim.harnessMin && h / done.length > lim.harnessShare) return `harness: ${h} of ${done.length} runs failed in the browser or page`;
  const s = scored(rows);
  const byBrief = {};
  for (const r of s) (byBrief[r.id] ??= []).push(r.pass);
  for (const [id, xs] of Object.entries(byBrief)) {
    const p0 = base.rate[id];
    if (p0 == null || xs.length < lim.regressionMinRuns) continue;
    const k = xs.filter(Boolean).length, p = k / xs.length;
    const chance = binomCdf(k, xs.length, base.smoothed[id]);
    if (p0 - p > lim.regressionPts && chance < lim.regressionAlpha / Object.keys(base.rate).length) {
      return `regression: ${id} ${Math.round(p * 100)}% over ${xs.length} runs, ${Math.round(p0 * 100)}% at the checkpoint (chance ${chance.toExponential(1)})`;
    }
  }
  if (base.costPerRun && s.length >= lim.costMinRuns) {
    const c = s.reduce((a, r) => a + (r.costUsd ?? 0), 0) / s.length;
    if (Math.abs(c - base.costPerRun) / base.costPerRun > lim.costDrift) return `cost: $${c.toFixed(4)} per run against $${base.costPerRun.toFixed(4)} at the checkpoint`;
  }
  const runsWith = {};
  for (const r of rows) for (const k of Object.keys(r.refusals ?? {})) if (!base.codes.has(k)) runsWith[k] = (runsWith[k] ?? 0) + 1;
  const fresh = Object.entries(runsWith).filter(([, n]) => n >= lim.refusalMinRuns).map(([k, n]) => `${k} (${n} runs)`);
  if (fresh.length) return `refusal: ${fresh.join(', ')} never seen at the checkpoint`;
  return null;
}
