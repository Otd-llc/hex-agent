// The numbers behind the results page (data presentation steps 3-4), all from the suite
// files: the headline series (Muse, the fixed 36 briefs, default arm, one point per batch),
// the effort table, and the per-host call measurements for the provider table. Scores are
// the newest rescore (src/runkey.mjs rescoreFiles), so one grader throughout. Runs the
// budget refused or the model host cut short are left out of the rate and counted apart.
//   node bin/presentation-data.mjs [--write]   (--write: docs/data/presentation.json)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { budgetCut, infraCut, rescoreFiles, armOf } from '../src/runkey.mjs';
import { critOrNull } from './stats.mjs';
import { outcomeOf } from '../src/checks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// Wilson 95% interval for k of n: spread only, not a test.
function wilson(k, n) {
  if (!n) return null;
  const z = 1.96, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [+(c - h).toFixed(4), +(c + h).toFixed(4)];
}
const pct = (x) => Math.round(x * 1000) / 10;

// Repeats of one brief are not independent (Miller 2024, "Adding Error Bars to Evals"):
// average within each brief first, then a standard error over briefs.
function byBrief(done, f) {
  const m = new Map();
  for (const r of done) { const a = m.get(r.id) ?? []; a.push(f(r) ? 1 : 0); m.set(r.id, a); }
  return m;
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function clustered(done, f) {
  const items = [...byBrief(done, f).values()].map(mean);
  const B = items.length, mu = mean(items);
  const se = B > 1 ? Math.sqrt(items.reduce((a, x) => a + (x - mu) ** 2, 0) / (B - 1) / B) : null;
  // t with briefs-1 df below 30 briefs; no interval below 10 (per-brief scores only).
  const c = se == null ? null : critOrNull(B);
  return { briefs: B, mean: pct(mu), se: se == null ? null : pct(se), crit: c?.name ?? null, ci: c == null ? null : [+Math.max(0, mu - c.value * se).toFixed(4), +Math.min(1, mu + c.value * se).toFixed(4)] };
}
// Per-brief passes, for sets too small for an interval and for the held-out table.
const perBrief = (done) => Object.fromEntries([...byBrief(done, (r) => r.pass)].map(([id, a]) => [id, `${a.filter(Boolean).length}/${a.length}`]));
// pass^k: the share of briefs whose every repeat passed (consistency, tau-bench).
const passAll = (done) => { const v = [...byBrief(done, (r) => r.pass).values()]; return { briefs: v.length, k: Math.min(...v.map((a) => a.length)), allPassed: v.filter((a) => a.every(Boolean)).length }; };
const q = (xs, f) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * f))] : null; };

// Every row of the named suites, scored by the newest rescore.
function rows(suites, { anyArm = false } = {}) {
  const out = [];
  const arms = new Set();
  for (const id of suites) {
    const dir = join(root, 'runs', id);
    const s = readJson(join(dir, 'summary.json'));
    // Rates never pool arms: a feature switched off (summary.features) is a different agent.
    // Host latency (calls) may: it measures the host, not the agent.
    arms.add(armOf(s) || 'default');
    if (!anyArm && arms.size > 1) throw new Error(`refusing to pool arms ${[...arms].join(' / ')} (${suites.join(', ')})`);
    const re = rescoreFiles(dir)[0];
    const by = new Map((re?.rows ?? []).map((r) => [`${r.id}#${r.attempt}`, r]));
    for (const row of s.rows) {
      const tp = row.trace ? join(dir, row.trace) : null;
      const t = tp && existsSync(tp) ? readJson(tp) : null;
      const r = by.get(`${row.id}#${row.attempt}`);
      out.push({ suite: id, arm: armOf(s) || 'default', grader: re?.graderCommit?.slice(0, 7) ?? 'as run', id: row.id, row, t,
        // A harness error (the page never answered, the run never started) is not a result either.
        cut: budgetCut(row, t) ? 'budget' : row.infra === 'harness' || row.error ? 'harness' : infraCut(row, t) ? 'host' : null,
        pass: r ? r.after : row.pass, strict: r ? r.strict : row.strict, overclaimed: r?.overclaimed ?? row.overclaimed, first: row.pass });
    }
  }
  return out;
}

