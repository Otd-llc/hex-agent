// The compound helpers (A85) and the prop warnings (A99): each helper builds
// ops, runs them through apply, and reports the prop warnings left.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTools, TOOL_SPECS } from '../src/tools.mjs';
import { INSTRUCTIONS } from '../src/agent.mjs';

function fakeHex({ issues = [], soil = [] } = {}) {
  const nodes = [
    { ref: 'bin:0,0,0~hex-bin-full-div3-x3', family: 'bin', at: { q: 0, r: 0, level: 0 }, stem: 'hex-bin-full-div3-x3' },
    { ref: 'bin:1,0,0~hex-bin-full', family: 'bin', at: { q: 1, r: 0, level: 0 }, stem: 'hex-bin-full' },
    { ref: 'axle:2#0,0#5', family: 'axle', at: { q: 0, r: 0, level: 2 }, stem: 'hex-acc-spool-axle' },
    { ref: 'axle:2#0,2#5', family: 'axle', at: { q: 0, r: 2, level: 2 }, stem: 'hex-acc-spool-axle' },
  ];
  const surf = {
    'bin:0,0,0~hex-bin-full-div3-x3': ['c1', 'c2', 'c3'].map((id) => ({ id, kind: 'compartment', depthMm: 40 })),
    'bin:1,0,0~hex-bin-full': [{ id: 'fl', kind: 'floor', depthMm: 70 }],
  };
  const calls = [];
  return {
    calls,
    async call(method, ...args) {
      calls.push([method, ...args]);
      switch (method) {
        case 'getState': return { state: { pieces: [], snaps: [] }, nodes, staging: { props: [], soil } };
        case 'listProps': return ['pen', 'pencil', 'tweezers', 'filament-spool', 'basil-young', 'thyme-young'].map((id) => ({ id }));
        // Only pencils fit c2: fits is a filter.
        case 'surfaces': {
          const all = surf[args[0]] ?? [];
          return args[1]?.fits === 'tweezers' ? all.filter((f) => f.id !== 'c2') : all;
        }
        case 'applyAll': return { rolledBack: false, outcomes: args[0].map((op) => ({ ok: true, op, added: ['prop:x'], removed: [], warnings: [] })) };
        case 'validate': return { ok: true, meshClash: 'clear', issues };
        default: return undefined;
      }
    },
  };
}
const applied = (hex) => hex.calls.filter((c) => c[0] === 'applyAll').flatMap((c) => c[1]);

test('every helper is a tool the model sees', () => {
  for (const n of ['dress', 'hang_spools', 'fill_and_plant', 'fill_compartments']) assert.ok(TOOL_SPECS.some((t) => t.name === n), n);
});

test('dress puts each "in" prop in its own free compartment, in one apply', async () => {
  const hex = fakeHex();
  const t = createTools(hex);
  const r = await t.run('dress', { props: [{ id: 'pen', in: 'bin:0,0,0~hex-bin-full-div3-x3' }, { id: 'pencil', in: 'bin:0,0,0~hex-bin-full-div3-x3', pose: 'stand' }, { id: 'tweezers', on: 'bench' }] });
  assert.equal(r.placed, 3);
  assert.equal(hex.calls.filter((c) => c[0] === 'applyAll').length, 1);
  const ops = applied(hex);
  assert.deepEqual(ops.map((o) => o.surface ?? o.on), ['c1', 'c2', 'bench']);
  assert.equal(ops[1].pose, 'stand');
  assert.ok(!('in' in ops[0]));
  assert.deepEqual(r.flagged, []);
});

test('dress refuses in with on', async () => {
  const r = await createTools(fakeHex()).run('dress', { props: [{ id: 'pen', in: 'bin:1,0,0~hex-bin-full', on: 'bench' }] });
  assert.match(r.error, /one of them/);
});

test('hang_spools hangs one spool per axle', async () => {
  const hex = fakeHex();
  const r = await createTools(hex).run('hang_spools', {});
  assert.equal(r.placed, 2);
  assert.deepEqual(applied(hex).map((o) => [o.id, o.on]), [['filament-spool', 'axle:2#0,0#5'], ['filament-spool', 'axle:2#0,2#5']]);
});

test('fill_and_plant fills each bin once and skips soil already there', async () => {
  const hex = fakeHex({ soil: [{ part: 'bin:1,0,0~hex-bin-full', to: 'rim' }] });
  await createTools(hex).run('fill_and_plant', { beds: [{ part: 'bin:0,0,0~hex-bin-full-div3-x3', plant: 'basil-young' }, { part: 'bin:1,0,0~hex-bin-full', plant: 'thyme-young' }] });
  assert.deepEqual(applied(hex).map((o) => o.op), ['fillSoil', 'plant', 'plant']);
});

test('fill_compartments gives each compartment the next prop that fits it', async () => {
  const hex = fakeHex();
  const r = await createTools(hex).run('fill_compartments', { parts: ['bin:0,0,0~hex-bin-full-div3-x3', 'bin:1,0,0~hex-bin-full'], props: ['tweezers', 'pen'] });
  assert.equal(r.placed, 4);
  // c2 does not take tweezers, so pen goes there.
  assert.deepEqual(applied(hex).map((o) => o.id), ['tweezers', 'pen', 'tweezers', 'pen']);
});

