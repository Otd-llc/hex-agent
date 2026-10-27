// Plumbing check with NO model: a scripted mock drives the full loop against
// the live configurator, then the same verify() a live run uses. The trace is
// stamped inference: "mock". This proves the bridge, tools and checks, not
// that a model can design anything.
import { mkdirSync, writeFileSync } from 'node:fs';
import { openHex, HEX_ORIGIN } from '../src/bridge.mjs';
import { mockModel } from '../src/model.mjs';
import { runAgent, verify } from '../src/agent.mjs';

// Picks the first offer of each kind from whatever the tool last returned.
const firstSocket = (items) => {
  const last = [...items].reverse().find((i) => i.type === 'function_call_output');
  return JSON.parse(last.output).sockets?.[0]?.socket;
};
const script = (ctx, i) => {
  const plan = [
    () => [{ name: 'find_sockets', args: { family: 'piece' } }],
    () => [{ name: 'apply', args: { ops: [{ socket: firstSocket(ctx.items) }] } }],
    () => [{ name: 'find_sockets', args: { family: 'bin' } }],
    () => [{ name: 'apply', args: { ops: [{ socket: firstSocket(ctx.items) }] } }],
    () => [{ name: 'find_sockets', args: { family: 'jointBolt' } }],
    () => [{ name: 'apply', args: { ops: [{ socket: firstSocket(ctx.items) }] } }],
    () => [{ name: 'check_build' }],
    () => [{ name: 'finish', args: { requirements: [{ requirement: 'two bases and a bin', status: 'met', evidence: 'scripted' }], summary: 'mock run' } }],
  ];
  return plan[i]?.();
};

const hex = await openHex({ headless: true });
try {
  const r = await runAgent({ hex, model: mockModel(script), brief: '(mock) two bases and a bin' });
  const v = await verify({ hex, openFresh: () => openHex({ headless: true }), finish: r.finish });
  const out = { inference: 'mock', origin: HEX_ORIGIN, stop: r.stop, counters: r.counters, checks: v.checks, families: v.families, roundTrip: v.roundTrip, pack: v.bom.pack, validation: v.validation, events: r.events };
  mkdirSync('runs', { recursive: true });
  writeFileSync(`runs/mock-e2e-${Date.now()}.json`, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ stop: r.stop, counters: r.counters, checks: v.checks, families: v.families, roundTrip: v.roundTrip, issues: v.validation.issues.map((i) => i.code) }, null, 2));
} finally {
  await hex.close();
}
