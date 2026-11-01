// The release-candidate contract (d2fd3dad): constraints, compact answers,
// budget, refusal details, look (view + still), suggestPlants, the drawer warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTools, checkOpShape } from '../src/tools.mjs';

function fakeHex({ outcome = null } = {}) {
  const calls = [];
  const nodes = [{ ref: 'bin:0,0,0', family: 'bin', at: { q: 0, r: 0, level: 0 } }];
  return {
    calls,
    async call(method, ...args) {
      calls.push([method, ...args]);
      switch (method) {
        case 'getState': return { state: {}, nodes, staging: { props: [], soil: [] } };
        case 'listParts': return { version: 'v1', ops: {}, parts: [{ part: 'hex-main', family: 'piece', name: 'Base' }, { part: 'hex-cover-plain', value: 'plain', family: 'cover', name: 'Cover' }] };
        case 'listProps': return [{ id: 'mug' }, { id: 'basil-young' }];
        case 'openSockets': return [{ op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' }];
        case 'applyAll': return { rolledBack: false, outcomes: args[0].map((op) => outcome ?? { ok: true, op, added: ['piece:1,0,0'], removed: [], warnings: [], budget: { grams: 101.4, minutes: 300.2, parts: 3, distinctParts: 2, unmeasured: [] } }) };
        case 'suggestPlants': return { part: args[0], fillable: true, depth: { storeys: 1, tray: 'full' }, stage: 'young', plants: [{ id: 'basil-young', label: 'Basil', kind: 'basil' }], why: null };
        case 'view': return { ok: true, az: args[0].az ?? 45, polar: args[0].polar ?? 62, fit: 'build', inFrame: ['prop:1'], outOfFrame: ['prop:3'] };
        case 'still': return { ok: true, png: 'data:image/png;base64,AAAA', width: 960, height: 600, theme: 'dark', seen: [{ ref: 'prop:1', samples: 20 }, { ref: 'prop:2', samples: 0 }] };
        case 'validate': return { ok: true, meshClash: 'clear', issues: [] };
        default: return undefined;
      }
    },
  };
}

test('the contract constraints are checked in code, in its own words', () => {
  assert.throws(() => checkOpShape({ op: 'addProp', id: 'mug', surface: 'x', on: 'bench' }), /surface or on, not both/);
  assert.throws(() => checkOpShape({ op: 'addProp', id: 'mug', on: 'bench', facingDeg: 90 }), /facingDeg only with pose/);
  assert.throws(() => checkOpShape({ op: 'moveProp', ref: 'prop:1', on: 'prop:1' }), /cannot stand on itself/);
  checkOpShape({ op: 'addProp', id: 'mug', on: 'bench', pose: 'stand', facingDeg: 90 });
  checkOpShape({ op: 'capOpenFaces', stagger: false });
  checkOpShape({ op: 'lockJoints' });
});

test('find_sockets passes the new filters; part values come from compact listParts', async () => {
  const hex = fakeHex();
  const t = createTools(hex);
  const r = await t.run('find_sockets', { family: 'piece', near: 'bin:0,0,0', max: 5 });
  assert.equal(r.sockets[0].op.op, 'place');
  assert.deepEqual(hex.calls.find(([m]) => m === 'openSockets')[1], { family: 'piece', near: 'bin:0,0,0', max: 5 });
  const s = await t.run('set_requirements', { requirements: [{ id: 'R1', requirement: 'x', test: { bom: 'nonesuch' } }] });
  assert.ok(hex.calls.some(([m, o]) => m === 'listParts' && o?.compact === true) || s.error, 'compact catalogue read');
});

test('find_sockets keeps the cell and posMm of an offer whose op has no cell (L13)', async () => {
  const spike = { op: 'addSpike', level: 0, junction: [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 0 }] };
  const place = { op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' };
  const hex = { call: async (m) => (m === 'openSockets'
    ? [{ family: 'spike', at: { q: 0, r: 0, level: 0 }, op: spike, posMm: { x: 47.8, y: 0, z: 82.9 } }, { family: 'piece', at: place.at, op: place, posMm: { x: 1, y: 0, z: 0 } }]
    : { nodes: [] }) };
  const r = await createTools(hex).run('find_sockets', { family: 'spike' });
  assert.deepEqual(r.sockets[0].at, { q: 0, r: 0, level: 0 });
  assert.deepEqual(r.sockets[0].posMm, { x: 47.8, y: 0, z: 82.9 });
  assert.ok(!('at' in r.sockets[1]) && !('posMm' in r.sockets[1]), 'an op with its own cell is not repeated');
});

test('apply reports the running budget, and a refusal its details', async () => {
  const ok = createTools(fakeHex());
  const r = await ok.run('apply', { ops: [{ op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' }] });
  assert.deepEqual(r.budget, { grams: 101, minutes: 300, parts: 3 });
  const refused = createTools(fakeHex({ outcome: { ok: false, op: {}, code: 'INVALID_INPUT', message: 'bad', details: { field: 'at', expected: 'Cell' }, validAlternatives: [] } }));
  const x = await refused.run('apply', { ops: [{ op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' }], atomic: false });
  assert.deepEqual(x.outcomes[0].details, { field: 'at', expected: 'Cell' });
  assert.equal(x.budget, undefined);
});

test('look frames the build, says what is hidden, and hands the picture to onEvent only', async () => {
  const events = [];
  const hex = fakeHex();
  const t = createTools(hex, { onEvent: (e) => events.push(e) });
  const r = await t.run('look', { polar: 10 });
  assert.deepEqual(hex.calls.find(([m]) => m === 'view')[1], { polar: 10 });
  assert.deepEqual(r.hidden, ['prop:2']);
  assert.deepEqual(r.seen, [{ ref: 'prop:1', of27: 20 }]);
  assert.deepEqual(r.outOfFrame, ['prop:3']);
  assert.ok(!JSON.stringify(r).includes('base64'), 'no picture in what the model reads');
  assert.equal(events[0].type, 'still');
  assert.match(events[0].png, /^data:image\/png/);
});

test('fill_and_plant without a plant takes the one suggestPlants gives', async () => {
  const hex = fakeHex();
  const t = createTools(hex);
  await t.run('fill_and_plant', { beds: [{ part: 'bin:0,0,0' }] });
  const ops = hex.calls.find(([m]) => m === 'applyAll')[1];
  assert.deepEqual(ops.map((o) => o.op), ['fillSoil', 'plant']);
  assert.equal(ops[1].id, 'basil-young');
});