function score(suites) {
  const all = rows(suites);
  const done = all.filter((r) => !r.cut);
  const n = done.length;
  const k = (f) => done.filter(f).length;
  const passed = k((r) => r.pass), strict = k((r) => r.strict), over = k((r) => r.overclaimed);
  const tc = done.filter((r) => r.id === 'two-clusters');
  const uniq = (xs) => [...new Set(xs.filter(Boolean))];
  return {
    suites, graders: uniq(all.map((r) => r.grader)),
    briefs: new Set(all.map((r) => r.id)).size,
    attempted: all.length, completed: n, hostCut: all.filter((r) => r.cut === 'host').length, budgetCut: all.filter((r) => r.cut === 'budget').length, harnessCut: all.filter((r) => r.cut === 'harness').length,
    passed, passRate: pct(passed / n), passCI: wilson(passed, n),
    strict, strictRate: pct(strict / n),
    overclaimed: over, overclaimRate: pct(over / n), overclaimCI: wilson(over, n),
    // The interval to show: clustered by brief when a brief ran more than once, else Wilson.
    // One run per brief: clustering adds nothing and is degenerate at k = n, so Wilson.
    ...(Math.max(...[...byBrief(done, () => true).values()].map((a) => a.length)) > 1
      ? { passClustered: clustered(done, (r) => r.pass), overclaimClustered: clustered(done, (r) => r.overclaimed), intervalMethod: 'clustered by brief' }
      : { intervalMethod: 'Wilson over runs (one run per brief)' }),
    passAllRepeats: passAll(done),
    firstScored: k((r) => r.first),
    // What the passes were: builds, compromises (some requirement reported not met), declines.
    passedBy: Object.fromEntries(['built', 'compromise', 'declined'].map((o) => [o, k((r) => r.pass && outcomeOf(r.t?.finish, r.t?.verdict?.nodes ?? 0) === o)])),
    twoClusters: { completed: tc.length, passed: tc.filter((r) => r.pass).length },
    withoutTwoClusters: { completed: n - tc.length, passed: passed - tc.filter((r) => r.pass).length, passRate: pct((passed - tc.filter((r) => r.pass).length) / (n - tc.length)) },
    callsPerRun: +(done.reduce((a, r) => a + (r.row.calls ?? 0), 0) / n).toFixed(1),
    // 6 dp, so a table cell rounds once (to 3 dp) from the mean and ratios use the mean itself.
    tokenCostPerRun: +(done.reduce((a, r) => a + (r.row.costUsd ?? 0), 0) / n).toFixed(6),
    contract: uniq(all.map((r) => r.t?.contractHash?.slice(0, 8))),
    pageBuild: uniq(all.map((r) => r.t?.pageBuild?.replace(/^\/assets\/hex-|\.js$/g, ''))),
    agentCommit: uniq(all.map((r) => r.t?.agent?.commit?.slice(0, 7))),
    prompt: uniq(all.map((r) => r.t?.agent?.promptSha256?.slice(0, 8))),
    featureArm: uniq(all.map((r) => r.arm))[0],
    model: uniq(all.map((r) => r.t?.model)),
  };
}

// Per-host call measurements: latency of answered calls, and calls the host did not answer.
function calls(suites) {
  const ms = [], failed = { calls: 0, timeouts: 0, http5xx: 0 };
  let answered = 0, runs = 0, hostCut = 0;
  for (const r of rows(suites, { anyArm: true })) {
    runs++;
    if (r.cut === 'host') hostCut++;
    for (const e of r.t?.events ?? []) {
      if (e.type === 'model') { answered++; ms.push(e.http?.ms); }
      if (e.type === 'model_error') {
        failed.calls++;
        if (e.http?.error === 'TimeoutError' || /timeout/i.test(e.message ?? '')) failed.timeouts++;
        if ((e.status ?? e.http?.status) >= 500) failed.http5xx++;
      }
    }
  }
  return { suites: suites.length, runs, hostCutRuns: hostCut, answeredCalls: answered, failedCalls: failed, failedShare: pct(failed.calls / (answered + failed.calls)), p50Ms: q(ms, 0.5), p95Ms: q(ms, 0.95), maxMs: q(ms, 1) };
}

