#!/usr/bin/env node
// Addendum data: which briefs prescribe the layout at coordinate level. A brief counts when
// its text names a q/r cell, a slot index, a part id or drawer key, a construction tool
// (addAxle, hang_spools, fill_compartments) or a numeric yaw. Counts and ids only; the
// first held-out set is not read (it is never opened outside its one run).
//   node bin/addendum-prescription.mjs [--write]   (--write: docs/data/addendum/prescription.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/ledger.mjs';

export const PRESCRIBED = /\bq\s*-?\d|\br\s*-?\d|\bslot\s*\d|hex-[a-z]|\(key [a-z]\)|addAxle|hang_spools|fill_compartments|yawDeg/i;
const SETS = {
  development: ['evals/briefs.json', 'evals/briefs-hard.json', 'evals/briefs-wide.json'],
  heldout2: ['evals/briefs-heldout2.json'],
  demo: ['evals/briefs-demo.json'],
};
// A brief that names a part only to test that the agent refuses it does not prescribe a layout.
const NEGATIVE_TEST = new Set(['nonexistent-part']);
const out = { generatedBy: 'bin/addendum-prescription.mjs', addendum: 'after the paper gate; not part of the submitted numbers', regex: String(PRESCRIBED), negativeTestsExcluded: [...NEGATIVE_TEST], sets: {} };
for (const [set, files] of Object.entries(SETS)) {
  const briefs = files.flatMap((f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8')));
  const prescribed = briefs.filter((b) => PRESCRIBED.test(b.brief) && !NEGATIVE_TEST.has(b.id)).map((b) => b.id);
  out.sets[set] = { briefs: briefs.length, prescribed: prescribed.length, ids: prescribed };
}
console.log(JSON.stringify(out, null, 2));
if (process.argv.includes('--write')) writeFileSync(join(ROOT, 'docs/data/addendum/prescription.json'), JSON.stringify(out, null, 2) + '\n');
