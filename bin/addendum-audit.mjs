#!/usr/bin/env node
// Addendum data: grader audit of held-out2 passes on the eval-final arm (A7 base).
// The sample is drawn by rule (the 48 brief ids sorted, every third from the first, and for
// each the first passing eval-final run by round); the verdicts are a reviewer agent's hand
// reading of each run's trace and stills (validation round 1 of
// docs/plans/2026-11-03-promote-heldout2.md), one confirmed by eye (tape-in-drawer).
// Hand-tabulated, like D7: the code draws the sample and computes the intervals only.
//   node bin/addendum-audit.mjs [--write]   (--write: docs/data/addendum/heldout2-audit.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, readJson, wilson } from './addendum-lib.mjs';

const BASE = ['suite-2026-11-03T06-59-11-872Z', 'suite-2026-11-03T08-06-46-953Z', 'suite-2026-11-03T08-45-28-941Z'];
const VERDICTS = {
  'h2-g-bay-shelf': ['true', 'three bases with a bay filling the corner; visible'],
  'h2-g-cable-dock': ['true', 'cable cover on top; the port is in the trace, not visible in the still'],
  'h2-g-field-kit': ['unsure', 'handle, drawer and bin present; LOOSE_BODY warning on the drawer cell of a kit meant to be carried'],
  'h2-g-paint-rack': ['true', 'two storeys, three bins on top'],
  'h2-g-pegboard-panel': ['false', 'probable: keyholes and the pencil bin on the same slot index, so the bin faces the wall; checks count BOM lines only'],
  'h2-g-porch-riser': ['true', 'PVC-bore bin, riser, soil'],
  'h2-g-seedling-row': ['true', 'three soil cells, three young plants'],
  'h2-g-studio-tower': ['true', 'drawers on the ground storey, bins on top'],
  'h2-t1-goggles-hang': ['true', 'goggles hang by the strap on a side hook beside the bin'],
  'h2-t1-upright-drivers': ['false', 'the agent reported handle-up unmet and the still shows the blades up; the implicit compromise outcome passes it'],
  'h2-t2-tape-in-drawer': ['false', 'tape measure on the floor beside a closed drawer (x 187.5 mm), claimed inside; confirmed by eye on still-0'],
  'h2-t3-lean-planter': ['true', 'four parts, two soil bins'],
  'h2-t4-handsome-organizer': ['true', 'two bins; the looks requirement honestly reported unmet'],
  'h2-t4-sturdy-tower': ['true', 'two storeys; strength honestly marked partial'],
  'h2-t5-mug-handle-front': ['false', 'handle points sideways (yawDeg 0 is +x, front is +z), claimed front; no orientation check'],
  'h2-t6-craft-cart': ['unsure', 'structure as asked; evidence says the book is in a drawer, both stills show it on top'],
};

const ids = readJson(join(root, 'evals/briefs-heldout2.json')).map((b) => b.id).sort();
const sampleIds = ids.filter((_, i) => i % 3 === 0);
const sample = sampleIds.map((id) => {
  for (const s of BASE) {
    const re = readJson(join(root, 'runs', s, 'rescore-0c840bc.json'));
    const sum = readJson(join(root, 'runs', s, 'summary.json'));
    const row = re.rows.find((r) => r.id === id && r.after);
    if (row) {
      const trace = sum.rows.find((r) => r.id === id && r.attempt === row.attempt)?.trace;
      const [verdict, why] = VERDICTS[id] ?? [null, 'not read'];
      return { id, suite: s, run: trace?.split('/')[0] ?? null, strict: row.strict ?? null, verdict, why };
    }
  }
  return { id, suite: null, run: null, verdict: null, why: 'no passing eval-final run' };
});
const n = sample.length, k = (v) => sample.filter((x) => x.verdict === v).length;
const out = {
  generatedBy: 'bin/addendum-audit.mjs',
  addendum: 'after the paper gate; not part of the submitted numbers',
  kind: 'hand-tabulated verdicts (reviewer agent reading traces and stills; one confirmed by eye); sample and intervals by code',
  rule: 'held-out2 brief ids sorted, every third from the first; first passing eval-final run by round',
  sampled: n, falsePass: k('false'), unsure: k('unsure'), truePass: k('true'),
  falsePassWilson95: wilson(k('false'), n), falseOrUnsureWilson95: wilson(k('false') + k('unsure'), n),
  causes: ['implicit compromise outcome passes a run with a core requirement reported unmet', 'prop checks test presence, not place', 'no orientation check', 'face of a part not checked'],
  sample,
};
console.log(JSON.stringify(out, null, 2));
if (process.argv.includes('--write')) writeFileSync(join(root, 'docs/data/addendum/heldout2-audit.json'), JSON.stringify(out, null, 2) + '\n');