const S = (...ids) => ids.map((i) => `suite-2026-${i}`);
// The headline: Muse Spark Open, the fixed 36 briefs (core 12 + hard 8 + wide 16), default
// arm (interactive, default features), one point per batch. Arms with a feature switched on
// and the high-effort arm are left out here (effort has its own table).
const points = [
  { key: 'p1', label: '10-27', host: 'Baseten', effort: 'low', repeat: 5, site: 'F7+F6 deploy (contract 2b45909b)', suites: S('10-27T21-16-46-607Z', '10-27T21-25-34-899Z', '10-27T21-33-36-525Z'), source: 'EVALUATION.md "Interactive vs plan-then-batch"' },
  { key: 'p2', label: '10-31', host: 'Baseten', effort: 'low', repeat: 5, site: 'release d2fd3dad (viz 3883270)', suites: S('10-31T23-34-54-038Z', '10-31T23-56-12-742Z', '11-01T00-10-13-895Z'), source: 'EVALUATION.md "The 36 briefs on the live release"' },
  { key: 'p3', label: '11-01 a', host: 'Baseten', effort: 'low', repeat: 5, site: '238e6282 (viz d95cb0e)', suites: S('11-01T02-44-38-094Z', '11-01T03-01-24-461Z', '11-01T03-13-19-636Z'), source: 'EVALUATION.md "The 36 briefs on 238e6282"' },
  { key: 'p4', label: '11-01 b', host: 'Baseten', effort: 'low', repeat: 5, site: 'deploy 4, 76ea6455 (viz 812ce0d)', suites: S('11-01T05-17-59-801Z', '11-01T05-35-48-643Z', '11-01T05-48-28-754Z'), source: 'EVALUATION.md "The 36 briefs on 76ea6455"' },
  { key: 'p5', label: '11-01 c', host: 'Baseten', effort: 'low', repeat: 1, site: 'deploy 14, 08e63fab (viz 23dc4f8)', suites: S('11-01T23-05-41-873Z'), source: 'EVALUATION.md "Baseten control on deploy 14"', note: '31 of the 36 briefs (the five honesty-only negatives left out), one run each' },
  { key: 'p6', label: '11-02 S2', host: 'Modal', effort: 'low', repeat: 5, site: 'deploy 14, 08e63fab', suites: S('11-02T01-04-53-972Z'), source: 'docs/plans/2026-11-02-modal-review.md section 1' },
  { key: 'p7', label: '11-02 S3a', host: 'Modal', effort: 'low', repeat: 5, site: 'deploy 14, 08e63fab', suites: S('11-02T01-43-22-121Z'), source: 'docs/plans/2026-11-02-modal-review.md section 1' },
  { key: 'p8', label: '11-02 SB', host: 'Modal', effort: 'low', repeat: 5, site: 'deploy 14, 08e63fab', suites: S('11-02T02-54-22-767Z'), source: 'docs/plans/2026-11-02-modal-review.md section 1' },
  { key: 'p9', label: '11-02 F1', host: 'Fireworks', effort: 'low', repeat: 1, site: 'deploy 15, 87827f4d (viz 32e5bdd)', suites: S('11-02T05-57-28-000Z'), source: 'EVALUATION.md "Fireworks F0 and F1"', note: '5 of 36 runs lost to host hangs, left out of the rate' },
  // Muse Spark 1.3 through the Meta Model API: Meta's hosted model, not the open weights above.
  { key: 'p10', label: '11-02 M1', host: 'Meta Model API', model: 'muse-spark-1.3', effort: 'low', repeat: 1, site: 'deploy 15b, da0834cc (viz d726540)', suites: S('11-02T11-31-12-330Z'), source: 'EVALUATION.md "Meta Model API, first runs"' },
  // The frozen agent (tag eval-final, 0c840bc), five runs per brief.
  { key: 'p11', label: '11-02 M5', host: 'Meta Model API', model: 'muse-spark-1.3', effort: 'low', repeat: 5, site: 'deploy 15b, da0834cc (viz d726540)', suites: S('11-02T14-16-28-867Z'), source: 'EVALUATION.md "Meta Model API, the frozen agent"' },
].map((p) => ({ ...p, ...score(p.suites) }));

