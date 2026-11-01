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

// What a request asked for, for the trace: the sampling and length settings, never the key.
export const requestParams = (body) => ({
  reasoningEffort: body.reasoning_effort ?? null,
  temperature: body.temperature ?? null,
  topP: body.top_p ?? null,
  maxCompletionTokens: body.max_completion_tokens ?? body.max_tokens ?? null,
  toolChoice: body.tool_choice ?? null,
});