test('a prop going into a narrow strip turns its long side along it, unless the item turns it', async () => {
  const strip = [[-70, -61], [-27, -61], [-27, 62], [-70, 62]];
  const hex = fakeHex();
  const surfaces = hex.call;
  hex.call = async (m, ...a) => (m === 'surfaces' ? [{ id: 'c1', kind: 'compartment', outlineMm: strip }, { id: 'c2', kind: 'compartment', outlineMm: strip.map(([x, z]) => [z, x]) }] : surfaces(m, ...a));
  const t = createTools(hex);
  await t.run('dress', { props: [{ id: 'pen', in: 'bin:1,0,0~hex-bin-full' }, { id: 'pencil', in: 'bin:1,0,0~hex-bin-full', yawDeg: 10 }] });
  const ops = applied(hex);
  assert.deepEqual(ops[0].orient, { longAlong: 'z' });
  assert.equal('orient' in ops[1], false);
});

test('prop warnings come back with their prop ref and fix, from helpers and check_build', async () => {
  const issues = [
    { severity: 'warning', code: 'PROP_INSIDE', refs: [], message: 'the Pen: overlaps the bin. (prop:pen@1,2,3@0,0,0,1)' },
    { severity: 'info', code: 'OPEN_CAP_FACE', refs: [], message: '6 faces' },
  ];
  const t = createTools(fakeHex({ issues }));
  const r = await t.run('hang_spools', {});
  assert.equal(r.flagged.length, 1);
  assert.equal(r.flagged[0].prop, 'prop:pen@1,2,3@0,0,0,1');
  assert.match(r.flagged[0].fix, /moveProp/);
  const c = await t.run('check_build', {});
  assert.deepEqual(c.issues.map((i) => i.code), ['OPEN_CAP_FACE']);
  assert.equal(c.props[0].code, 'PROP_INSIDE');
});

test('the prompt and tools teach decks, axles and the dress-check-fix loop', () => {
  const all = INSTRUCTIONS + JSON.stringify(TOOL_SPECS);
  for (const w of ['deck', 'depthMm', 'PROP_BELOW_RIM', 'PROP_FLOATING', 'PROP_INSIDE', 'PLANT_NOT_IN_SOIL', 'axle', '30 degrees']) assert.ok(all.includes(w), w);
  assert.match(INSTRUCTIONS, /check, then fix/);
});

test('a refused prop hands back tryInstead as a socket id', async () => {
  const hex = fakeHex();
  const base = hex.call;
  const varied = { op: 'addProp', id: 'pen', on: 'bench', yawDeg: 90 };
  hex.call = async (m, ...a) => (m === 'applyAll'
    ? { rolledBack: false, outcomes: [{ ok: false, op: a[0][0], code: 'PROP_NO_REST', message: 'no', details: { tryInstead: varied }, validAlternatives: [] }] }
    : base(m, ...a));
  const t = createTools(hex);
  const r = await t.run('dress', { props: [{ id: 'pen', on: 'bench' }] });
  const ti = r.outcomes[0].tryInstead;
  assert.deepEqual(ti.op, varied);
  hex.call = base;
  await t.run('apply', { ops: [{ socket: ti.socket }] });
  assert.deepEqual(applied(hex).at(-1), varied);
});

test('on takes a surface token (A95) and it reaches the page as the surface id', async () => {
  const hex = fakeHex();
  const base = hex.call;
  hex.call = async (m, ...a) => (m === 'surfaces' ? [{ id: 'surface:mount@axle:2#0,0#5', kind: 'mount', label: 'Spool axle', yMm: 300, centreMm: { x: 0, z: 0 }, outlineMm: [[0, 0], [1, 0], [0, 1]], headroomMm: null }] : base(m, ...a));
  const t = createTools(hex);
  const f = await t.run('find_surfaces', { fits: 'filament-spool' });
  hex.call = base;
  const r = await t.run('apply', { ops: [{ op: 'addProp', id: 'filament-spool', on: f.surfaces[0].surface }] });
  assert.equal(r.outcomes[0].ok, true);
  assert.equal(applied(hex).at(-1).on, 'surface:mount@axle:2#0,0#5');
  assert.match((await t.run('apply', { ops: [{ op: 'addProp', id: 'pen', on: 'f99' }] })).error, /not on the build/);
});

test('the prompt teaches tryInstead, the lean in deep wells and pose heights', () => {
  for (const w of ['tryInstead', 'shallow tray', 'poseHeightMm']) assert.ok(INSTRUCTIONS.includes(w), w);
  assert.match(JSON.stringify(TOOL_SPECS), /count bays, not offers/);
  assert.match(JSON.stringify(TOOL_SPECS), /kind mount/);
});

test('a prop warning takes its prop from refs when the page gives it there', async () => {
  const issues = [{ severity: 'warning', code: 'PLANT_NOT_IN_SOIL', refs: ['prop:basil-young@2,537,0@0,0,0,1'], message: 'the Basil is not planted in soil.' }];
  const c = await createTools(fakeHex({ issues })).run('check_build', {});
  assert.equal(c.props[0].prop, 'prop:basil-young@2,537,0@0,0,0,1');
});