// The demo set (evals/briefs-demo.json, purpose demo, written for the video, not an evaluation):
// per brief, every run of every demo suite, so the video's "chosen from N runs" traces here.
const DEMO = S('11-02T18-42-02-972Z', '11-02T20-53-43-549Z', '11-02T21-45-05-881Z');
const demo = (() => {
  const all = rows(DEMO);
  const by = {};
  for (const r of all) {
    const b = (by[r.id] ??= { runs: 0, passed: 0, cut: 0 });
    b.runs++;
    if (r.cut) b.cut++;
    else if (r.pass) b.passed++;
  }
  return { suites: DEMO, runs: all.length, passed: all.filter((r) => !r.cut && r.pass).length, perBrief: by };
})();

// The held-out set on the frozen agent. x1 was pre-committed and is the headline; the owner
// decided the x4 after seeing x1 (RULES.md), so the pooled x5 is secondary, clustered by brief.
// Scored as run: rescore.mjs is never run on these dirs (a rescore would be a second column).
const HELDOUT_X1 = S('11-02T14-02-50-056Z'), HELDOUT_X4 = S('11-02T15-47-26-043Z');
// Two held-out themes were written with fixes 1 and 3 in view (modal-review.md, H1 themes 8 and 11).
const FIX_THEMED = ['ho-west-drawer', 'ho-two-groups-of-three'];
const heldoutScore = (suites) => {
  const done = rows(suites).filter((r) => !r.cut);
  const lessFix = done.filter((r) => !FIX_THEMED.includes(r.id));
  return { ...score(suites), perBrief: perBrief(done),
    withoutFixThemed: { left: FIX_THEMED, completed: lessFix.length, passed: lessFix.filter((r) => r.pass).length, passCI: wilson(lessFix.filter((r) => r.pass).length, lessFix.length) } };
};
const heldout = {
  model: 'muse-spark-1.3', effort: 'low', agent: 'eval-final (0c840bc)',
  x1: heldoutScore(HELDOUT_X1),
  x4: heldoutScore(HELDOUT_X4),
  pooledX5: heldoutScore([...HELDOUT_X1, ...HELDOUT_X4]),
  note: 'x1 pre-committed (headline, Wilson); x4 decided by the owner after seeing x1; pooled shown only with the interval clustered by brief',
};

// Muse Wonder 1.0: its own model, never pooled with or plotted beside the Spark 1.3 series.
const wonder = { model: 'muse-wonder-1.0', effort: 'low', ...score(S('11-02T17-48-59-000Z')) };

