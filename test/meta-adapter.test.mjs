import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaModel, parseResponse } from '../src/model.mjs';

const reply = {
  id: 'resp_1',
  model: 'muse-spark-1.3-2026-10-20',
  output: [{ type: 'function_call', call_id: 'c1', name: 'get_build', arguments: '{}' }],
  usage: { input_tokens: 1000, output_tokens: 50, input_tokens_details: { cached_tokens: 600 }, output_tokens_details: { reasoning_tokens: 30 } },
};

test('parseResponse: served model, reasoning tokens and whether caching was reported', () => {
  const r = parseResponse(reply);
  assert.equal(r.servedBy, 'muse-spark-1.3-2026-10-20');
  assert.equal(r.usage.reasoningTokens, 30);
  assert.equal(r.usage.cachedInputTokens, 600);
  assert.equal(r.usage.cachedReported, true);
  const bare = parseResponse({ output: [], usage: { input_tokens: 5, output_tokens: 1 } });
  assert.equal(bare.usage.cachedReported, false);
  assert.equal(bare.usage.reasoningTokens, null);
});

test('metaModel.next: the call is timed and its request parameters recorded', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(reply) });
  const m = metaModel({ model: 'muse-spark-1.3', apiKey: 'test', reasoningEffort: 'low', fetchImpl });
  const r = await m.next({ instructions: 'x', items: [], tools: [] });
  assert.equal(typeof r.http.ms, 'number');
  assert.equal(r.http.status, 200);
  assert.equal(typeof r.http.inFlight, 'number');
  assert.equal(r.params.reasoningEffort, 'low');
  assert.equal(r.calls[0].name, 'get_build');
});

test('metaModel.next: an HTTP error carries its timing and the key never appears in it', async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, text: async () => 'rate limited' });
  const m = metaModel({ model: 'muse-spark-1.3', apiKey: 'secret-key-123', fetchImpl });
  await assert.rejects(m.next({ instructions: 'x', items: [], tools: [] }), (e) => e.status === 429 && e.http?.status === 429 && !String(e.message).includes('secret-key-123'));
});
