// Muse Spark Open (Meta open weights) through Baseten's pay-per-token Model
// API, OpenAI Chat Completions shape. Same next() interface as the other
// adapters. Traces say provider "baseten" and model "meta-models/muse-spark-open":
// a Meta model, but not the Model API's muse-spark-1.3, and reported as such.

export const BASETEN_BASE = 'https://inference.baseten.co/v1';
export const BASETEN_MODEL = 'meta-models/muse-spark-open';
// USD per 1M tokens, from https://www.baseten.co/library/muse-spark-open/ (2026-10-27).
export const BASETEN_PRICES = { [BASETEN_MODEL]: { input: 1.25, cached: 0.15, output: 4.25 } };

export function basetenModel({ model = BASETEN_MODEL, apiKey = process.env.BASETEN_API_KEY, effort = 'medium', timeoutMs = 120_000, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('BASETEN_API_KEY is not set (see .env.example)');
  if (!BASETEN_PRICES[model]) throw new Error(`no price for ${model}`);
  return {
    kind: 'live',
    provider: 'baseten',
    model,
    async next({ instructions, items, tools }) {
      const body = {
        model,
        messages: [{ role: 'system', content: instructions }, ...toChat(items)],
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        tool_choice: 'auto',
        reasoning_effort: effort,
        max_completion_tokens: 16000,
      };
      const res = await fetchImpl(`${BASETEN_BASE}/chat/completions`, {
        method: 'POST',
        // Baseten's OpenAI-compatible endpoint takes the key as a bearer token (its example uses the OpenAI client).
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await res.text();
      if (!res.ok) throw Object.assign(new Error(`Baseten ${res.status}: ${raw.slice(0, 500)}`), { status: res.status });
      return parseChat(JSON.parse(raw));
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
    },
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
