import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basetenModel, toChat, parseChat, basetenCostUsd, BASETEN_MODEL } from '../src/baseten.mjs';
import { runAgent } from '../src/agent.mjs';
import { costUsd } from '../src/model.mjs';

const reply = (id, calls, usage = { prompt_tokens: 1000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 800 } }) => ({
  ok: true,
  text: async () => JSON.stringify({
    id, model: BASETEN_MODEL,
    choices: [{ message: { role: 'assistant', content: null, reasoning_content: 'hidden', tool_calls: calls.map(([cid, name, args]) => ({ id: cid, type: 'function', function: { name, arguments: JSON.stringify(args) } })) } }],
    usage,
  }),
});

test('requests go to the chat endpoint with a bearer key and function tools', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init }); return reply('r1', [['c1', 'get_build', {}]]); };
  const m = basetenModel({ apiKey: 'k', fetchImpl });
  const r = await m.next({ instructions: 'sys', items: [{ role: 'user', content: 'brief' }], tools: [{ name: 'get_build', description: 'd', parameters: { type: 'object' } }] });
  assert.equal(seen[0].url, 'https://inference.baseten.co/v1/chat/completions');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer k');
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.model, 'meta-models/muse-spark-open');
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.tools[0].function.name, 'get_build');
  assert.deepEqual(r.calls, [{ callId: 'c1', name: 'get_build', arguments: '{}' }]);
});

test('assistant turns are replayed without reasoning_content, tool results as tool messages', () => {
  const r = parseChat(JSON.parse('{"id":"x","choices":[{"message":{"role":"assistant","content":null,"reasoning_content":"r","tool_calls":[{"id":"c1","type":"function","function":{"name":"a","arguments":"{}"}}]}}],"usage":{}}'));
  const m = toChat([{ role: 'user', content: 'b' }, ...r.output, { type: 'function_call_output', call_id: 'c1', output: '{"ok":true}' }]);
  assert.deepEqual(m.map((x) => x.role), ['user', 'assistant', 'tool']);
  assert.equal('reasoning_content' in m[1], false);
  assert.equal(m[2].tool_call_id, 'c1');
});

test('cost uses the published Baseten rates with cached input', () => {
  const u = { inputTokens: 1000, cachedInputTokens: 800, outputTokens: 100 };
  assert.equal(basetenCostUsd(BASETEN_MODEL, u), (200 * 1.25 + 800 * 0.15 + 100 * 4.25) / 1e6);
  assert.equal(costUsd(BASETEN_MODEL, u), basetenCostUsd(BASETEN_MODEL, u));
});

test('the full loop runs on the Baseten adapter', async () => {
  const finish = { requirements: [{ requirement: 'r', status: 'met', evidence: 'e' }], summary: 's' };
  const replies = [reply('r1', [['c1', 'get_build', {}]]), reply('r2', [['c2', 'finish', finish]])];
  const bodies = [];
  const fetchImpl = async (url, init) => { bodies.push(JSON.parse(init.body)); return replies.shift(); };
  const r = await runAgent({ hex: { call: async () => ({ nodes: [] }) }, model: basetenModel({ apiKey: 'k', fetchImpl }), brief: 'x' });
  assert.deepEqual(r.finish, finish);
  assert.deepEqual(bodies[1].messages.map((x) => x.role), ['system', 'user', 'assistant', 'tool']);
});
