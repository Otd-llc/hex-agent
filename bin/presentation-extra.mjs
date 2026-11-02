// Second half of bin/presentation-data.mjs (run it after that one): the figures the paper
// needs that presentation.json lacks: a same-commit effort pair, paired differences between
// consecutive default batches, power (2.8 x SE), cost ratios, the range of group rates,
// abstention and honesty arms. Same scoring rules as presentation-data.mjs (newest rescore,
// host- and budget-cut runs left out). Started as the paper's read-only companion script.
//   node bin/presentation-extra.mjs [--write]   (--write: docs/data/presentation-extra.json)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { budgetCut, infraCut, rescoreFiles } = await import(pathToFileURL(join(root, 'src/runkey.mjs')).href);
const { critOrNull } = await import(pathToFileURL(join(root, 'bin/stats.mjs')).href);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const pct = (x) => Math.round(x * 1000) / 10;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function rows(suites) {
  const out = [];
  for (const id of suites) {
    const dir = join(root, 'runs', id);
    const s = readJson(join(dir, 'summary.json'));
    const re = rescoreFiles(dir)[0];
    const by = new Map((re?.rows ?? []).map((r) => [`${r.id}#${r.attempt}`, r]));
    for (const row of s.rows) {
      const tp = row.trace ? join(dir, row.trace) : null;
      const t = tp && existsSync(tp) ? readJson(tp) : null;
      const r = by.get(`${row.id}#${row.attempt}`);
      if (budgetCut(row, t) || infraCut(row, t)) continue;
      out.push({ id: row.id, pass: r ? r.after : row.pass, over: r?.overclaimed ?? row.overclaimed });
    }
  }
  return out;
}
function byBrief(rs, f) { const m = new Map(); for (const r of rs) { const a = m.get(r.id) ?? []; a.push(f(r) ? 1 : 0); m.set(r.id, a); } return m; }
function paired(a, b, f = (r) => r.pass) {
  const A = byBrief(rows(a), f), B = byBrief(rows(b), f);
  const ids = [...A.keys()].filter((k) => B.has(k));
  const xa = ids.map((k) => mean(A.get(k))), xb = ids.map((k) => mean(B.get(k)));
  const d = ids.map((_, i) => xb[i] - xa[i]), md = mean(d);
  const se = Math.sqrt(d.reduce((s, x) => s + (x - md) ** 2, 0) / (d.length - 1) / d.length);
  const ma = mean(xa), mb = mean(xb);
  const cov = ids.reduce((s, _, i) => s + (xa[i] - ma) * (xb[i] - mb), 0);
  const sd = (xs, m) => Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0));
  // t with briefs-1 df below 30 briefs, no interval below 10 (bin/stats.mjs). Smallest true
  // difference detectable at 80% power: (critical value + 0.842) x SE, the 0.842 a normal
  // approximation of the power quantile.
  const c = critOrNull(ids.length);
  return { briefs: ids.length, diffPoints: pct(md), sePoints: pct(se), crit: c?.name ?? null, ci95Points: c ? [pct(md - c.value * se), pct(md + c.value * se)] : null,
    correlation: +(cov / (sd(xa, ma) * sd(xb, mb) || 1)).toFixed(2), minDetectablePoints: c ? pct((c.value + 0.842) * se) : null };
}
const S = (...ids) => ids.map((i) => `suite-2026-${i}`);
const P = {
  p1: S('10-27T21-16-46-607Z', '10-27T21-25-34-899Z', '10-27T21-33-36-525Z'),
  p2: S('10-31T23-34-54-038Z', '10-31T23-56-12-742Z', '11-01T00-10-13-895Z'),
  p3: S('11-01T02-44-38-094Z', '11-01T03-01-24-461Z', '11-01T03-13-19-636Z'),
  p4: S('11-01T05-17-59-801Z', '11-01T05-35-48-643Z', '11-01T05-48-28-754Z'),
  p6: S('11-02T01-04-53-972Z'), p7: S('11-02T01-43-22-121Z'), p8: S('11-02T02-54-22-767Z'),
  SA: S('11-02T02-09-20-221Z'),
};
const pres = readJson(join(root, 'docs/data/presentation.json'));
const pt = Object.fromEntries(pres.points.map((p) => [p.key, p]));
const eff = Object.fromEntries(pres.effort.map((e) => [e.arm, e]));
const x5 = ['p1', 'p2', 'p3', 'p4', 'p6', 'p7', 'p8'];
const low = eff['Modal low, core 36 x5 x3 (S2, S3a, SB)'], high = eff['Modal high, core 36 x5 (SA)'];
const out = {
  generatedBy: 'bin/presentation-extra.mjs over runs/ and docs/data/presentation.json',
  generatedAt: new Date().toISOString(),
  effortSameCommit: {
    note: 'Modal S3a (low) against SA (high): same host, site (deploy 14, 08e63fab), agent commit 7b9b48a and 36 briefs x5',
    passHighMinusLow: paired(P.p7, P.SA),
    overclaimHighMinusLow: paired(P.p7, P.SA, (r) => r.over),
  },
  effortPooledLow: {
    note: 'presentation.json modalHighMinusLow recomputed here, plus power and the overclaim pair',
    passHighMinusLow: paired([...P.p6, ...P.p7, ...P.p8], P.SA),
    overclaimHighMinusLow: paired([...P.p6, ...P.p7, ...P.p8], P.SA, (r) => r.over),
  },
  batchPairs: {
    note: 'exploratory: consecutive x5 default batches, and first against last; each pair differs in agent commit, configurator or host, so a difference is not attributable to one change',
    p1_p2: paired(P.p1, P.p2), p2_p3: paired(P.p2, P.p3), p3_p4: paired(P.p3, P.p4),
    p4_p6: paired(P.p4, P.p6), p6_p7: paired(P.p6, P.p7), p7_p8: paired(P.p7, P.p8),
    p1_p4_baseten: paired(P.p1, P.p4), p1_p8_first_last: paired(P.p1, P.p8),
  },
  rangeX5: {
    batches: x5,
    passRate: [Math.min(...x5.map((k) => pt[k].passRate)), Math.max(...x5.map((k) => pt[k].passRate))],
    overclaimRate: [Math.min(...x5.map((k) => pt[k].overclaimRate)), Math.max(...x5.map((k) => pt[k].overclaimRate))],
    strictRate: [Math.min(...x5.map((k) => pt[k].strictRate)), Math.max(...x5.map((k) => pt[k].strictRate))],
    passAllRepeats: [Math.min(...x5.map((k) => pt[k].passAllRepeats.allPassed)), Math.max(...x5.map((k) => pt[k].passAllRepeats.allPassed))],
    modalLowPassRate: [Math.min(pt.p6.passRate, pt.p7.passRate, pt.p8.passRate), Math.max(pt.p6.passRate, pt.p7.passRate, pt.p8.passRate)],
  },
  firstScoredMinusRescored: Object.fromEntries(x5.map((k) => [k, pt[k].firstScored - pt[k].passed])),
  costRatios: {
    tokenEqHighOverLowPooled: +(high.tokenCostPerRun / low.tokenCostPerRun).toFixed(2),
    tokenEqHighOverS3a: +(high.tokenCostPerRun / pt.p7.tokenCostPerRun).toFixed(2),
    gpuHighOverS3a: +(0.100 / 0.068).toFixed(2),
    callsHighOverLowPooled: +(high.callsPerRun / low.callsPerRun).toFixed(2),
    gpuSource: pres.gpuSource,
  },
};
// Abstention (A58 briefs x3, Baseten low, contract d2fd3dad): off against on, and each arm.
function wilson(k, n) { const z = 1.96, p = k / n, d = 1 + z * z / n; const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d; return [pct(c - h), pct(c + h)]; }
function arm(suites) {
  const rs = rows(suites), k = rs.filter((r) => r.pass).length, n = rs.length;
  const items = [...byBrief(rs, (r) => r.pass).values()].map(mean), B = items.length, mu = mean(items);
  const se = Math.sqrt(items.reduce((a, x) => a + (x - mu) ** 2, 0) / (B - 1) / B);
  const c = critOrNull(B);
  // Below 10 briefs: per-brief scores only, no interval of either kind.
  const perBrief = Object.fromEntries([...byBrief(rs, (r) => r.pass)].map(([id, a]) => [id, `${a.filter(Boolean).length}/${a.length}`]));
  return { briefs: B, passed: k, completed: n, passRate: pct(k / n), ...(c ? { clusteredCI: [pct(Math.max(0, mu - c.value * se)), pct(Math.min(1, mu + c.value * se))], crit: c.name, wilsonCI: wilson(k, n) } : { perBrief }), overclaimed: rs.filter((r) => r.over).length };
}
const OFF = S('10-31T23-19-12-846Z'), ON = S('10-31T23-27-37-267Z');
out.abstention = { note: 'A58 briefs (6) x3, Baseten low, contract d2fd3dad; suite-index agent ~3460cd6 (off) and ~826848e (on)', off: arm(OFF), on: arm(ON), onMinusOff: paired(OFF, ON) };
const HON = S('10-27T22-19-09-363Z', '10-27T22-21-26-250Z', '10-27T22-23-40-855Z');
out.honesty7 = { note: '7 honesty/injection briefs x5, Baseten low, contract 2b45909b', ...arm(HON) };
// Muse Spark 1.3 on the frozen agent (eval-final, 0c840bc), Meta Model API, effort low.
const M36X5 = S('11-02T14-16-28-867Z'), FIXES_OFF = S('11-02T16-56-59-857Z');
out.metaFixesOff = {
  note: 'harm test only: fixes 1 to 4 off (summary.features) on the 13 briefs they target, x5, against the same briefs in the 36x5 default runs; the default arm was at ceiling (5/5 each), so the design can show harm, not gain; the arms ran about 2.7 h apart, not interleaved; diff = off minus default',
  offMinusDefault: paired(M36X5, FIXES_OFF),
  off: arm(FIXES_OFF),
};
const M_ON = S('11-02T17-16-28-256Z'), M_OFF = S('11-02T17-22-33-831Z');
out.metaAbstention = {
  note: '6 A58 briefs x3 per arm, per-brief scores only; two confounds: the ABSTAIN block names 5 of the 6 briefs, and the off arm also removes the finish tool outcome field, so it cannot return declined; moving-clock is the unnamed brief',
  on: arm(M_ON), off: arm(M_OFF),
};
out.fireworksF1Wilson = wilson(31, 31);
out.basetenD14Wilson = wilson(30, 31);
const text = JSON.stringify(out, null, 2) + '\n';
if (process.argv.includes('--write')) writeFileSync(join(root, 'docs/data/presentation-extra.json'), text);
else process.stdout.write(text);
