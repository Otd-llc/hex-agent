import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTools, LIMITS } from '../src/tools.mjs';
import { runAgent } from '../src/agent.mjs';
import { mockModel, metaModel, parseResponse, costUsd } from '../src/model.mjs';

function fakeHex() {
  const nodes = [{ ref: 'n1', family: 'piece', at: { q: 0, r: 0, level: 0 }, stem: 'hex-main', detail: {} }];
  const calls = [];
  return {
    calls,
    async call(method, ...args) {
      calls.push([method, ...args]);
      switch (method) {
        case 'getState': return { state: { pieces: [], snaps: [] }, nodes, staging: { props: [], soil: [] } };
        case 'openSockets': return [{ family: 'piece', at: { q: 1, r: 0, level: 0 }, slot: null, op: { op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' } }];
        case 'applyAll': return { rolledBack: false, outcomes: args[0].map((op) => ({ ok: true, op, added: ['n2'], removed: [], warnings: [] })) };
        case 'listParts': return [{ value: 'hex-bin-full', op: 'addBin', field: 'stem', family: 'bin', part: 'hex-bin-full', name: 'Bin', use: 'holds things', box: null, released: true }];
        default: return undefined;
      }
    },
  };
}

test('socket ids map back to the exact offered op', async () => {
  const hex = fakeHex();
  const t = createTools(hex);
  const s = await t.run('find_sockets', { family: 'piece' });
  assert.equal(s.sockets[0].socket, 's1');
  const r = await t.run('apply', { ops: [{ socket: 's1' }] });
  assert.equal(r.outcomes[0].ok, true);
  const applied = hex.calls.find((c) => c[0] === 'applyAll')[1];
  assert.deepEqual(applied[0], { op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' });
});

test('fabricated refs are refused before reaching the configurator', async () => {
  const hex = fakeHex();
  const t = createTools(hex);
  const r = await t.run('apply', { ops: [{ op: 'remove', ref: 'made-up' }] });
  assert.match(r.error, /not on the build/);
  assert.equal(hex.calls.some((c) => c[0] === 'applyAll'), false);
});

test('load and unknown ops are not reachable by the model', async () => {
  const t = createTools(fakeHex());
  assert.match((await t.run('apply', { ops: [{ op: 'load' }] })).error, /not allowed/);
  assert.match((await t.run('apply', { ops: [{ socket: 's99' }] })).error, /unknown socket/);
  assert.match((await t.run('nope', {})).error, /unknown tool/);
  assert.match((await t.run('apply', '{bad json')).error, /not valid JSON/);
});

test('op budget is enforced', async () => {
  const t = createTools(fakeHex());
  const op = { op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' };
  const tooMany = Array.from({ length: LIMITS.opsPerCall + 1 }, () => op);
  assert.match((await t.run('apply', { ops: tooMany })).error, /at most/);
});

test('Contributor-mode models are refused', () => {
  assert.throws(() => metaModel({ model: 'muse-spark-1.3-contributor', apiKey: 'x' }), /Contributor/);
});

test('Responses output parses into calls, text and usage', () => {
  const r = parseResponse({
    id: 'r1',
    output: [
      { type: 'reasoning', encrypted_content: 'x' },
      { type: 'function_call', call_id: 'c1', name: 'get_build', arguments: '{}' },
      { type: 'message', content: [{ type: 'output_text', text: 'hi' }] },
    ],
    usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 400 } },
  });
  assert.deepEqual(r.calls, [{ callId: 'c1', name: 'get_build', arguments: '{}' }]);
  assert.equal(r.text, 'hi');
  assert.equal(r.usage.cachedInputTokens, 400);
  assert.equal(costUsd('muse-wonder-1.0', r.usage), (600 * 4 + 400 * 0.2 + 200 * 20) / 1e6);
});

test('the loop runs tools, feeds outputs back and stops on finish', async () => {
  const model = mockModel([
    [{ name: 'find_sockets', args: { family: 'piece' } }],
    [{ name: 'apply', args: { ops: [{ socket: 's1' }] } }],
    [{ name: 'finish', args: { requirements: [{ requirement: 'two bases', status: 'met', evidence: 'n1,n2' }], summary: 'done' } }],
  ]);
  const r = await runAgent({ hex: fakeHex(), model, brief: 'two bases' });
  assert.equal(r.stop, null);
  assert.equal(r.finish.summary, 'done');
  assert.equal(r.counters.applied, 1);
  assert.equal(r.usage.calls, 3);
});

test('a model that never finishes stops on the turn budget', async () => {
  const model = mockModel(() => [{ name: 'get_build' }]);
  const r = await runAgent({ hex: fakeHex(), model, brief: 'x', budget: { maxTurns: 3 } });
  assert.equal(r.finish, null);
  assert.equal(r.stop, 'turn budget');
});