// What landed between points. who: configurator = One Thousand Drones' configurator (credited to it,
// not to this entry); agent = this entry's tool layer, prompt and guards; host = the model host changed.
const changes = [
  { between: ['p1', 'p2'], who: ['agent', 'configurator'], agent: 'honesty instructions + claimsInScope check; every configurator op and lookup (A72); compound dressing helpers (A99/A85); abstention on by default (A58); value lists from the contract (A86); migration to the release contract', configurator: 'batched release (viz 3883270, PR #144): props, soil, decks, refusal details, look views', source: 'EVALUATION.md sections from "Interactive vs plan" to "Release contract d2fd3dad"' },
  { between: ['p2', 'p3'], who: ['agent', 'configurator'], agent: 'fewest-parts prompt fix; tryInstead variants named in the prompt', configurator: '238e6282: lockJoints/capOpenFaces ok when the rule holds; prop tryInstead variants', source: 'EVALUATION.md "Contract 238e6282"' },
  { between: ['p3', 'p4'], who: ['agent', 'configurator'], agent: 'tryInstead line covers any refused op (43a2b59)', configurator: '6d9d39d2: cap/connector clash beside a cell drawer fixed (L10-L12); 76ea6455: KIND_MISMATCH_BELOW tryInstead, LOAD_ABOVE names the part, mount-spike hint (L14, L15, L20)', source: 'EVALUATION.md "Contract 6d9d39d2", "Contract 76ea6455"' },
  { between: ['p4', 'p5'], who: ['agent', 'configurator'], agent: 'audit fixes A1-A7, E1-E16 (helpers send the offered fix next, full offers with positions, stricter scope check)', configurator: 'deploys 5-14: BUSY waits (L6), offer positions (L13), replace-on-base steps (L21), route hop details (L22), spike refs (L24), refusal hints B1-B7/F1-F6', source: 'EVALUATION.md "Contract fcf4301c" to "Baseten control on deploy 14"; lane 1 notes' },
  { between: ['p5', 'p6'], who: ['host'], agent: 'guards only (6760826)', configurator: 'none (site frozen at deploy 14)', source: 'docs/plans/2026-11-02-modal-review.md' },
  { between: ['p6', 'p7'], who: [], agent: 'guards only (7b9b48a)', configurator: 'none', source: 'docs/plans/2026-11-02-modal-review.md' },
  { between: ['p7', 'p8'], who: [], agent: 'guards only (7d970de)', configurator: 'none', source: 'docs/plans/2026-11-02-modal-review.md' },
  { between: ['p8', 'p9'], who: ['host', 'agent', 'configurator'], agent: 'Modal review fixes 1-4 behind default-on flags (e/w drawers, rolled-back batches, base groups, verify), not measured apart; G0 grader batch (two-clusters reworded)', configurator: 'deploy 15 (viz 32e5bdd): Modal review fixes 1, 2, 3a, 3b, 4, 6, 9 (UNSUPPORTED steps, KIND_MISMATCH_ABOVE, rolled-back batch steps)', source: 'EVALUATION.md "Fireworks F0 and F1"; lane 1 note 2026-11-02T05:46Z' },
];

// Effort: same host, deploy and briefs, low against high.
const effort = [
  { arm: 'Modal low, core 36 x5 x3 (S2, S3a, SB)', ...score(S('11-02T01-04-53-972Z', '11-02T01-43-22-121Z', '11-02T02-54-22-767Z')), gpuCostPerRun: null },
  { arm: 'Modal high, core 36 x5 (SA)', ...score(S('11-02T02-09-20-221Z')), gpuCostPerRun: 0.100 },
  { arm: 'Modal low, demo set x1 (SC)', ...score(S('11-02T02-47-37-236Z')), gpuCostPerRun: 0.044 },
  { arm: 'Modal high, demo set x1 (SC)', ...score(S('11-02T02-50-06-766Z')), gpuCostPerRun: 0.077 },
  { arm: 'Baseten low, 20 briefs x3 (10-27 ablation)', ...score(S('10-27T19-05-33-370Z', '10-27T19-12-30-903Z')) },
  { arm: 'Baseten medium, 20 briefs x3 (10-27 ablation)', ...score(S('10-27T18-36-16-484Z', '10-27T18-44-52-272Z')) },
  { arm: 'Baseten high, 20 briefs x3 (10-27 ablation)', ...score(S('10-27T19-17-51-239Z', '10-27T19-28-29-596Z')) },
  // Meta Model API, muse-spark-1.3, deploy 15b; agent code identical in both arms (56ef72c and
  // ab0bfe4 differ only in docs and generators). The medium arm's magnetic-lid lost its page to a
  // harness error and was rerun at the same settings.
  { arm: 'Meta Model API low, 36 briefs x1', ...score(S('11-02T11-31-12-330Z')) },
  { arm: 'Meta Model API medium, 36 briefs x1', ...score(S('11-02T12-05-09-842Z', '11-02T12-28-45-889Z')) },
];
// Low against high on the same briefs: the per-brief difference in pass rate, its SE over
// briefs and 95% CI, and how correlated the two arms' brief scores are.
function paired(a, b, f = (r) => r.pass) {
  const A = byBrief(rows(a).filter((r) => !r.cut), f), Bm = byBrief(rows(b).filter((r) => !r.cut), f);
  const ids = [...A.keys()].filter((k) => Bm.has(k));
  const xa = ids.map((k) => mean(A.get(k))), xb = ids.map((k) => mean(Bm.get(k)));
  const d = ids.map((_, i) => xb[i] - xa[i]), md = mean(d);
  const se = Math.sqrt(d.reduce((s, x) => s + (x - md) ** 2, 0) / (d.length - 1) / d.length);
  const ma = mean(xa), mb = mean(xb);
  const cov = ids.reduce((s, _, i) => s + (xa[i] - ma) * (xb[i] - mb), 0);
  const sd = (xs, m) => Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0));
  const c = critOrNull(ids.length);
  return { briefs: ids.length, diffPoints: pct(md), sePoints: pct(se), crit: c?.name ?? null, ci95Points: c ? [pct(md - c.value * se), pct(md + c.value * se)] : null, correlation: +(cov / (sd(xa, ma) * sd(xb, mb) || 1)).toFixed(2) };
}
const effortPaired = {
  // Like with like: S3a and SA share agent commit 7b9b48a, host, deploy and briefs.
  modalHighMinusLowSameCommit: paired(S('11-02T01-43-22-121Z'), S('11-02T02-09-20-221Z')),
  // Variant only: the low arm pools S2, S3a, SB across three agent commits (guards only),
  // which breaks the comparison key; shown so the difference is visible, not as a result.
  modalHighMinusLowPooledLowVariant: paired(S('11-02T01-04-53-972Z', '11-02T01-43-22-121Z', '11-02T02-54-22-767Z'), S('11-02T02-09-20-221Z')),
  metaMediumMinusLow: paired(S('11-02T11-31-12-330Z'), S('11-02T12-05-09-842Z', '11-02T12-28-45-889Z')),
  basetenHighMinusLow: paired(S('10-27T19-05-33-370Z', '10-27T19-12-30-903Z'), S('10-27T19-17-51-239Z', '10-27T19-28-29-596Z')),
};

