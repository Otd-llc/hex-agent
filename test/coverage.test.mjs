// A72: the agent reaches everything the configurator's API does. The op table
// comes from the vendored contract, so these tests fail when the two drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTools, TOOL_SPECS, checkOpShape } from '../src/tools.mjs';
import { CONTRACT } from '../src/contract.mjs';

const contract = JSON.parse(readFileSync(new URL('../contract/hex-api-public.json', import.meta.url), 'utf8'));

function fakeHex({ props = [], soil = [] } = {}) {
  const nodes = [
    { ref: 'n1', family: 'piece', at: { q: 0, r: 0, level: 0 }, stem: 'hex-main', detail: {} },
    { ref: 'n2', family: 'bin', at: { q: 0, r: 0, level: 0 }, stem: 'hex-bin-full', detail: {} },
  ];
  const calls = [];
  return {
    calls,
    async call(method, ...args) {
      calls.push([method, ...args]);
      switch (method) {
        case 'getState': return { state: { pieces: [], snaps: [] }, nodes, staging: { props, soil } };
        case 'listProps': return [
          { id: 'mug', label: 'Mug', group: 'desk', longMm: 120, plant: false, pot: false, kind: 'cups', stage: null, sizeMm: { long: 120, mid: 85, short: 95 }, uses: ['desk', 'dining'], poses: ['stand'], defaultPose: 'stand' },
          { id: 'basil-young', label: 'Basil', group: 'herbs', longMm: 90, plant: true, pot: false, kind: 'herbs', stage: 'young', sizeMm: null, uses: ['grow'] },
        ];
        case 'surfaces': return [
          { id: 'cover:0,0,0;full;top', label: 'Story 1 top', kind: 'top', yMm: 72.04, centreMm: { x: 0.4, z: -1.2 }, outlineMm: [[-100, 0], [0, 90], [100, 0], [0, -90]], headroomMm: null },
        ];
        case 'measure': return { parts: { minMm: [0, 0, 0], maxMm: [200.4, 80.2, 173], sizeMm: { x: 200.4, y: 80.2, z: 173 } }, withProps: null };
        case 'bom': return {
          lines: [{ key: 'hex-main', qty: 1, kind: 'printed', label: 'Base' }],
          printedInstances: 1, maxPackInstances: 1000, notes: ['n'], cuts: { lines: [] },
          pack: { url: 'https://example.invalid/very/long/pack/link', format: '3mf', bed: { x: 220, y: 220 }, bedZ: 250, why: null },
          print: { grams: 51.2, minutes: 140, profile: 'house', unmeasured: [] },
        };
        case 'apply': return { ok: true, op: args[0], added: [], removed: [], warnings: [], dryRun: true };
        case 'applyAll': return { rolledBack: false, outcomes: args[0].map((op) => ({ ok: true, op, added: ['p9'], removed: [], warnings: [] })) };
        case 'redo': return true;
        default: return undefined;
      }
    },
  };
}
const applied = (hex) => hex.calls.filter((c) => c[0] === 'applyAll').at(-1)?.[1];

test('every contract op is allowed, with the contract fields', () => {
  assert.equal(Object.keys(CONTRACT.opFields).length, contract.ops.length);
  for (const o of contract.ops) {
    const [req, opt] = CONTRACT.opFields[o.op];
    assert.deepEqual([...req, ...opt].sort(), o.fields.map((f) => f.name).sort(), o.op);
  }
  assert.equal(CONTRACT.hash, contract.hash);
});

test('literal unions in the contract are enforced', () => {
  assert.throws(() => checkOpShape({ op: 'fillSoil', part: 'n2', to: 'brim' }), /rim, dividers/);
  assert.throws(() => checkOpShape({ op: 'addProp', id: 'mug', pose: 'upright' }), /rest, stand, lie/);
  assert.throws(() => checkOpShape({ op: 'addProp', id: 'mug', atMm: { x: 1 } }), /atMm/);
  checkOpShape({ op: 'addProp', id: 'mug', on: 'n1', atMm: { x: 1, z: 2 }, yawDeg: 90, pose: 'rest' });
});

test('prop and soil ops reach the page; refs must be the right kind', async () => {
  const hex = fakeHex({ props: [{ ref: 'p1', id: 'mug', label: 'Mug', group: 'desk', posMm: [0, 72, 0], quat: [0, 0, 0, 1], yawDeg: 0 }] });
  const t = createTools(hex);
  const ok = await t.run('apply', { ops: [
    { op: 'addProp', id: 'mug', on: 'n1' },
    { op: 'addProp', id: 'mug', on: 'bench' },
    { op: 'moveProp', ref: 'p1', on: 'n1', yawDeg: 45 },
    { op: 'fillSoil', part: 'n2' },
    { op: 'plant', id: 'basil-young', in: 'n2' },
    { op: 'replace', ref: 'n2', stem: 'hex-bin-full-div3' },
    { op: 'removeProp', ref: 'p1' },
  ] });
  assert.equal(ok.error, undefined, ok.error);
  assert.equal(applied(hex).length, 7);
  assert.match((await t.run('apply', { ops: [{ op: 'removeProp', ref: 'n1' }] })).error, /must be a prop ref/);
  assert.match((await t.run('apply', { ops: [{ op: 'fillSoil', part: 'p1' }] })).error, /must be a part ref/);
  assert.match((await t.run('apply', { ops: [{ op: 'addProp', id: 'unicorn', on: 'n1' }] })).error, /find_props/);
});

