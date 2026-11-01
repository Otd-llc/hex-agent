import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostedModel, hostOf, hostedCostUsd } from '../src/hosted.mjs';
import { costUsd } from '../src/model.mjs';
import { modelFor } from '../src/session.mjs';

const reply = (model) => ({
  ok: true,
  text: async () => JSON.stringify({
    id: 'r1', model,
    choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_build', arguments: '{}' } }] } }],
    usage: { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 800 } },
  }),
});
const ask = async (m) => m.next({ instructions: 'sys', items: [{ role: 'user', content: 'brief' }], tools: [{ name: 'get_build', description: 'd', parameters: { type: 'object' } }] });

test('Fireworks: chat endpoint, bearer key, the full model id, no effort unless asked', async () => {
  const seen = [];
  const m = hostedModel({ model: 'accounts/fireworks/models/muse-spark-open', apiKey: 'fk', fetchImpl: async (url, init) => (seen.push({ url, init }), reply('x')) });
  assert.equal(m.provider, 'fireworks');
  const r = await ask(m);
  assert.equal(seen[0].url, 'https://api.fireworks.ai/inference/v1/chat/completions');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer fk');
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.model, 'accounts/fireworks/models/muse-spark-open');
  assert.equal('reasoning_effort' in body, false);
  assert.deepEqual(r.calls, [{ callId: 'c1', name: 'get_build', arguments: '{}' }]);
  const low = hostedModel({ model: 'accounts/fireworks/models/muse-spark-open', apiKey: 'fk', effort: 'low', fetchImpl: async (u, init) => (seen.push({ init }), reply('x')) });
  await ask(low);
  assert.equal(JSON.parse(seen[1].init.body).reasoning_effort, 'low');
});

test('Modal: the shared us-west endpoint, routed by the endpoint host as the model', async () => {
  const seen = [];
  const m = hostedModel({ model: 'modal:muse.us-west.modal.direct', apiKey: 'pt', fetchImpl: async (url, init) => (seen.push({ url, init }), reply('x')) });
  assert.equal(m.provider, 'modal');
  assert.equal(m.model, 'modal:muse.us-west.modal.direct');
  await ask(m);
  assert.equal(seen[0].url, 'https://inference.us-west.modal.direct/v1/chat/completions');
  assert.equal(JSON.parse(seen[0].init.body).model, 'muse.us-west.modal.direct');
  assert.throws(() => hostedModel({ model: 'modal:', apiKey: 'pt' }), /endpoint host/);
});

test('keys come from the environment and are required; unknown ids are refused', () => {
  assert.throws(() => hostedModel({ model: 'accounts/fireworks/models/muse-spark-open', env: {} }), /FIREWORKS_API_KEY/);
  assert.throws(() => hostedModel({ model: 'modal:x.us-west.modal.direct', env: {} }), /MODAL_PROXY_TOKEN/);
  assert.throws(() => hostedModel({ model: 'accounts/fireworks/models/llama-x', apiKey: 'k' }), /no price/);
  assert.throws(() => hostedModel({ model: 'muse-spark-1.3', apiKey: 'k' }), /not a Fireworks/);
  assert.equal(hostOf('meta-models/muse-spark-open-1026'), null, 'Baseten ids stay Baseten');
});

test('both hosts are priced per token at the published Muse Spark Open rates', () => {
  const u = { inputTokens: 1000, cachedInputTokens: 800, outputTokens: 100 };
  const want = (200 * 1.25 + 800 * 0.15 + 100 * 4.25) / 1e6;
  assert.equal(hostedCostUsd('accounts/fireworks/models/muse-spark-open', u), want);
  assert.equal(costUsd('modal:muse.us-west.modal.direct', u), want);
});

test('modelFor: each host has its own ledger and needs its credit set; the Meta Model API is off', () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { FIREWORKS_API_KEY: 'k', MODAL_PROXY_TOKEN: 't' });
    delete process.env.FIREWORKS_CREDIT_USD;
    delete process.env.META_API_ALLOWED;
    assert.throws(() => modelFor({ modelId: 'accounts/fireworks/models/muse-spark-open', purpose: 'dev' }), /FIREWORKS_CREDIT_USD/);
    process.env.FIREWORKS_CREDIT_USD = '25';
    const f = modelFor({ modelId: 'accounts/fireworks/models/muse-spark-open', purpose: 'dev' });
    assert.match(f.ledger.path.replace(/\\/g, '/'), /\/\.spend\/fireworks\.jsonl$/);
    assert.equal(f.ledger.creditUsd, 25);
    process.env.MODAL_CREDIT_USD = '30';
    // The Shared path bills the card: refused whatever is set.
    Object.assign(process.env, { MODAL_ALLOWED: '1', MODAL_DEDICATED_ALLOWED: '1' });
    assert.throws(() => modelFor({ modelId: 'modal:m.us-west.modal.direct', purpose: 'eval' }), /bill the card/);
    assert.throws(() => modelFor({ modelId: 'muse-spark-1.3', purpose: 'dev' }), /Meta Model API is off/);
    assert.throws(() => modelFor({ modelId: 'modl:typo', purpose: 'dev' }), /not a known model id/);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
