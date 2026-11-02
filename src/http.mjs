// One model request, timed: when it was sent and answered, its HTTP status, and
// how many requests this process had in flight when it went out, so latency can
// be read against load (traces keep it per model call).
let inFlight = 0;

export const requestsInFlight = () => inFlight;

export async function timedPost(fetchImpl, url, { headers, body, timeoutMs }) {
  const http = { startedAt: new Date().toISOString(), inFlight: ++inFlight };
  const t0 = Date.now();
  try {
    const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const raw = await res.text();
    Object.assign(http, { status: res.status, endedAt: new Date().toISOString(), ms: Date.now() - t0 });
    return { res, raw, http };
  } catch (e) {
    Object.assign(http, { status: null, endedAt: new Date().toISOString(), ms: Date.now() - t0, error: String(e.name ?? 'Error') });
    throw Object.assign(e, { http });
  } finally {
    inFlight--;
  }
}

// One streamed Chat Completions request, timed like timedPost, put back together as the
// one JSON reply a non-streamed request gets, so parseChat reads either. It aborts when
// no bytes arrive for stallMs (F1, 2026-11-02: 36 Fireworks calls hung to the 120 s
// timeout with nothing to say why). The trace keeps time to first byte and the data
// chunks seen: a stall with 0 chunks is a queue, one with chunks is a long generation.
// A reply that is not an event stream (an error body, a host that ignores stream) is read whole.
export async function streamPost(fetchImpl, url, { headers, body, timeoutMs, stallMs }) {
  const http = { startedAt: new Date().toISOString(), inFlight: ++inFlight, stream: true, firstByteMs: null, chunks: 0 };
  const t0 = Date.now();
  const ctl = new AbortController();
  let why = null;
  let reader = null;
  // Cancelling the reader too ends a pending read even when the body is not tied to the signal.
  const stop = (name) => { why ??= name; ctl.abort(); reader?.cancel().catch(() => {}); };
  const total = setTimeout(() => stop('TimeoutError'), timeoutMs);
  let stall = setTimeout(() => stop('StallError'), stallMs);
  const fed = () => { clearTimeout(stall); stall = setTimeout(() => stop('StallError'), stallMs); };
  const end = (extra) => Object.assign(http, { endedAt: new Date().toISOString(), ms: Date.now() - t0, ...extra });
  try {
    const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
    http.status = res.status;
    const eventStream = /text\/event-stream/i.test(res.headers?.get?.('content-type') ?? '') && res.body?.getReader;
    if (!res.ok || !eventStream) {
      const raw = await res.text();
      end({});
      return { res, raw, http };
    }
    reader = res.body.getReader();
    const dec = new TextDecoder();
    const acc = { id: null, model: null, content: '', calls: [], finish: null, usage: null };
    let buf = '';
    let done = false;
    while (!done) {
      const r = await reader.read();
      if (r.done) break;
      http.firstByteMs ??= Date.now() - t0;
      fed();
      buf += dec.decode(r.value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { done = true; break; }
        http.chunks++;
        addChunk(acc, JSON.parse(data));
      }
    }
    reader.cancel().catch(() => {});
    if (!acc.usage) throw Object.assign(new Error('stream ended without usage: the spend ledger cannot price this call'), { name: 'NoUsageError' });
    end({});
    const message = { role: 'assistant', content: acc.content || null, ...(acc.calls.length ? { tool_calls: acc.calls.filter(Boolean) } : {}) };
    const raw = JSON.stringify({ id: acc.id, model: acc.model, choices: [{ message, finish_reason: acc.finish }], usage: acc.usage });
    return { res, raw, http };
  } catch (e) {
    const err = why === 'StallError'
      ? Object.assign(new Error(`no stream data for ${stallMs / 1000} s (${http.chunks} data chunks, first byte ${http.firstByteMs ?? 'never'})`), { name: 'StallError' })
      : why === 'TimeoutError' ? Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }) : e;
    end({ status: null, error: String(err.name ?? 'Error') });
    throw Object.assign(err, { http });
  } finally {
    clearTimeout(total);
    clearTimeout(stall);
    inFlight--;
  }
}

// One streamed chunk into the reply being built: text, reasoning (counted by usage only),
// tool calls by index with their arguments in pieces, and usage on the last chunk.
function addChunk(acc, j) {
  acc.id ??= j.id ?? null;
  acc.model ??= j.model ?? null;
  if (j.usage) acc.usage = j.usage;
  const ch = j.choices?.[0];
  if (!ch) return;
  if (ch.finish_reason) acc.finish = ch.finish_reason;
  const d = ch.delta ?? {};
  if (typeof d.content === 'string') acc.content += d.content;
  for (const tc of d.tool_calls ?? []) {
    const c = (acc.calls[tc.index ?? 0] ??= { id: null, type: 'function', function: { name: '', arguments: '' } });
    if (tc.id) c.id = tc.id;
    if (tc.function?.name) c.function.name += tc.function.name;
    if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
  }
}

// What a request asked for, for the trace: the sampling and length settings, never the key.
export const requestParams = (body) => ({
  reasoningEffort: body.reasoning_effort ?? null,
  temperature: body.temperature ?? null,
  topP: body.top_p ?? null,
  maxCompletionTokens: body.max_completion_tokens ?? body.max_tokens ?? null,
  toolChoice: body.tool_choice ?? null,
});

// The tool_choice a Muse request sends: 'auto' unless MUSE_TOOL_CHOICE names 'required' (E11:
// Muse writes its report as text in about one run in six; a host must be shown to take it first).
export const toolChoice = (env = process.env) => (env.MUSE_TOOL_CHOICE === 'required' ? 'required' : 'auto');
