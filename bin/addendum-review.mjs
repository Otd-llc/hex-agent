#!/usr/bin/env node
// Addendum data: Meta Muse models as the demo-run reviewer beside D8 (the Claude
// reviewer agents' verdicts, docs/data/demo-review.json), on the 41 runs D8 judged.
// Per pass: the 2x2 of DROP against not DROP, and how many of D8's named faults the
// Muse answer mentions on the runs D8 says have them (a keyword match on its notes
// and contradicted list, not a hand reading).
//   node bin/addendum-review.mjs [--write]   (--write: docs/data/addendum/review-meta.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/ledger.mjs';
import { wilson } from './addendum-lib.mjs';
import { critOrNull } from './stats.mjs';

const d8 = JSON.parse(readFileSync(join(ROOT, 'docs/data/demo-review.json'), 'utf8'));
const PASSES = {
  'muse-spark-1.3': [['runs/meta-review-muse-spark-1.3-2026-11-03T05-46-53-852Z.json'], ['runs/meta-review-muse-spark-1.3-2026-11-03T05-54-23-614Z.json']],
  // Pass 1 lost 8 runs to Meta errors; they were asked again with the same prompt (the fill file).
  'muse-wonder-1.0': [['runs/meta-review-muse-wonder-1.0-2026-11-03T06-06-29-351Z.json', 'runs/meta-review-muse-wonder-1.0-2026-11-03T06-26-06-837Z.json'], ['runs/meta-review-muse-wonder-1.0-2026-11-03T06-18-53-485Z.json']],
};
// D8's named faults: the runs whose D8 note names it (d8), and the words a requirement in
// the Muse answer's contradicted list must hold to count (muse). Only the contradicted list
// counts: a note can name the thing while missing the fault ("tweezers visible").
// quadArmsClaim is the claim D8's summary records on every drone v5 report (the runs
// whose note names the multimeter), not a D8 fault verdict.
const FAULTS = {
  facingAway: { d8: /fac\w* away|face away|faces away|away from (the )?(default )?camera|tall row/i, muse: /fac\w*|view|camera/i },
  drawersBackwards: { d8: /drawers? (face|facing|open\w*) (the )?back|backwards/i, muse: /drawer/i },
  tweezersOnRim: { d8: /tweezer/i, muse: /tweezer/i },
  multimeterOnEnd: { d8: /multimeter/i, muse: /multimeter/i },
  strayRods: { d8: /stray rod|rod stub/i, muse: /\brods?\b/i },
  quadArmsClaim: { d8: /multimeter/i, muse: /quad/i },
};
const isDrop = (v) => v === 'DROP';
const out = { generatedBy: 'bin/addendum-review.mjs', addendum: 'after the paper gate; not part of the submitted numbers', reference: 'D8 docs/data/demo-review.json (Claude reviewer agents)', runs: 0, d8Drop: 0, models: {} };
const ids = Object.keys(d8).filter((k) => k !== 'summary' && d8[k].verdict !== 'HOST CUT');
out.runs = ids.length;
out.d8Drop = ids.filter((k) => isDrop(d8[k].verdict)).length;
out.faultRuns = Object.fromEntries(Object.entries(FAULTS).map(([f, p]) => [f, ids.filter((k) => p.d8.test(d8[k].note ?? '')).length]));
for (const [model, passes] of Object.entries(PASSES)) {
  out.models[model] = passes.map((files) => {
    const by = new Map();
    let spent = 0;
    for (const f of files) {
      const j = JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
      spent += j.spentUsd;
      for (const r of j.results) if (r.verdict) by.set(r.id, r);
    }
    const m = { files, spentUsd: +spent.toFixed(2), answered: 0, dropCaught: 0, dropMissed: 0, keepDropped: 0, keepKept: 0, verdictSame: 0, faultsMentioned: {} };
    for (const k of ids) {
      const r = by.get(k);
      if (!r) continue;
      m.answered++;
      const a = isDrop(d8[k].verdict), b = isDrop(r.verdict);
      if (a && b) m.dropCaught++; else if (a) m.dropMissed++; else if (b) m.keepDropped++; else m.keepKept++;
      if (r.verdict === d8[k].verdict) m.verdictSame++;
    }
    for (const [f, p] of Object.entries(FAULTS)) {
      const runs = ids.filter((k) => p.d8.test(d8[k].note ?? '') && by.has(k));
      const hit = (k) => (by.get(k).contradicted ?? []).some((c) => p.muse.test(String(c)));
      m.faultsMentioned[f] = { runs: runs.length, contradicted: runs.filter(hit).length, ids: runs.filter(hit) };
    }
    m.dropAgreement = m.answered ? +((m.dropCaught + m.keepKept) / m.answered * 100).toFixed(1) : null;
    m.dropAgreementWilson95 = m.answered ? wilson(m.dropCaught + m.keepKept, m.answered) : null;
    // Paired by run against keeping every run: per run, Muse agrees with D8 (1/0) minus keep-every-run agrees (D8 not DROP).
    {
      const d = ids.filter((k) => by.has(k)).map((k) => ((isDrop(d8[k].verdict) === isDrop(by.get(k).verdict)) ? 1 : 0) - (isDrop(d8[k].verdict) ? 0 : 1));
      const n = d.length, mu = d.reduce((a, b) => a + b, 0) / n, se = Math.sqrt(d.reduce((a, x) => a + (x - mu) ** 2, 0) / (n - 1) / n), c = critOrNull(n);
      m.minusKeepEveryRun = { runs: n, museOnly: d.filter((x) => x > 0).length, keepOnly: d.filter((x) => x < 0).length, diffPoints: +(mu * 100).toFixed(1),
        ci95Points: c ? [+((mu - c.value * se) * 100).toFixed(1), +((mu + c.value * se) * 100).toFixed(1)] : null, crit: c?.name ?? null };
    }
    return m;
  });
}
// Saying "not DROP" to every run, for scale.
out.allKeepAgreement = +((out.runs - out.d8Drop) / out.runs * 100).toFixed(1);
console.log(JSON.stringify(out, null, 2));
if (process.argv.includes('--write')) writeFileSync(join(ROOT, 'docs/data/addendum/review-meta.json'), JSON.stringify(out, null, 2) + '\n');
