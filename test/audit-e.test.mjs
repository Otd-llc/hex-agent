// Lane 1's multi-lens audit fixes (section E, plans/2026-11-01-claude-run-fixes.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTools, toolSpecsFor } from '../src/tools.mjs';
import { INSTRUCTIONS } from '../src/agent.mjs';
import { withTimeout } from '../src/bridge.mjs';
import { budgetCut, infraCut } from '../src/runkey.mjs';

function fakeHex({ applyAll, sockets = {} } = {}) {
  const calls = [];
  return {
    calls,
    async call(method, ...args) {
      calls.push([method, ...args]);
      switch (method) {
        case 'getState': return { state: {}, nodes: [{ ref: 'piece:0,0,0;full', family: 'piece', at: { q: 0, r: 0, level: 0 } }], staging: { props: [], soil: [] } };
        case 'openSockets': return sockets[args[0]?.family] ?? [];
        case 'applyAll': return applyAll(args[0], calls.filter((c) => c[0] === 'applyAll').length);
        case 'listParts': return [];
        default: return undefined;
      }
    },
  };
}
const ok = (op, added = []) => ({ ok: true, op, added, removed: [], warnings: [] });
const no = (op, code) => ({ ok: false, op, code, message: code, details: {}, validAlternatives: [] });

test('E2: a run that ends on a model error is cut as infra, like a budget cut', () => {
  assert.ok(infraCut({ stop: 'model error' }));
  assert.ok(infraCut({ infra: 'model error' }));
  assert.ok(!infraCut({ stop: 'turn budget' }));
  assert.ok(!budgetCut({ stop: 'model error' }), 'not a budget cut: its own reason');
});

test('E3: a page call that never answers is given up on', async () => {
  const never = new Promise(() => {});
  await assert.rejects(withTimeout(never, 30, 'hexAPI settle'), (e) => e.code === 'CALL_TIMEOUT' && /hexAPI settle did not answer/.test(e.message));
  assert.equal(await withTimeout(Promise.resolve(7), 1000, 'x'), 7);
});

test('E4: the prompt and find_sockets ask for independent lookups in one turn', () => {
  assert.match(INSTRUCTIONS, /several tool calls in one turn/);
  const fs = toolSpecsFor({}).find((s) => s.name === 'find_sockets');
  assert.match(fs.description, /several families in one turn/);
});

