// Per-call measurements over runs (bin/call-report.mjs): latency and cached share at call 1
// and call 5, reasoning tokens, servedBy, latency by requests in flight.
const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};

export function callReport(runs) {
  const at = { 1: { ms: [], cached: [] }, 5: { ms: [], cached: [] } };
  const byInFlight = {};
  const served = {};
  let calls = 0, reported = 0, reasoning = 0, reasoningSeen = 0;
  for (const { t } of runs) {
    const models = (t?.events ?? []).filter((e) => e.type === 'model');
    models.forEach((m, i) => {
      calls++;
      const u = m.usage ?? {};
      const known = u.cachedReported ?? (u.cachedInputTokens > 0);
      if (known) reported++;
      const frac = known && u.inputTokens ? u.cachedInputTokens / u.inputTokens : null;
      // Traces recorded before the top-level reasoning_tokens read keep it in rawUsage only.
      const r = u.reasoningTokens ?? m.rawUsage?.reasoning_tokens ?? null;
      if (r != null) { reasoning += r; reasoningSeen++; }
      served[m.servedBy ?? 'none'] = (served[m.servedBy ?? 'none'] ?? 0) + 1;
      const k = i + 1;
      if (at[k]) { at[k].ms.push(m.http?.ms); at[k].cached.push(frac); }
      const f = m.http?.inFlight;
      if (f != null) (byInFlight[f] ??= []).push(m.http.ms);
    });
  }
  return {
    runs: runs.length, calls,
    call1: { medianMs: median(at[1].ms), medianCached: median(at[1].cached) },
    call5: { medianMs: median(at[5].ms), medianCached: median(at[5].cached) },
    cachedReportedShare: calls ? reported / calls : null,
    reasoningTokens: reasoningSeen ? { calls: reasoningSeen, mean: Math.round(reasoning / reasoningSeen) } : null,
    servedBy: served,
    msByInFlight: Object.fromEntries(Object.entries(byInFlight).sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, { calls: v.length, medianMs: median(v) }])),
  };
}

