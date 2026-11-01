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
