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
  assert.doesNotThrow(() => checkOpShape({ op: 'addSpike', level: 0, junction: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }], variant: 'stud', facing: 'down' }));
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

test('an atomic batch undone only by ALREADY_FITTED is applied again without those ops', async () => {
  const { createTools } = await import('../src/tools.mjs');
  const a = { op: 'addJointBolt', at: { q: 0, r: 0, level: 0 }, slot: 0 };
  const b = { op: 'addJointBolt', at: { q: 1, r: 0, level: 0 }, slot: 3 };
  const batches = [];
  const hex = {
    call: async (m, ops) => {
      if (m === 'getState') return { nodes: [] };
      if (m !== 'applyAll') return undefined;
      batches.push(ops);
      if (ops.length === 2) return { rolledBack: true, outcomes: [{ ok: true, op: a, added: ['j'], removed: [], warnings: [] }, { ok: false, op: b, code: 'ALREADY_FITTED', message: 'm', details: {}, validAlternatives: [] }] };
      return { rolledBack: false, outcomes: [{ ok: true, op: a, added: ['j'], removed: [], warnings: [] }] };
    },
  };
  const r = await createTools(hex).run('apply', { ops: [a, b] });
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[1], [a]);
  assert.equal(r.rolledBack, false);
  assert.deepEqual(r.droppedAlreadyFitted, [b]);
});

test('any other refusal still rolls the batch back with no retry', async () => {
  const { createTools } = await import('../src/tools.mjs');
  const a = { op: 'addJointBolt', at: { q: 0, r: 0, level: 0 }, slot: 0 };
  let n = 0;
  const hex = {
    call: async (m) => {
      if (m === 'getState') return { nodes: [] };
      if (m !== 'applyAll') return undefined;
      n++;
      return { rolledBack: true, outcomes: [{ ok: false, op: a, code: 'SPIKE_CLASH', message: 'm', details: {}, validAlternatives: [] }] };
    },
  };
  const r = await createTools(hex).run('apply', { ops: [a] });
  assert.equal(n, 1);
  assert.equal(r.rolledBack, true);
  assert.equal(r.droppedAlreadyFitted, undefined);
});

test('the op table is in the apply description and an empty offer list says what to do', async () => {
  const { TOOL_SPECS, createTools } = await import('../src/tools.mjs');
  const apply = TOOL_SPECS.find((t) => t.name === 'apply');
  assert.match(apply.description, /setCoverMagnets\(at, variant, face, on\)/);
  assert.match(apply.description, /place\(at, variant, storeys\?\)/);
  const hex = { call: async (m) => (m === 'openSockets' ? [] : { nodes: [] }) };
  const r = await createTools(hex).run('find_sockets', { family: 'notch' });
  assert.match(r.note, /Change the build/);
});

test('six refusals in a row bring a plain warning', async () => {
  const { createTools } = await import('../src/tools.mjs');
  const op = { op: 'addNotch', at: { q: 1, r: 0, level: 0 }, k: 0, stem: 'x' };
  const hex = {
    call: async (m, ops) => (m === 'applyAll'
      ? { rolledBack: false, outcomes: ops.map((o) => ({ ok: false, op: o, code: 'NO_CELL', message: 'm', details: {}, validAlternatives: [] })) }
      : { nodes: [] }),
  };
  const t = createTools(hex);
  const first = await t.run('apply', { ops: Array(5).fill(op), atomic: false });
  assert.equal(first.warning, undefined);
  const sixth = await t.run('apply', { ops: [op], atomic: false });
  assert.match(sixth.warning, /6 refusals in a row/);
});

test('field types and named values are checked before the page sees them', async () => {
  const { checkOpShape } = await import('../src/tools.mjs');
  assert.throws(() => checkOpShape({ op: 'addSpike', level: 0, junction: { q: 0, r: 0, corner: 0 } }), /junction must be an array of three sites/);
  assert.throws(() => checkOpShape({ op: 'setRunMode', id: 'run-1', mode: 'drip' }), /"drip" is not a runMode: use one of potable, irrigation, structural/);
  assert.throws(() => checkOpShape({ op: 'addCover', at: { q: 0, r: 0, level: 0 }, variant: 'full', face: 'top', type: 'magnet' }), /not a coverType/);
  assert.throws(() => checkOpShape({ op: 'addSpike', level: 0, junction: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }], variant: 'full' }), /not a spikeVariant/);
  assert.throws(() => checkOpShape({ op: 'place', at: { q: 0, r: 0 }, variant: 'full' }), /at must be a cell/);
  assert.doesNotThrow(() => checkOpShape({ op: 'setSpikeAccessory', level: 0, junction: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }], accessory: null }));
  assert.doesNotThrow(() => checkOpShape({ op: 'addCover', at: { q: 0, r: 0, level: 0 }, variant: 'half-n', face: 'top', type: 'grate-pvc' }));
});

test('find_parts matches any word and ranks by how many match', async () => {
  const { createTools } = await import('../src/tools.mjs');
  const parts = [
    { value: 'hex-cover-grate', op: 'x', field: 'f', family: 'cover', name: 'Grate cover', use: 'a vent face', box: null, released: true },
    { value: 'hex-port-louvre', op: 'addPort', field: 'stem', family: 'port', name: 'Louvre port', use: 'vents a closed cell', box: null, released: true },
    { value: 'hex-bin-full', op: 'addBin', field: 'stem', family: 'bin', name: 'Bin', use: 'holds things', box: null, released: true },
  ];
  const t = createTools({ call: async () => parts });
  const r = await t.run('find_parts', { text: 'louvre vent grate' });
  assert.deepEqual(r.parts.map((p) => p.value), ['hex-cover-grate', 'hex-port-louvre']);
  const one = await t.run('find_parts', { text: 'louvre' });
  assert.deepEqual(one.parts.map((p) => p.value), ['hex-port-louvre']);
});
