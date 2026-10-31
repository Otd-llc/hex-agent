// Model adapters. One interface: next({ instructions, items, tools }) ->
// { output, calls, text, usage }. `items` is the running Responses-API input
// list; the agent appends our function_call_output items to it.
//
// Meta Model API, Responses protocol, Standard mode only: a model id ending in
// -contributor is refused here, because Contributor mode may train on input.

import { claudeCostUsd } from './claude.mjs';
import { basetenCostUsd } from './baseten.mjs';
import { hostOf, hostedCostUsd } from './hosted.mjs';

export const META_BASE = 'https://api.meta.ai/v1';

// USD per 1M tokens, Standard mode, from https://dev.meta.ai/docs/pricing-rate-limits (2026-10-27).
export const PRICES = {
  'muse-wonder-1.0': { input: 4.0, cached: 0.2, output: 20.0 },
  'muse-spark-1.3': { input: 1.25, cached: 0.15, output: 4.25 },
};

export function costUsd(model, usage) {
  if (model.startsWith('claude-')) return claudeCostUsd(model, usage);
  if (model.startsWith('meta-models/')) return basetenCostUsd(model, usage);
  if (hostOf(model)) return hostedCostUsd(model, usage);
  const p = PRICES[model];
  if (!p || !usage) return null;
  const cached = usage.cachedInputTokens ?? 0;
  return ((usage.inputTokens - cached) * p.input + cached * p.cached + usage.outputTokens * p.output) / 1e6;
}

export function metaModel({ model = 'muse-wonder-1.0', apiKey = process.env.MODEL_API_KEY, reasoningEffort = 'medium', timeoutMs = 120_000, fetchImpl = fetch } = {}) {
  if (/-contributor$/.test(model)) throw new Error(`refusing Contributor-mode model ${model}: use a Standard-mode id`);
  if (!apiKey) throw new Error('MODEL_API_KEY is not set (see .env.example)');
  return {
    kind: 'live',
    provider: 'meta',
    model,
    effort: reasoningEffort,
    async next({ instructions, items, tools }) {
      const body = {
        model,
        instructions,
        input: items,
        tools: tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })),
        reasoning: { effort: reasoningEffort },
        // Caching is automatic; the loop only appends, so each turn's prefix is
        // the last turn's request. One key for every run keeps the shared
        // instructions and tools prefix warm across runs too.
        prompt_cache_key: 'hex-agent-v1',
        prompt_cache_retention: '24h',
      };
      const res = await fetchImpl(`${META_BASE}/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await res.text();
      if (!res.ok) throw Object.assign(new Error(`Meta API ${res.status}: ${raw.slice(0, 500)}`), { status: res.status });
      return parseResponse(JSON.parse(raw));
    },
  };
}

export function parseResponse(json) {
  const output = json.output ?? [];
  const calls = output
    .filter((o) => o.type === 'function_call')
    .map((o) => ({ callId: o.call_id, name: o.name, arguments: o.arguments }));
  const text = output
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('\n');
  const u = json.usage ?? {};
  const usage = {
    inputTokens: u.input_tokens ?? u.prompt_tokens ?? 0,
    outputTokens: u.output_tokens ?? u.completion_tokens ?? 0,
    cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
  };
  return { id: json.id, output, calls, text, usage };
}

// A scripted stand-in for tests. Every trace it touches says kind: 'mock'.
export function mockModel(script) {
  let i = 0;
  return {
    kind: 'mock',
    provider: 'mock',
    model: 'scripted',
    async next(ctx) {
      const step = typeof script === 'function' ? script(ctx, i) : script[i];
      i++;
      if (!step) throw new Error('mock script exhausted');
      const output = step.map((c, k) => ({
        type: 'function_call',
        call_id: `mock-${i}-${k}`,
        name: c.name,
        arguments: JSON.stringify(c.args ?? {}),
      }));
      return parseResponse({ id: `mock-${i}`, output, usage: { input_tokens: 0, output_tokens: 0 } });
    },
  };
}
