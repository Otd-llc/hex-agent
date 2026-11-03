#!/usr/bin/env node
// Addendum data: Muse Wonder 1.0 on the frozen agent (eval-final), effort low.
// Held-out: its first and only run of the 18 held-out briefs (Wilson over runs, one run
// per brief, as the paper). Development: the paper's 36x1 suite plus four more repeats
// run after the gate, clustered by brief; provenance printed so a page change shows.
//   node bin/addendum-wonder.mjs [--write]   (--write: docs/data/addendum/wonder.json)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, rows, clustered, pct, wilson, byBrief } from './addendum-lib.mjs';

const HELDOUT = 'suite-2026-11-03T07-14-56-211Z';
const PAPER_DEV = 'suite-2026-11-02T17-48-59-000Z';
const NEW_DEV = 'suite-2026-11-03T07-37-42-191Z';
const prov = (rs) => ({ agent: [...new Set(rs.map((r) => r.agent))], dirty: [...new Set(rs.map((r) => r.dirty))], pageBuild: [...new Set(rs.map((r) => r.pageBuild))], contract: [...new Set(rs.map((r) => r.contract))] });
const ho = rows([HELDOUT], { rescore: false });
const hoPass = ho.filter((r) => r.pass).length;
const paperDev = rows([PAPER_DEV], { rescore: false });
const newDev = rows([NEW_DEV], { rescore: false });
const out = {
  generatedBy: 'bin/addendum-wonder.mjs',
  addendum: 'after the paper gate; not part of the submitted numbers',
  model: 'muse-wonder-1.0', effort: 'low',
  heldout: {
    suite: HELDOUT, runs: ho.length, passed: hoPass, pct: pct(hoPass / ho.length), wilson95Pct: wilson(hoPass, ho.length),
    fails: ho.filter((r) => !r.pass).map((r) => r.id),
    // The handle check misses the accessory handle (hex-acc-handle), the defect D6 documents for the Spark held-out run.
    note: 'scored as run, never rescored; ho-drawer-handle-side fails the family:handle check that misses an accessory handle (D6)',
    overclaims: ho.filter((r) => r.over).length,
    provenance: prov(ho),
  },
  dev: {
    paperSuite: PAPER_DEV, newSuite: NEW_DEV,
    paperX1: clustered(paperDev), newX4: clustered(newDev), allX5: clustered([...paperDev, ...newDev]),
    overclaimsX5: [...paperDev, ...newDev].filter((r) => r.over).length,
    // pass^k: briefs whose every one of the five runs passed.
    passAll5: (() => { const v = [...byBrief([...paperDev, ...newDev], (r) => r.pass).values()]; return { briefs: v.length, allPassed: v.filter((a) => a.length === 5 && a.every(Boolean)).length }; })(),
    fails: [...paperDev, ...newDev].filter((r) => !r.pass).map((r) => `${r.id}#${r.attempt}`),
    samePage: JSON.stringify(prov(paperDev).pageBuild) === JSON.stringify(prov(newDev).pageBuild),
    provenance: { paper: prov(paperDev), new: prov(newDev) },
    costUsdNewX4: +newDev.reduce((a, r) => a + (r.costUsd ?? 0), 0).toFixed(2),
  },
};
console.log(JSON.stringify(out, null, 2));
if (process.argv.includes('--write')) writeFileSync(join(root, 'docs/data/addendum/wonder.json'), JSON.stringify(out, null, 2) + '\n');