test('surface tokens resolve to the opaque surface id, and only offered ones', async () => {
  const hex = fakeHex();
  const t = createTools(hex);
  const s = await t.run('find_surfaces', { fits: 'mug' });
  assert.deepEqual(hex.calls.find((c) => c[0] === 'surfaces').slice(1), [undefined, { fits: 'mug' }]);
  assert.equal(s.surfaces[0].surface, 'f1');
  assert.equal(s.surfaces[0].outlineMm, undefined);
  assert.deepEqual(s.surfaces[0].sizeMm, { x: 200, z: 180 });
  await t.run('apply', { ops: [{ op: 'addProp', id: 'mug', surface: 'f1' }] });
  assert.equal(applied(hex)[0].surface, 'cover:0,0,0;full;top');
  assert.match((await t.run('apply', { ops: [{ op: 'addProp', id: 'mug', surface: 'f7' }] })).error, /find_surfaces/);
});

test('get_build shows props and soil', async () => {
  const t = createTools(fakeHex({
    props: [{ ref: 'p1', id: 'mug', label: 'Mug', group: 'desk', posMm: [10.4, 72.04, -3], quat: [0, 0, 0, 1], yawDeg: 12.3 }],
    soil: [{ part: 'n2', to: 'rim' }],
  }));
  const b = await t.run('get_build');
  assert.deepEqual(b.props, [{ ref: 'p1', id: 'mug', label: 'Mug', atMm: [10, 72, -3], yawDeg: 12 }]);
  assert.deepEqual(b.soil, [{ part: 'n2', to: 'rim' }]);
});

test('find_props filters by words, use and kind', async () => {
  const t = createTools(fakeHex());
  assert.deepEqual((await t.run('find_props', { use: 'grow' })).props.map((p) => p.id), ['basil-young']);
  assert.deepEqual((await t.run('find_props', { text: 'mug' })).props.map((p) => p.id), ['mug']);
  assert.equal((await t.run('find_props', {})).total, 2);
});

test('measure and bom are compact; bom keeps the pack link out of the model', async () => {
  const t = createTools(fakeHex());
  assert.deepEqual(await t.run('measure'), { parts: { x: 200, y: 80, z: 173 }, withProps: null });
  const b = await t.run('bom');
  assert.equal(JSON.stringify(b).includes('example.invalid'), false);
  assert.deepEqual(b.print, { grams: 51, minutes: 140 });
  assert.equal(b.lines[0].qty, 1);
});

test('dry run tries one op and changes nothing', async () => {
  const hex = fakeHex();
  const t = createTools(hex);
  const r = await t.run('apply', { ops: [{ op: 'addProp', id: 'mug', on: 'n1' }], dryRun: true });
  assert.equal(r.dryRun, true);
  assert.equal(r.outcomes[0].ok, true);
  assert.deepEqual(hex.calls.find((c) => c[0] === 'apply').slice(2), [{ dryRun: true }]);
  assert.equal(hex.calls.some((c) => c[0] === 'applyAll'), false);
  assert.equal(t.opsUsed(), 0);
  assert.match((await t.run('apply', { ops: [{ op: 'fillSoil', part: 'n2' }, { op: 'fillSoil', part: 'n2' }], dryRun: true })).error, /one op/);
});

test('redo is a tool', async () => {
  const hex = fakeHex();
  assert.deepEqual(await createTools(hex).run('redo'), { redone: true });
  assert.ok(TOOL_SPECS.some((s) => s.name === 'redo'));
});

test('find_sockets rows carry the id and the op, not the op repeated (A59)', async () => {
  const hex = fakeHex();
  hex.call = async (m) => (m === 'openSockets'
    ? [{ family: 'piece', at: { q: 1, r: 0, level: 0 }, slot: null, op: { op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' } }]
    : undefined);
  const s = await createTools(hex).run('find_sockets', { family: 'piece' });
  assert.deepEqual(s.sockets[0], { socket: 's1', op: { op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' } });
});

test('find_parts says released only when a part is not (A59)', async () => {
  const hex = { call: async () => [
    { value: 'a', op: 'addBin', field: 'stem', family: 'bin', name: 'A', use: 'x', box: null, released: true },
    { value: 'b', op: 'addBin', field: 'stem', family: 'bin', name: 'B', use: 'x', box: null, released: false },
  ] };
  const r = await createTools(hex).run('find_parts', {});
  assert.equal('released' in r.parts[0], false);
  assert.equal(r.parts[1].released, false);
});

test('an empty fits answer points at a dry run, not at a smaller prop', async () => {
  const hex = { call: async () => [] };
  const r = await createTools(hex).run('find_surfaces', { fits: 'quad-5in' });
  assert.match(r.note, /overhanging/);
  assert.match(r.note, /dryRun/);
});

test('addProp with both surface and on is refused in code', async () => {
  const hex = fakeHex();
  const t = createTools(hex);
  await t.run('find_surfaces', {});
  assert.match((await t.run('apply', { ops: [{ op: 'addProp', id: 'mug', on: 'n1', surface: 'f1' }] })).error, /surface or on, not both/);
  assert.equal(hex.calls.some((c) => c[0] === 'applyAll'), false);
});

test("find_props names a prop's authored poses, and a pose op is checked in code (A49)", async () => {
  const hex = fakeHex();
  const t = createTools(hex);
  const mug = (await t.run('find_props', { text: 'mug' })).props[0];
  assert.deepEqual(mug.poses, ['stand']);
  assert.equal(mug.defaultPose, 'stand');
  const basil = (await t.run('find_props', { use: 'grow' })).props[0];
  assert.equal('poses' in basil, false);
  await t.run('apply', { ops: [{ op: 'addProp', id: 'mug', on: 'n1', pose: 'stand', facingDeg: 90 }] });
  assert.equal(hex.calls.filter((c) => c[0] === 'applyAll').at(-1)[1][0].pose, 'stand');
  assert.match((await t.run('apply', { ops: [{ op: 'addProp', id: 'mug', on: 'n1', pose: 'upright' }] })).error, /rest, stand, lie/);
});
