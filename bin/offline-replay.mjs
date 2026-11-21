#!/usr/bin/env node
// Recorded runs through hex-agent's own tool layer on hex-core's engine: no browser, no model.
// Each run's model turns are read from its trace (event type 'model', its tool calls with
// their arguments) and every tool call is made again, in order, through createTools on an
// offline hex (HEX_BACKEND=engine, src/engine-backend.mjs). A run goes TO THE END when every
// apply event the tools emit has the recorded outcomes and the final link is the recorded one
// (as the build it decodes to); it STOPS at the first hexAPI member the engine does not answer
// (the tool's OFFLINE error), or DIFFERS at the first apply whose outcomes are not the
// recorded ones. `finish` is the agent loop's, not a tool, and is not made.
//   HEX_BACKEND=engine HEX_ENGINE_BIN=... HEX_ENGINE_RECORDS=... node bin/offline-replay.mjs <runs-dir> [<more dirs>] [--out=<file.json>]
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { openHex } from '../src/bridge.mjs';
import { createTools } from '../src/tools.mjs';
import { CONTRACT } from '../src/contract.mjs';
import { DEFAULT_FEATURES } from '../src/agent.mjs';

if (process.env.HEX_BACKEND !== 'engine') {
  console.error('offline-replay runs on the engine alone: set HEX_BACKEND=engine, HEX_ENGINE_BIN, HEX_ENGINE_RECORDS');
  process.exit(2);
}
const args = process.argv.slice(2);
const out = args.find((a) => a.startsWith('--out='))?.slice(6);
const dirs = args.filter((a) => !a.startsWith('--'));

function traces(dir) {
  const found = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) found.push(...traces(p));
    else if (name === 'trace.json') found.push(p);
  }
  return found;
}

// A link's build: the snapshot of v2s= (raw DEFLATE, base64url), its keys in order.
export function buildOf(link) {
  const m = /v2s=([A-Za-z0-9_-]+)/.exec(link ?? '');
  if (!m) return null;
  const json = JSON.parse(inflateRawSync(Buffer.from(m[1], 'base64url')).toString('utf8'));
  return sorted(json.s);
}
const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

function firstDiff(a, b, path = '$') {
  if (same(a, b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: recorded ${JSON.stringify(a)?.slice(0, 120)}, engine ${JSON.stringify(b)?.slice(0, 120)}`;
}

// The tools a recorded agent called that today's tool layer does not have (asked of createTools
// itself, with no hex: an unknown tool is answered before anything is called).
const known = new Set();
async function toolsKnown(names) {
  const probe = createTools({ call: async () => { throw new Error('probe'); } });
  for (const n of names) {
    if (known.has(n) || n === 'finish') continue;
    const r = await probe.run(n, '{}');
    if (!/^unknown tool /.test(r?.error ?? '')) known.add(n);
  }
}
const unknownTools = (trace) => [...new Set(trace.events.filter((e) => e.type === 'model').flatMap((e) => (e.calls ?? []).map((c) => c.name)))].filter((n) => n !== 'finish' && !known.has(n));

async function replayRun(trace) {
  const hex = await openHex({});
  let calls = 0;
  const counted = { ...hex, call: (...a) => { calls++; return hex.call(...a); } };
  const applies = [];
  const f = { ...DEFAULT_FEATURES, ...(trace.features ?? {}) };
  const tools = createTools(counted, { onEvent: (e) => e.type === 'apply' && applies.push(e), acceptance: f.acceptance, fixes: { ewDrawers: f.ewDrawers, rollbackRead: f.rollbackRead, topology: f.topology } });
  const recorded = trace.events.filter((e) => e.type === 'apply');
  const result = { id: trace.runId, outcome: null, at: null, calls: 0, engineMs: 0, browserMs: 0, tools: 0 };
  // the browser's time for each recorded tool call: from the event before it to its own
  const toolTimes = [];
  for (let i = 0, prev = 0; i < trace.events.length; i++) {
    const e = trace.events[i];
    if (e.type === 'tool') toolTimes.push({ name: e.name, ms: Math.max(0, (e.t ?? prev) - prev) });
    prev = e.t ?? prev;
  }
  let cursor = 0;
  const browserTime = (name) => {
    const k = toolTimes.findIndex((x, i) => i >= cursor && x.name === name);
    if (k < 0) return 0;
    cursor = k + 1;
    return toolTimes[k].ms;
  };
  const started = Date.now();
  try {
    for (const e of trace.events) {
      if (e.type !== 'model') continue;
      for (const c of e.calls ?? []) {
        const ms = browserTime(c.name);
        if (c.name === 'finish') continue;
        const before = calls;
        const t0 = Date.now();
        const refusedBefore = hex.offline.refused;
        const r = await tools.run(c.name, c.arguments);
        result.engineMs += Date.now() - t0;
        // a member the engine did not answer, whether the tool says so or swallows it (survey
        // and the compound helpers catch a failed read and go on with less)
        if (hex.offline.refused > refusedBefore) {
          result.outcome = 'stopped';
          result.at = hex.offline.lastRefused;
          result.swallowed = !/not answered offline/.test(r?.error ?? '');
          result.why = String(r?.error ?? hex.offline.lastWhy ?? '').slice(0, 300);
          result.tool = c.name;
          calls = before; // the stopping call is not counted in the rate
          return result;
        }
        // a tool the recorded agent had and today's tool layer has not: not the engine's to answer
        if (/^unknown tool /.test(r?.error ?? '')) {
          result.outcome = 'stopped';
          result.at = `tool ${c.name}, not in today's tool layer`;
          result.tool = c.name;
          calls = before;
          return result;
        }
        result.tools++;
        result.browserMs += ms;
        for (let i = 0; i < applies.length; i++) {
          const want = recorded[i];
          const got = applies[i];
          if (!want) { result.outcome = 'differs'; result.at = `apply #${i}: an apply the recording does not have`; return result; }
          const d = firstDiff({ outcomes: want.outcomes, rolledBack: want.rolledBack }, { outcomes: got.outcomes, rolledBack: got.rolledBack });
          if (d) { result.outcome = 'differs'; result.at = `apply #${i} (${got.ops.map((o) => o.op).join(',')}) ${d}`; return result; }
        }
      }
    }
    if (applies.length !== recorded.length) {
      result.outcome = 'differs';
      result.at = `${applies.length} applies, the recording ${recorded.length}`;
      return result;
    }
    const link = await counted.call('toUrl');
    const d = firstDiff(buildOf(trace.verdict?.fragment), buildOf(link));
    result.outcome = d ? 'differs' : 'end';
    if (d) result.at = `the final link ${d}`;
    return result;
  } catch (e) {
    result.outcome = 'stopped';
    result.at = e.member ?? `harness: ${String(e.message).split('\n')[0]}`;
    return result;
  } finally {
    result.calls = calls;
    result.wallMs = Date.now() - started;
    await hex.close();
  }
}

