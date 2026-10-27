import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeModel, toMessages, parseMessage, claudeCostUsd } from '../src/claude.mjs';
import { runAgent } from '../src/agent.mjs';

const fakeClient = (responses, seen = []) => {
  let i = 0;
  const create = async (params) => {
    seen.push(params);
    return responses[i++];
  };
  return { messages: { create }, beta: { messages: { create } } };
};

const toolTurn = (id, name, input) => ({
  id: `m${id}`, model: 'claude-opus-5-5', stop_reason: 'tool_use',
  content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: `t${id}`, name, input }],
  usage: { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 0, output_tokens: 50 },
});

test('items become append-only Messages turns, parallel results in one user turn', () => {
  const assistant = [{ type: 'tool_use', id: 'a', name: 'x', input: {} }, { type: 'tool_use', id: 'b', name: 'y', input: {} }];
  const m = toMessages([
    { role: 'user', content: 'brief' },
    { type: 'claude_assistant', content: assistant },
    { type: 'function_call_output', call_id: 'a', output: '1' },
    { type: 'function_call_output', call_id: 'b', output: '2' },
  ]);
  assert.equal(m.length, 3);
  assert.equal(m[1].content, assistant);
  assert.deepEqual(m[2].content.map((r) => r.tool_use_id), ['a', 'b']);
});

test('Opus and Sonnet ask for the server-side fallback; Haiku does not', async () => {
  for (const [model, wantFallback] of [['claude-opus-5-5', true], ['claude-sonnet-5-5', true], ['claude-haiku-5-5', false]]) {
    const seen = [];
    const m = claudeModel({ model, client: fakeClient([toolTurn(1, 'get_build', {})], seen) });
    await m.next({ instructions: 'i', items: [{ role: 'user', content: 'b' }], tools: [] });
    assert.equal(seen[0].fallbacks === 'default', wantFallback, model);
  }
});

test('a refusal stops the run instead of reading empty content', async () => {
  const m = claudeModel({ client: fakeClient([{ id: 'r', model: 'claude-opus-5-5', stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [], usage: {} }]) });
  const r = await runAgent({ hex: { call: async () => ({}) }, model: m, brief: 'x' });
  assert.equal(r.stop, 'model error');
});

test('cost counts cache reads cheap and cache writes at 1.25x', () => {
  const u = parseMessage(toolTurn(1, 'x', {})).usage;
  assert.equal(u.inputTokens, 1000);
  assert.equal(claudeCostUsd('claude-opus-5-5', u), (100 * 4 + 900 * 0.2 + 50 * 20) / 1e6);
  assert.equal(claudeCostUsd('claude-opus-5-5', { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 100, outputTokens: 0 }), (100 * 4 * 1.25) / 1e6);
});

test('the full loop runs on the Claude adapter and replays thinking blocks unchanged', async () => {
  const seen = [];
  const finish = { requirements: [], summary: 's' };
  const m = claudeModel({ client: fakeClient([toolTurn(1, 'get_build', {}), toolTurn(2, 'finish', finish)], seen) });
  const hex = { call: async () => ({ state: {}, nodes: [], staging: {} }) };
  const r = await runAgent({ hex, model: m, brief: 'x' });
  assert.deepEqual(r.finish, finish);
  assert.equal(seen[1].messages[1].content[0].signature, 'sig');
  assert.equal(seen[1].messages[2].content[0].type, 'tool_result');
});