// GPU cost per run from the Modal review's efficiency lens: suite wall x $0.007888/s / runs.
// $0.007888/s is already the whole endpoint (4 B300 GPUs x $0.001972, src/uptime.mjs), so there
// is no further x 4; it is the list rate from the ledger, not the bill, and an estimate.
const gpuSource = 'docs/plans/2026-11-02-modal-review.md section 1 (S3a $0.068, SB $0.060, SA $0.100, SC $0.044 / $0.077; S2 not measured); hand-tabulated as suite wall x $0.007888/s (the 4-GPU endpoint rate) / runs, an estimate at list rate';

// Per host: every eval and smoke suite on that host (from the class file).
const classes = readJson(join(root, 'docs/data/suite-classes.json')).suites;
const index = readJson(join(root, 'docs/data/suite-index.json')).suites;
// One row per host and model: two models on one host are never one row.
const hostSuites = (prov, model) => index.filter((r) => r.provider === prov && (!model || r.model === model) && ['eval', 'smoke', 'heldout'].includes(classes[r.suite]?.class) && !r.noSummary).map((r) => r.suite);
const hosts = {
  Baseten: { ...calls(hostSuites('baseten')), latencyFrom: 'eval + smoke suites' },
  'Baseten (deploy 14 control only)': calls(S('11-01T23-05-41-873Z')),
  Modal: { ...calls(hostSuites('modal-dedicated')), latencyFrom: 'eval + smoke suites' },
  Fireworks: { ...calls(hostSuites('fireworks')), latencyFrom: 'eval + smoke suites' },
  'Meta Model API, muse-spark-1.3': { ...calls(hostSuites('meta', 'muse-spark-1.3')), latencyFrom: 'eval, held-out and smoke suites (the first smoke predates timing)' },
  'Meta Model API, muse-wonder-1.0': { ...calls(hostSuites('meta', 'muse-wonder-1.0')), latencyFrom: 'eval + smoke suites' },
};