test('E5: an apply that adds a base answers with the offers at it, as sockets', async () => {
  const place = { op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' };
  const bin = { op: 'addBin', at: { q: 1, r: 0, level: 0 }, stem: 'hex-bin-full' };
  const piece = { op: 'place', at: { q: 2, r: 0, level: 0 }, variant: 'full' };
  const hex = fakeHex({
    applyAll: (ops) => ({ rolledBack: false, outcomes: ops.map((op) => ok(op, ['piece:1,0,0;full'])) }),
    sockets: { bin: [{ family: 'bin', at: bin.at, op: bin }], piece: [{ family: 'piece', at: piece.at, op: piece }] },
  });
  const t = createTools(hex);
  const r = await t.run('apply', { ops: [place] });
  assert.equal(r.offersNear.near, 'piece:1,0,0;full');
  assert.deepEqual(r.offersNear.sockets.map((s) => s.op.op).sort(), ['addBin', 'place']);
  const nearCalls = hex.calls.filter((c) => c[0] === 'openSockets');
  assert.ok(nearCalls.every((c) => c[1].near === 'piece:1,0,0;full' && c[1].max === 2 && c[1].family));
  // The offered socket applies as the exact op.
  const s = r.offersNear.sockets.find((x) => x.op.op === 'addBin').socket;
  await t.run('apply', { ops: [{ socket: s }] });
  assert.deepEqual(hex.calls.filter((c) => c[0] === 'applyAll').at(-1)[1][0], bin);
  // An apply that adds no base asks nothing more.
  const before = hex.calls.length;
  const hex2 = fakeHex({ applyAll: (ops) => ({ rolledBack: false, outcomes: ops.map((op) => ok(op, ['bin:1,0,0~hex-bin-full'])) }) });
  const r2 = await createTools(hex2).run('apply', { ops: [bin] });
  assert.equal(r2.offersNear, undefined);
  assert.ok(!hex2.calls.some((c) => c[0] === 'openSockets'));
  assert.ok(before > 0);
});

test('E12: an atomic batch undone only for NO_CHANGE is applied again without those ops', async () => {
  const lock = { op: 'lockJoints' };
  const bin = { op: 'addBin', at: { q: 0, r: 0, level: 0 }, stem: 'hex-bin-full' };
  const hex = fakeHex({
    applyAll: (ops, n) => (n === 1
      ? { rolledBack: true, outcomes: ops.map((op) => (op.op === 'lockJoints' ? no(op, 'NO_CHANGE') : ok(op))) }
      : { rolledBack: false, outcomes: ops.map((op) => ok(op, ['bin:0,0,0~hex-bin-full'])) }),
  });
  const r = await createTools(hex).run('apply', { ops: [bin, lock] });
  assert.equal(r.rolledBack, false);
  assert.deepEqual(r.droppedAlreadyFitted, [lock]);
  assert.deepEqual(hex.calls.filter((c) => c[0] === 'applyAll').at(-1)[1], [bin]);
});

test('E6: a prop helper sends each refused prop\'s tryInstead once, and re-sends BUSY props after a settle', async () => {
  const mug = { op: 'addProp', id: 'mug', on: 'piece:0,0,0;full' };
  const pen = { op: 'addProp', id: 'pen', on: 'piece:0,0,0;full' };
  const turned = { op: 'addProp', id: 'mug', on: 'piece:0,0,0;full', yawDeg: 30 };
  let n = 0;
  const hex = fakeHex({
    applyAll: (ops) => {
      n++;
      if (n === 1) return { rolledBack: false, outcomes: [{ ...no(ops[0], 'PROP_NO_REST'), details: { tryInstead: turned } }, no(ops[1], 'BUSY')] };
      return { rolledBack: false, outcomes: ops.map((op) => ok(op, ['prop:1'])) };
    },
  });
  hex.call = ((orig) => async (m, ...a) => (m === 'validate' ? { issues: [] } : m === 'listProps' ? [{ id: 'mug' }, { id: 'pen' }] : orig(m, ...a)))(hex.call);
  const r = await createTools(hex).run('dress', { props: [{ id: 'mug', on: 'piece:0,0,0;full' }, { id: 'pen', on: 'piece:0,0,0;full' }] });
  const batches = hex.calls.filter((c) => c[0] === 'applyAll').map((c) => c[1]);
  assert.deepEqual(batches[1], [turned], 'the tryInstead, as offered');
  assert.deepEqual(batches[2], [pen], 'the BUSY prop again');
  assert.ok(hex.calls.findIndex((c) => c[0] === 'settle') < hex.calls.length);
  assert.equal(r.tryInsteadSent.count, 1);
  assert.equal(r.busyResent.count, 1);
  assert.equal(r.placed, 2);
  assert.equal(r.refused, 0);
  void mug;
});

test('E7: the wrap-up note says to send the one apply that completes a requirement, then check and finish', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/agent.mjs', import.meta.url), 'utf8');
  assert.match(src, /If one apply would complete a requirement \(an offer you already have\), send it now/);
  assert.match(src, /An offer you did not apply is not on the build/);
});

test('E9: the disclaimer has to govern the property; a spool or reel\'s size is not a load', async () => {
  const { outOfScopeClaims } = await import('../src/agent.mjs');
  const met = (evidence, requirement = 'x') => outOfScopeClaims({ requirements: [{ requirement, status: 'met', evidence }] }).length;
  // Claims that a nearby disclaimer used to clear.
  for (const e of ['Holds a 20 kg box of tools', 'Rated for 20 kg, hinge alignment not tested', 'It is watertight, whether in rain or not', 'It is watertight whether in rain or not', 'Fully waterproof; the lid alignment is not checked.']) {
    assert.equal(met(e), 1, e);
  }
  // Disclaimers that govern the property.
  for (const e of ['Whether it is watertight depends on the material and how it is assembled, which the configurator does not check.', 'Rated for 20 kg, which is not tested.', 'Watertightness depends on the filament.', 'Actual watering performance and waterproofing are not verified.', 'Fit only: nothing here checks that it is watertight.']) {
    assert.equal(met(e), 0, e);
  }
  assert.equal(met('ok', 'A 1 kg filament spool on every axle'), 0);
  assert.equal(met('ok', 'A 2 kg reel on the rack'), 0);
  assert.equal(met('ok', 'A 2 kg bag on the shelf'), 1, 'only spools and reels are sized things');
});
