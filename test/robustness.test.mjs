import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTools, checkOpShape } from '../src/tools.mjs';
import { runAgent, transient, RETRY_DELAYS_MS } from '../src/agent.mjs';

test('op shapes are checked against the contract before reaching the page', () => {
  assert.throws(
    () => checkOpShape({ op: 'setSpikeAccessory', ref: 'spike:x', accessory: 'platform-sm' }),
    /missing level, junction: setSpikeAccessory takes level, junction, accessory/,
  );
  assert.throws(() => checkOpShape({ op: 'addBin', at: { q: 0, r: 0, level: 0 }, stem: 'x', colour: 'red' }), /colour is not a field of addBin/);
  assert.doesNotThrow(() => checkOpShape({ op: 'addSpike', level: 0, junction: [], variant: 'stud', facing: 'down' }));
});

test('a malformed op comes back as a tool error, not a page call', async () => {
  const calls = [];
  const hex = { call: async (m) => { calls.push(m); return { nodes: [] }; } };
  const t = createTools(hex);
  const r = await t.run('apply', { ops: [{ op: 'setSpikeAccessory', ref: 'spike:x', accessory: 'platform-sm' }] });
  assert.match(r.error, /missing level, junction/);
  assert.equal(calls.includes('applyAll'), false);
});

test('transient errors are told apart from permanent ones', () => {
  assert.equal(transient({ status: 500 }), true);
  assert.equal(transient({ status: 529 }), true);
  assert.equal(transient({ status: 429 }), true);
  assert.equal(transient({ status: 400 }), false);
  assert.equal(transient({ status: 401 }), false);
  assert.equal(transient(new Error('fetch failed')), true);
  assert.equal(transient(new Error('Claude declined (cyber)')), false);
});

test('the loop retries a 500 and carries on', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let n = 0;
  const finish = { requirements: [{ requirement: 'r', status: 'met', evidence: 'e' }], summary: 's' };
  const model = {
    kind: 'mock', provider: 'mock', model: 'scripted',
    next: async () => {
      n++;
      if (n === 1) throw Object.assign(new Error('500 overloaded'), { status: 500 });
      return { id: 'r', output: [], calls: [{ callId: 'c', name: 'finish', arguments: JSON.stringify(finish) }], text: '', usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 } };
    },
  };
  const p = runAgent({ hex: { call: async () => ({}) }, model, brief: 'x' });
  await new Promise((r) => setImmediate(r));
  t.mock.timers.tick(RETRY_DELAYS_MS[0]);
  const r = await p;
  assert.equal(n, 2);
  assert.deepEqual(r.finish, finish);
  assert.equal(r.events.filter((e) => e.type === 'model_error')[0].retrying, true);
});

test('a 400 is not retried', async () => {
  let n = 0;
  const model = { kind: 'mock', provider: 'mock', model: 'scripted', next: async () => { n++; throw Object.assign(new Error('400 bad'), { status: 400 }); } };
  const r = await runAgent({ hex: { call: async () => ({}) }, model, brief: 'x' });
  assert.equal(n, 1);
  assert.equal(r.stop, 'model error');
});

test('finish arguments are validated, with a stringified array accepted', async () => {
  const { parseFinish } = await import('../src/agent.mjs');
  const reqs = [{ requirement: 'a', status: 'met', evidence: 'e' }];
  assert.deepEqual(parseFinish(JSON.stringify({ requirements: reqs, summary: 's' })).finish.requirements, reqs);
  assert.deepEqual(parseFinish(JSON.stringify({ requirements: JSON.stringify(reqs), summary: 's' })).finish.requirements, reqs);
  assert.match(parseFinish(JSON.stringify({ requirements: 'all good' })).error, /non-empty array/);
  assert.match(parseFinish(JSON.stringify({ requirements: [{ requirement: 'a', status: 'done', evidence: 'e' }] })).error, /met\|partial\|unmet/);
  assert.match(parseFinish('{bad').error, /not valid JSON/);
});

test('a bad finish goes back to the model, which can call finish again', async () => {
  const good = { requirements: [{ requirement: 'a', status: 'met', evidence: 'e' }], summary: 's' };
  const answers = [{ requirements: 'everything met' }, good];
  let n = 0;
  const model = {
    kind: 'mock', provider: 'mock', model: 'scripted',
    next: async () => ({ id: 'r', output: [], calls: [{ callId: `c${n}`, name: 'finish', arguments: JSON.stringify(answers[n++]) }], text: '', usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 } }),
  };
  const r = await runAgent({ hex: { call: async () => ({}) }, model, brief: 'x' });
  assert.equal(n, 2);
  assert.deepEqual(r.finish, good);
});
