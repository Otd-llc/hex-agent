import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLedger } from '../src/ledger.mjs';
import { runAgent } from '../src/agent.mjs';

const fresh = (opts = {}) =>
  openLedger({ path: join(mkdtempSync(join(tmpdir(), 'ledger-')), 'l.jsonl'), creditUsd: 150, reserveUsd: 50, caps: { dev: 45, eval: 40 }, ...opts });

test('dev is held to its cap', () => {
  const l = fresh();
  l.add({ purpose: 'dev', costUsd: 44 });
  assert.equal(l.headroom('dev'), 1);
  l.add({ purpose: 'dev', costUsd: 2 });
  assert.ok(l.headroom('dev') < 0);
});

test('the judging reserve is untouchable by dev and eval, but not by demo', () => {
  const l = fresh({ caps: { dev: 200, eval: 200 } });
  l.add({ purpose: 'dev', costUsd: 95 });
  assert.equal(l.headroom('dev'), 5);
  assert.equal(l.headroom('eval'), 5);
  assert.equal(l.headroom('demo'), 55);
});

test('a run with no headroom stops before calling the model', async () => {
  const l = fresh();
  l.add({ purpose: 'dev', costUsd: 45 });
  let called = false;
  const model = { kind: 'live', provider: 'meta', model: 'muse-spark-1.3', next: async () => { called = true; } };
  const hex = { call: async () => ({ nodes: [] }) };
  const r = await runAgent({ hex, model, brief: 'x', ledger: l, purpose: 'dev' });
  assert.equal(called, false);
  assert.equal(r.stop, 'dev credit budget');
});

test('every live model call is recorded', async () => {
  const l = fresh();
  const model = {
    kind: 'live', provider: 'meta', model: 'muse-spark-1.3',
    next: async () => ({ id: 'r', output: [{ type: 'function_call', call_id: 'c', name: 'finish', arguments: '{"requirements":[{"requirement":"r","status":"met","evidence":"e"}],"summary":"s"}' }],
      calls: [{ callId: 'c', name: 'finish', arguments: '{"requirements":[{"requirement":"r","status":"met","evidence":"e"}],"summary":"s"}' }], text: '',
      usage: { inputTokens: 100000, outputTokens: 10000, cachedInputTokens: 0 } }),
  };
  await runAgent({ hex: { call: async () => ({}) }, model, brief: 'x', ledger: l, purpose: 'eval', runId: 'r1' });
  assert.equal(l.spent('eval'), (100000 * 1.25 + 10000 * 4.25) / 1e6);
});
