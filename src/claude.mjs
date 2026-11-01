// Claude adapter, for development and a labeled baseline only: traces it
// touches say provider "anthropic", and no Claude run is ever presented as a
// Muse run. Same next() interface as the Meta adapter; it converts the
// loop's Responses-style item list into Messages API turns, append-only, so
// assistant content (thinking blocks included) is replayed exactly as returned.
import Anthropic from '@anthropic-ai/sdk';

// USD per 1M tokens (Anthropic first-party rates; cache writes bill at 1.25x input).
export const CLAUDE_PRICES = {
  'claude-opus-5-5': { input: 4.0, cached: 0.2, output: 20.0 },
  'claude-sonnet-5-5': { input: 2.0, cached: 0.2, output: 10.0 },
  'claude-haiku-5-5': { input: 0.1, cached: 0.01, output: 0.5 },
};
// Server-side refusal fallback ("default" form) is offered on Opus 5.5 and Sonnet 5.5, not Haiku 5.5.
const FALLBACK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

export function claudeModel({ model = 'claude-opus-5-5', effort = 'medium', client = new Anthropic() } = {}) {
  if (!CLAUDE_PRICES[model]) throw new Error(`no price for ${model}: add it to CLAUDE_PRICES first`);
  return {
    kind: 'live',
    provider: 'anthropic',
    model,
    effort,
    async next({ instructions, items, tools }) {
      const params = {
        model,
        max_tokens: 16000,
        system: instructions,
        messages: toMessages(items),
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        output_config: { effort },
        cache_control: { type: 'ephemeral' },
      };
      // The same per-call record the HTTP adapters keep (the SDK hides the status of a success: 200).
      const http = { startedAt: new Date().toISOString() };
      const t0 = Date.now();
      let res;
      try {
        res = FALLBACK.has(model)
          ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
          : await client.messages.create(params);
      } catch (e) {
        throw Object.assign(e, { http: { ...http, endedAt: new Date().toISOString(), ms: Date.now() - t0, status: e.status ?? null } });
      }
      Object.assign(http, { endedAt: new Date().toISOString(), ms: Date.now() - t0, status: 200 });
      if (res.stop_reason === 'refusal') {
        throw new Error(`Claude declined (${res.stop_details?.category ?? 'no category'}): ${res.stop_details?.explanation ?? ''}`);
      }
      return { ...parseMessage(res), http, params: { reasoningEffort: effort, temperature: null, topP: null, maxCompletionTokens: params.max_tokens, toolChoice: null } };
    },
  };
}

export function parseMessage(res) {
  const calls = res.content
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ callId: b.id, name: b.name, arguments: JSON.stringify(b.input ?? {}) }));
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const u = res.usage ?? {};
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  return {
    id: res.id,
    servedBy: res.model,
    // One item carrying the assistant turn verbatim; toMessages() unwraps it.
    output: [{ type: 'claude_assistant', content: res.content }],
    calls,
    text,
    usage: { inputTokens: (u.input_tokens ?? 0) + read + write, cachedInputTokens: read, cacheWriteTokens: write, outputTokens: u.output_tokens ?? 0 },
  };
}

// Items -> Messages turns. Consecutive tool outputs go back in one user turn,
// so parallel calls get all their results together.
export function toMessages(items) {
  const messages = [];
  let results = null;
  const flush = () => {
    if (results) messages.push({ role: 'user', content: results });
    results = null;
  };
  for (const it of items) {
    if (it.type === 'function_call_output') {
      (results ??= []).push({ type: 'tool_result', tool_use_id: it.call_id, content: it.output });
      continue;
    }
    flush();
    if (it.type === 'claude_assistant') messages.push({ role: 'assistant', content: it.content });
    else if (it.role === 'user') messages.push({ role: 'user', content: it.content });
  }
  flush();
  return messages;
}

export function claudeCostUsd(model, usage) {
  const p = CLAUDE_PRICES[model];
  if (!p || !usage) return null;
  const read = usage.cachedInputTokens ?? 0;
  const write = usage.cacheWriteTokens ?? 0;
  const fresh = usage.inputTokens - read - write;
  return (fresh * p.input + write * p.input * 1.25 + read * p.cached + usage.outputTokens * p.output) / 1e6;
}
