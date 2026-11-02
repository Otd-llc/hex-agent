// Muse Spark Open (Meta open weights) through Baseten's pay-per-token Model
// API, OpenAI Chat Completions shape. Same next() interface as the other
// adapters. Traces say provider "baseten" and model "meta-models/muse-spark-open":
// a Meta model, but not the Model API's muse-spark-1.3, and reported as such.

import { timedPost, requestParams, toolChoice } from './http.mjs';

export const BASETEN_BASE = 'https://inference.baseten.co/v1';
// "[HACKATHON] Muse Spark Open" (Muse-Spark-Open-816B-A42B-NVFP4) is the id
// this account can call; the general meta-models/muse-spark-open returns 403
// for it (checked 2026-10-27 against /v1/models and a live call).
export const BASETEN_MODEL = 'meta-models/muse-spark-open-1026';
// USD per 1M tokens, from https://www.baseten.co/library/muse-spark-open/ and
// the /v1/models pricing field (both models list the same rates), 2026-10-27.
const MUSE_SPARK_OPEN = { input: 1.25, cached: 0.15, output: 4.25 };
export const BASETEN_PRICES = { 'meta-models/muse-spark-open-1026': MUSE_SPARK_OPEN, 'meta-models/muse-spark-open': MUSE_SPARK_OPEN };

export function basetenModel({ model = BASETEN_MODEL, apiKey = process.env.BASETEN_API_KEY, effort = 'medium', timeoutMs = 120_000, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('BASETEN_API_KEY is not set (see .env.example)');
  if (!BASETEN_PRICES[model]) throw new Error(`no price for ${model}`);
  return {
    kind: 'live',
    provider: 'baseten',
    model,
    effort,
    async next({ instructions, items, tools }) {
      const body = {
        model,
        messages: [{ role: 'system', content: instructions }, ...toChat(items)],
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        // 'required' only once a smoke shows the host takes it (MUSE_TOOL_CHOICE); 'auto' otherwise.
        tool_choice: toolChoice(),
        reasoning_effort: effort,
        max_completion_tokens: 16000,
      };
      const { res, raw, http } = await timedPost(fetchImpl, `${BASETEN_BASE}/chat/completions`, {
        // Baseten's OpenAI-compatible endpoint takes the key as a bearer token (its example uses the OpenAI client).
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body,
        timeoutMs,
      });
      if (!res.ok) throw Object.assign(new Error(`Baseten ${res.status}: ${raw.slice(0, 500)}`), { status: res.status, http });
      return { ...parseChat(JSON.parse(raw)), http, params: requestParams(body) };
    },
  };
}

export function parseChat(json) {
  const msg = json.choices?.[0]?.message ?? {};
  const calls = (msg.tool_calls ?? []).map((c) => ({ callId: c.id, name: c.function?.name, arguments: c.function?.arguments ?? '{}' }));
  const u = json.usage ?? {};
  return {
    id: json.id,
    servedBy: json.model,
    // Keep only what Chat Completions takes back as an assistant turn.
    output: [{ type: 'chat_assistant', message: { role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) } }],
    calls,
    text: typeof msg.content === 'string' ? msg.content : '',
    usage: {
      inputTokens: u.prompt_tokens ?? 0,
      outputTokens: u.completion_tokens ?? 0,
      cachedInputTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
      // null when the host does not say, so "0 cached" and "not reported" stay apart (E14).
      // Modal's Dedicated Endpoint puts reasoning_tokens at the top of usage.
      reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? u.reasoning_tokens ?? null,
      cachedReported: u.prompt_tokens_details?.cached_tokens != null,
    },
    // The usage object exactly as the host sent it.
    rawUsage: json.usage ?? null,
  };
}

// Loop items -> Chat Completions messages.
export function toChat(items) {
  const out = [];
  for (const it of items) {
    if (it.type === 'chat_assistant') out.push(it.message);
    else if (it.type === 'function_call_output') out.push({ role: 'tool', tool_call_id: it.call_id, content: it.output });
    else if (it.role === 'user') out.push({ role: 'user', content: it.content });
  }
  return out;
}

export function basetenCostUsd(model, usage) {
  const p = BASETEN_PRICES[model];
  if (!p || !usage) return null;
  const cached = usage.cachedInputTokens ?? 0;
  return ((usage.inputTokens - cached) * p.input + cached * p.cached + usage.outputTokens * p.output) / 1e6;
}
