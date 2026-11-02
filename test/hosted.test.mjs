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
    delete process.env.FIREWORKS_RESERVE_USD;
    delete process.env.META_API_ALLOWED;
    // Unset: the $100 credit and the $5 floor, fixed in code.
    const d = modelFor({ modelId: 'accounts/fireworks/models/muse-spark-open', purpose: 'dev' });
    assert.deepEqual([d.ledger.creditUsd, d.ledger.reserveUsd], [100, 5]);
    // Settings may tighten, never loosen, and must be numbers.
    for (const [k, v, re] of [['FIREWORKS_CREDIT_USD', '150', /above the fireworks credit/], ['FIREWORKS_CREDIT_USD', 'abc', /FIREWORKS_CREDIT_USD/], ['FIREWORKS_CREDIT_USD', '0', /FIREWORKS_CREDIT_USD/], ['FIREWORKS_RESERVE_USD', '2', /below the floor/], ['FIREWORKS_RESERVE_USD', 'x', /must be a number/]]) {
      process.env[k] = v;
      assert.throws(() => modelFor({ modelId: 'accounts/fireworks/models/muse-spark-open', purpose: 'dev' }), re, `${k}=${v}`);
      delete process.env[k];
    }
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

// An event-stream reply: each item is a chunk object, a raw string, or { hang: true } to go silent.
const sse = (parts) => {
  const enc = new TextEncoder();
  let i = 0;
  const body = new ReadableStream({
    async pull(c) {
      if (i >= parts.length) return c.close();
      const p = parts[i++];
      if (p?.hang) return new Promise(() => {});
      c.enqueue(enc.encode(typeof p === 'string' ? p : `data: ${JSON.stringify(p)}\n\n`));
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
};
const FW = 'accounts/fireworks/models/muse-spark-open';
const delta = (d, extra = {}) => ({ id: 's1', model: FW, choices: [{ index: 0, delta: d, finish_reason: null }], ...extra });
const usage = { prompt_tokens: 1000, completion_tokens: 60, prompt_tokens_details: { cached_tokens: 900 }, completion_tokens_details: { reasoning_tokens: 40 } };

test('Fireworks streams: tool-call pieces and usage put back together, a 4000-token cap, chunks in the trace', async () => {
  const seen = [];
  const m = hostedModel({ model: FW, apiKey: 'fk', fetchImpl: async (url, init) => (seen.push(JSON.parse(init.body)), sse([
    delta({ role: 'assistant', reasoning_content: 'think' }),
    delta({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'apply', arguments: '{"ops":' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: '[]}' } }] }),
    { id: 's1', model: FW, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
    { id: 's1', model: FW, choices: [], usage },
    'data: [DONE]\n\n',
  ])) });
  const r = await ask(m);
  assert.equal(seen[0].stream, true);
  assert.deepEqual(seen[0].stream_options, { include_usage: true });
  assert.equal(seen[0].max_completion_tokens, 4000);
  assert.deepEqual(r.calls, [{ callId: 'c1', name: 'apply', arguments: '{"ops":[]}' }]);
  assert.equal(r.servedBy, FW);
  assert.deepEqual([r.usage.inputTokens, r.usage.cachedInputTokens, r.usage.outputTokens, r.usage.reasoningTokens], [1000, 900, 60, 40]);
  assert.equal(r.http.stream, true);
  assert.equal(r.http.chunks, 5);
  assert.equal(typeof r.http.firstByteMs, 'number');
  assert.equal(r.params.maxCompletionTokens, 4000);
});

test('Fireworks: a silent stream is dropped at stallMs and says how many chunks came first', async () => {
  const m = hostedModel({ model: FW, apiKey: 'fk', stallMs: 40, fetchImpl: async () => sse([delta({ content: 'hi' }), { hang: true }]) });
  await assert.rejects(ask(m), (e) => e.name === 'StallError' && e.http.chunks === 1 && e.http.firstByteMs != null && e.status == null);
});

test('Fireworks: a request that never answers (queued) stalls with 0 chunks and no first byte', async () => {
  const fetchImpl = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const m = hostedModel({ model: FW, apiKey: 'fk', stallMs: 40, fetchImpl });
  await assert.rejects(ask(m), (e) => e.name === 'StallError' && e.http.chunks === 0 && e.http.firstByteMs === null && /first byte never/.test(e.message));
});

test('Fireworks: a stream with no usage is refused, so the ledger never prices a call at 0', async () => {
  const m = hostedModel({ model: FW, apiKey: 'fk', fetchImpl: async () => sse([delta({ content: 'hi' }), 'data: [DONE]\n\n']) });
  await assert.rejects(ask(m), /without usage/);
});

test('Fireworks: an error status is read whole, not as a stream', async () => {
  const m = hostedModel({ model: FW, apiKey: 'fk', fetchImpl: async () => new Response('{"error":"busy"}', { status: 429 }) });
  await assert.rejects(ask(m), (e) => e.status === 429 && /busy/.test(e.message));
});

test('Modal does not stream and keeps its 16000-token cap', async () => {
  const seen = [];
  const m = hostedModel({ model: 'modal:muse.us-west.modal.direct', apiKey: 'pt', fetchImpl: async (url, init) => (seen.push(JSON.parse(init.body)), reply('x')) });
  await ask(m);
  assert.equal('stream' in seen[0], false);
  assert.equal(seen[0].max_completion_tokens, 16000);
});
