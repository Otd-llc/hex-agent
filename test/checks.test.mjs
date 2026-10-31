import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBrief, overclaimed, outcomeOf } from '../src/checks.mjs';

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
  assert.deepEqual(r.results.filter((x) => !x.expect.implicit).map((x) => x.pass), [true, false, true, true, false, false]);
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

test('drawers counts cut-face drawers and notch drawer frames, not notch bins', () => {
  const nodes = [{ family: 'drawer', at: null }, { family: 'notch', at: null }, { family: 'notch', at: null }];
  const bom = { lines: [{ key: 'hex-drawer-frame-notch-mf', qty: 1 }, { key: 'hex-bin-notch-mf-solid', qty: 1 }] };
  const r = checkBrief([{ drawers: 2 }, { drawers: 3 }], { state: { nodes }, verdict: { bom, validation: { issues: [] } }, finish: null });
  assert.deepEqual(r.results.filter((x) => !x.expect.implicit).map((x) => x.pass), [true, false]);
});

test('props, prop ids and soil read the staging (A72)', () => {
  const staged = {
    ...state,
    staging: {
      props: [{ id: 'mug' }, { id: 'keyboard' }, { id: 'basil-young' }, { id: 'basil-harvest' }],
      soil: [{ part: 'n2', to: 'rim' }],
    },
  };
  const r = checkBrief(
    [{ props: 4 }, { props: 5 }, { prop: 'basil', min: 2 }, { prop: 'mug' }, { prop: 'phone' }, { soil: 1 }, { soil: 2 }],
    { state: staged, verdict, finish: null },
  );
  assert.deepEqual(r.results.filter((x) => !x.expect.implicit).map((x) => x.pass), [true, false, true, true, false, true, false]);
  // A state with no staging (an old trace) has no props, not an error.
  assert.equal(checkBrief([{ props: 1 }], { state, verdict, finish: null }).results[0].pass, false);
});

test('outcome: an expected decline, and a decline where none was expected (A58)', () => {
  const declined = { outcome: 'declined', requirements: [{ status: 'unmet' }] };
  assert.equal(checkBrief([{ outcome: ['declined', 'compromise'] }], { state, verdict, finish: declined }).pass, true);
  // A buildable brief declined fails on the implicit check.
  const r = checkBrief([{ levels: 1 }], { state, verdict, finish: declined });
  assert.equal(r.pass, false);
  assert.equal(r.results.at(-1).expect.implicit, true);
  // An old finish with no outcome is read from what it left.
  assert.equal(outcomeOf({ requirements: [{ status: 'unmet' }] }, 0), 'declined');
  assert.equal(outcomeOf({ requirements: [{ status: 'met' }, { status: 'unmet' }] }, 4), 'compromise');
  assert.equal(outcomeOf({ requirements: [{ status: 'met' }] }, 4), 'built');
});
