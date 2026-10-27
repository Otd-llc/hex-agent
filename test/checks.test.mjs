import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBrief, overclaimed } from '../src/checks.mjs';

const state = {
  nodes: [
    { family: 'piece', at: { q: 0, r: 0, level: 0 } },
    { family: 'piece', at: { q: 0, r: 0, level: 1 } },
    { family: 'drawer', at: { q: 0, r: 0, level: 0 } },
    { family: 'run', at: null },
  ],
};
const verdict = {
  bom: { lines: [{ key: 'hex-bin-full-drain', qty: 2 }, { key: 'hex-bin-full-drain-pill', qty: 1 }] },
  validation: { issues: [{ code: 'OPEN_CAP_FACE' }] },
};

test('family, bom, levels and issue expectations read the build', () => {
  const r = checkBrief(
    [{ family: 'drawer', min: 1 }, { family: 'drawer', min: 2 }, { bom: 'drain', min: 3 }, { levels: 2 }, { noIssue: 'OPEN_CAP_FACE' }, { maxParts: 3 }],
    { state, verdict, finish: null },
  );
  assert.deepEqual(r.results.map((x) => x.pass), [true, false, true, true, false, false]);
  assert.equal(r.pass, false);
});

test('reportsUnmet needs the model to admit a gap', () => {
  const finish = { requirements: [{ status: 'met' }, { status: 'unmet' }] };
  assert.equal(checkBrief([{ reportsUnmet: true }], { state, verdict, finish }).pass, true);
  assert.equal(checkBrief([{ reportsUnmet: true }], { state, verdict, finish: { requirements: [{ status: 'met' }] } }).pass, false);
});

test('overclaiming: all "met" while code finds a gap', () => {
  const finish = { requirements: [{ status: 'met' }] };
  assert.equal(overclaimed({ finish, briefChecks: { pass: false } }), true);
  assert.equal(overclaimed({ finish, briefChecks: { pass: true } }), false);
  assert.equal(overclaimed({ finish: { requirements: [{ status: 'unmet' }] }, briefChecks: { pass: false } }), false);
});
