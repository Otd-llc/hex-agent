#!/usr/bin/env node
// Per-call measurements from suite traces, for the Modal smoke (E14, D2): latency and the
// cached share of the prompt at call 1 against call 5 in each run (a prefix cache shows as
// a rise), reasoning tokens, what the host said it served, and latency by requests in flight.
//   node bin/call-report.mjs <suite dir|summary.json> ... [--json]
// "cached n/a" means the host did not report cached tokens, not that none were cached.
import { dirname } from 'node:path';
import { loadRuns } from '../src/runkey.mjs';
import { callReport } from '../src/callstats.mjs';

const pct = (x) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`);

const args = process.argv.slice(2);
const dirs = args.filter((a) => !a.startsWith('--')).map((a) => (a.endsWith('.json') ? dirname(a) : a));
if (!dirs.length) {
  console.error('usage: node bin/call-report.mjs <suite dir|summary.json> ... [--json]');
  process.exit(2);
}
const groups = new Map();
for (const r of loadRuns(dirs)) {
  if (r.cut) continue;
  if (!groups.has(r.key)) groups.set(r.key, []);
  groups.get(r.key).push(r);
}
const out = Object.fromEntries([...groups].map(([k, runs]) => [k, callReport(runs)]));
if (args.includes('--json')) console.log(JSON.stringify(out, null, 2));
else {
  for (const [k, r] of Object.entries(out)) {
    console.log(`\n## ${k}\n${r.runs} runs, ${r.calls} model calls; cached tokens reported on ${pct(r.cachedReportedShare)} of calls`);
    console.log(`call 1: ${r.call1.medianMs ?? 'n/a'} ms, cached ${pct(r.call1.medianCached)}   call 5: ${r.call5.medianMs ?? 'n/a'} ms, cached ${pct(r.call5.medianCached)}`);
    console.log(`reasoning tokens: ${r.reasoningTokens ? `${r.reasoningTokens.mean} per call (${r.reasoningTokens.calls} calls)` : 'not reported'}`);
    console.log(`servedBy: ${JSON.stringify(r.servedBy)}`);
    console.log(`latency by requests in flight: ${Object.entries(r.msByInFlight).map(([k2, v]) => `${k2}: ${v.medianMs} ms (${v.calls})`).join(', ') || 'n/a'}`);
  }
}