const skip = {};
const results = [];
for (const dir of dirs) {
  for (const p of traces(dir)) {
    const trace = JSON.parse(readFileSync(p, 'utf8'));
    await toolsKnown(trace.events?.filter((e) => e.type === 'model').flatMap((e) => (e.calls ?? []).map((c) => c.name)) ?? []);
    const why = !trace.events || !trace.verdict ? 'not a complete trace'
      : trace.contractHash !== CONTRACT.hash ? 'another contract'
        : trace.startSha256 ? 'begun from a saved build the trace does not hold'
          : trace.events.some((e) => e.type === 'tool' && e.name === 'apply' && /did not answer/.test(e.result?.error ?? '')) ? 'the recording lost a change (an apply that timed out)'
              : unknownTools(trace).length ? `recorded on another tool layer (it calls ${unknownTools(trace).join(', ')})`
            : null;
    if (why) { skip[why] = (skip[why] ?? 0) + 1; continue; }
    results.push(await replayRun(trace));
  }
}
const by = (k) => results.reduce((m, r) => ((m[r[k]] = (m[r[k]] ?? 0) + 1), m), {});
const stoppedAt = results.filter((r) => r.outcome === 'stopped').reduce((m, r) => ((m[r.at] = (m[r.at] ?? 0) + 1), m), {});
const sum = (k) => results.reduce((s, r) => s + r[k], 0);
const firstDiffs = results.filter((r) => r.outcome === 'differs').slice(0, 10).map((r) => `${r.id}: ${r.at}`);
console.log(`OFFLINE REPLAY (${results.length} runs tried; passed over: ${JSON.stringify(skip)})`);
console.log(`  outcomes: ${JSON.stringify(by('outcome'))}`);
console.log(`  stopped at: ${JSON.stringify(Object.fromEntries(Object.entries(stoppedAt).sort((a, b) => b[1] - a[1])))}`);
console.log(`  first differences: ${firstDiffs.length ? '\n    ' + firstDiffs.join('\n    ') : 'none'}`);
console.log(`  hexAPI calls made by the tool calls reached: ${sum('calls')}; engine ${sum('engineMs')} ms (${(sum('calls') / (sum('engineMs') / 1000)).toFixed(0)} a second); the same tool calls in the browser, by the traces' own times, ${sum('browserMs')} ms (${(sum('calls') / (sum('browserMs') / 1000)).toFixed(1)} a second, counting the calls the engine run made)`);
if (out) writeFileSync(out, JSON.stringify({ skip, results }, null, 1) + '\n');