// Evidence of Meta Model API use, from the traces of every classed Meta suite: calls, the model
// that served each call (the response's own model field), cached input share, and token-ledger
// cost (list prices x recorded tokens; an estimate until checked against the Meta console).
function metaUse() {
  const by = {};
  for (const suite of hostSuites('meta')) {
    // A row with no trace (a harness error before the first call) made no Meta call.
    for (const r of rows([suite]).filter((x) => x.t)) {
      const m = r.t.model;
      const u = (by[m] ??= { suites: new Set(), runs: 0, calls: 0, serverErrors: 0, servedBy: {}, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, tokenCostUsd: 0 });
      u.suites.add(suite); u.runs++; u.tokenCostUsd += r.row.costUsd ?? 0;
      const ev = r.t?.events ?? [];
      for (const [i, e] of ev.entries()) {
        if (e.type === 'model_error') {
          u.serverErrors++;
          // Retried successfully: an answered call follows the error in the same run.
          if (ev.slice(i + 1).some((x) => x.type === 'model')) u.serverErrorsThenAnswered = (u.serverErrorsThenAnswered ?? 0) + 1;
        }
        if (e.type !== 'model') continue;
        u.calls++;
        u.servedBy[e.servedBy ?? 'not recorded'] = (u.servedBy[e.servedBy ?? 'not recorded'] ?? 0) + 1;
        u.inputTokens += e.usage?.inputTokens ?? 0; u.cachedInputTokens += e.usage?.cachedInputTokens ?? 0;
        u.outputTokens += e.usage?.outputTokens ?? 0; u.reasoningTokens += e.usage?.reasoningTokens ?? 0;
      }
    }
  }
  return Object.fromEntries(Object.entries(by).map(([m, u]) => [m, { ...u, suites: u.suites.size, cachedShare: pct(u.cachedInputTokens / (u.inputTokens || 1)), tokenCostUsd: +u.tokenCostUsd.toFixed(2) }]));
}

const data = { generatedAt: new Date().toISOString(), method: 'newest rescore per suite (one grader), except the held-out suites, scored as run; host-, harness- and budget-cut runs left out of rates; arms (summary.features) are never pooled; the interval to report is passClustered / overclaimClustered (95%, clustered by brief, t with briefs-1 df below 30 briefs, crit names it, none below 10 briefs) when a brief ran more than once, else Wilson over runs (intervalMethod names which); passCI and overclaimCI are Wilson over runs for every point and are too narrow when briefs repeat; paired differences use the same t rule; tokenCostPerRun is a token-equivalent mean, unrounded to 6 dp', points, heldout, wonder, demo, changes, effort, effortPaired, gpuSource, hosts, metaUse: metaUse() };
if (process.argv.includes('--write')) writeFileSync(join(root, 'docs/data/presentation.json'), JSON.stringify(data, null, 2) + '\n');
for (const p of points) console.log(`${p.key} ${p.label.padEnd(9)} ${p.host.padEnd(9)} ${p.passed}/${p.completed} (${p.passRate}%, CI ${p.passCI.map(pct).join('-')}) strict ${p.strictRate}% over ${p.overclaimed} (${p.overclaimRate}%) first ${p.firstScored} hostCut ${p.hostCut} w/o 2c ${p.withoutTwoClusters.passRate}% graders ${p.graders} agent ${p.agentCommit.join(',')} contract ${p.contract.join(',')}`);
for (const e of effort) console.log(`${e.arm.padEnd(46)} ${e.passed}/${e.completed} (${e.passRate}%) strict ${e.strictRate}% over ${e.overclaimed} calls/run ${e.callsPerRun} tok$/run ${e.tokenCostPerRun}`);
for (const [h, c] of Object.entries(hosts)) console.log(h.padEnd(34), JSON.stringify(c));
for (const p of points.filter((q) => q.passClustered)) console.log(`${p.key} clustered pass ${p.passClustered.mean}% SE ${p.passClustered.se} CI ${p.passClustered.ci?.map(pct).join('-')} | over ${p.overclaimClustered.mean}% CI ${p.overclaimClustered.ci?.map(pct).join('-')} | pass^${p.passAllRepeats.k} ${p.passAllRepeats.allPassed}/${p.passAllRepeats.briefs}`);
console.log(JSON.stringify(effortPaired));
