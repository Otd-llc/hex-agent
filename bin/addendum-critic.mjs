#!/usr/bin/env node
// Addendum data: the A56 critic on Meta Muse models beside the Claude judges, on the
// same 60 builds the Claude judges saw (runs/sheets-round2, owner round 2 verdicts),
// scored with calibrate() on the same question subsets as the EVALUATION.md A56 table.
//   node bin/addendum-critic.mjs [--write]   (--write: docs/data/addendum/critic-meta.json)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ownerVerdicts, calibrate } from '../src/critic.mjs';
import { ROOT } from '../src/ledger.mjs';
import { wilson } from './addendum-lib.mjs';
import { critOrNull } from './stats.mjs';

const PICKS = 'C:/zzz/_premades/picks-round2.json';
const picksRaw = readFileSync(PICKS);
const owner = ownerVerdicts({ round2: JSON.parse(picksRaw) }).round2;
const load = (f) => ({ file: f, ...JSON.parse(readFileSync(join(ROOT, f), 'utf8')) });

const CLAUDE = ['runs/critic-2026-10-31T23-11-50-342Z.json', 'runs/critic-2026-10-31T23-26-07-605Z.json'];
const META = {
  'muse-spark-1.3': ['runs/critic-2026-11-03T05-34-28-257Z.json', 'runs/critic-2026-11-03T05-49-13-802Z.json'],
  // Both Wonder passes were stopped by Meta errors and resumed (--resume keeps the answers already given).
  'muse-wonder-1.0': ['runs/critic-2026-11-03T06-17-04-818Z.json', 'runs/critic-2026-11-03T07-02-48-072Z.json'],
};
const claude = CLAUDE.map(load);
const ledgerRows = readFileSync(join(ROOT, '.spend/meta.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const ledgerSpend = (model) => +ledgerRows.filter((r) => r.what === 'critic' && r.model === model).reduce((a, r) => a + (r.costUsd ?? 0), 0).toFixed(2);
// The builds the Claude judges answered: the comparison set.
const names = new Set(claude[0].results.filter((r) => r.complete).map((r) => r.name));
const SUBSETS = { purpose: ['purpose'], 'purpose+rests+pose': ['purpose', 'rests', 'pose'], rests: ['rests'], all: ['purpose', 'rests', 'pose', 'workZone'] };

// Keep only the subset's answers, on the comparison set.
const view = (results, qs) => results.filter((r) => names.has(r.name)).map((r) => ({ ...r, answers: Object.fromEntries(Object.entries(r.answers).filter(([q]) => qs.includes(q))) }));
// Paired by build against flagging nothing (which agrees exactly on the keeps): the judge's
// agreement minus flag-nothing's, per build, mean and z interval (60 builds). Builds where
// both agree or both disagree add 0; the difference comes from discordant builds only.
function vsFlagNothing(results, c) {
  const wrong = new Set(c.disagreements.map((d) => d.name));
  const d = results.filter((r) => owner.has(r.name) && r.complete).map((r) => (wrong.has(r.name) ? 0 : 1) - (owner.get(r.name).verdict === 'keep' ? 1 : 0));
  const n = d.length, m = d.reduce((a, b) => a + b, 0) / n;
  const se = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1) / n);
  const c95 = critOrNull(n);
  return { builds: n, judgeOnly: d.filter((x) => x > 0).length, flagNothingOnly: d.filter((x) => x < 0).length, diffPoints: +(m * 100).toFixed(1),
    ci95Points: c95 ? [+((m - c95.value * se) * 100).toFixed(1), +((m + c95.value * se) * 100).toFixed(1)] : null, crit: c95?.name ?? null };
}
const score = (results) => Object.fromEntries(Object.entries(SUBSETS).map(([k, qs]) => {
  const c = calibrate(view(results, qs), owner);
  return [k, { n: c.n, fixesCaught: c.fixFlagged, fixes: c.fixFlagged + c.fixMissed, keepsFlagged: c.keepFlagged, keeps: c.keepFlagged + c.keepPassed, agreement: c.agreement == null ? null : +(c.agreement * 100).toFixed(1),
    agreementWilson95: c.n ? wilson(c.agree, c.n) : null, minusFlagNothing: vsFlagNothing(view(results, qs), c) }];
}));
// Pass-to-pass stability: the share of (build, question) answers two passes give alike.
const stability = (a, b) => {
  const m = new Map(b.results.map((r) => [r.name, r]));
  let same = 0, n = 0;
  for (const r of a.results) {
    if (!names.has(r.name) || !m.has(r.name)) continue;
    for (const [q, x] of Object.entries(r.answers)) {
      const y = m.get(r.name).answers[q];
      if (x.answer && y?.answer) { n++; if (x.answer === y.answer) same++; }
    }
  }
  return { answersCompared: n, same, share: n ? +(same / n * 100).toFixed(1) : null };
};

const out = {
  generatedBy: 'bin/addendum-critic.mjs',
  addendum: 'after the paper gate; not part of the submitted numbers',
  ownerVerdicts: { file: PICKS, sha256: createHash('sha256').update(picksRaw).digest('hex'), round: 'round2' },
  comparisonSet: { sheets: 'runs/sheets-round2', builds: names.size },
  // For scale: a critic that flags nothing agrees on every keep and no fix.
  flagNothing: (() => {
    const v = [...names].map((n) => owner.get(n)).filter(Boolean);
    const keeps = v.filter((x) => x.verdict === 'keep').length;
    return { builds: v.length, keeps, fixes: v.length - keeps, agreement: +(keeps / v.length * 100).toFixed(1) };
  })(),
  judges: {},
};
for (const c of claude) out.judges[`${c.model} (${c.file.replace(/^runs\/|\.json$/g, '')})`] = { provider: 'anthropic', file: c.file, spentUsd: +c.spentUsd.toFixed(2), ...score(c.results) };
for (const [model, files] of Object.entries(META)) {
  const passes = files.map(load);
  if (!passes.length) continue;
  const missing = passes.map((p) => [...names].filter((n) => !p.results.some((r) => r.name === n && r.complete)).length);
  out.judges[model] = {
    provider: 'meta',
    passes: passes.map((p, i) => ({ file: p.file, unansweredInSet: missing[i], ...score(p.results) })),
    // From the Meta ledger's critic rows (all 74 sheets, every pass): a resumed pass file records only its last invocation.
    ledgerSpentUsd: ledgerSpend(model),
    ...(passes.length > 1 ? { stability: stability(passes[0], passes[1]) } : {}),
  };
}
console.log(JSON.stringify(out, null, 2));
if (process.argv.includes('--write')) writeFileSync(join(ROOT, 'docs/data/addendum/critic-meta.json'), JSON.stringify(out, null, 2) + '\n');
