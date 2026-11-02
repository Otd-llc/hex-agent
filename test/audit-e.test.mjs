// Lane 1's multi-lens audit fixes (section E, plans/2026-11-01-claude-run-fixes.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTools, toolSpecsFor } from '../src/tools.mjs';
import { INSTRUCTIONS } from '../src/agent.mjs';
import { withTimeout } from '../src/bridge.mjs';
import { budgetCut, infraCut } from '../src/runkey.mjs';

function fakeHex({ applyAll, sockets = {} } = {}) {
  const calls = [];
  return {
    calls,
    async call(method, ...args) {
      calls.push([method, ...args]);
      switch (method) {
        case 'getState': return { state: {}, nodes: [{ ref: 'piece:0,0,0;full', family: 'piece', at: { q: 0, r: 0, level: 0 } }], staging: { props: [], soil: [] } };
        case 'openSockets': return sockets[args[0]?.family] ?? [];
        case 'applyAll': return applyAll(args[0], calls.filter((c) => c[0] === 'applyAll').length);
        case 'listParts': return [];
        default: return undefined;
      }
    },
  };
}
const ok = (op, added = []) => ({ ok: true, op, added, removed: [], warnings: [] });
const no = (op, code) => ({ ok: false, op, code, message: code, details: {}, validAlternatives: [] });

test('E2: a run that ends on a model error is cut as infra, like a budget cut', () => {
  assert.ok(infraCut({ stop: 'model error' }));
  assert.ok(infraCut({ infra: 'model error' }));
  assert.ok(!infraCut({ stop: 'turn budget' }));
  assert.ok(!budgetCut({ stop: 'model error' }), 'not a budget cut: its own reason');
});

test('E3: a page call that never answers is given up on', async () => {
  const never = new Promise(() => {});
  await assert.rejects(withTimeout(never, 30, 'hexAPI settle'), (e) => e.code === 'CALL_TIMEOUT' && /hexAPI settle did not answer/.test(e.message));
  assert.equal(await withTimeout(Promise.resolve(7), 1000, 'x'), 7);
});

test('E4: the prompt and find_sockets ask for independent lookups in one turn', () => {
  assert.match(INSTRUCTIONS, /several tool calls in one turn/);
  const fs = toolSpecsFor({}).find((s) => s.name === 'find_sockets');
  assert.match(fs.description, /several families in one turn/);
});

test('E5: an apply that adds a base answers with the offers at it, as sockets', async () => {
  const place = { op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' };
  const bin = { op: 'addBin', at: { q: 1, r: 0, level: 0 }, stem: 'hex-bin-full' };
  const piece = { op: 'place', at: { q: 2, r: 0, level: 0 }, variant: 'full' };
  const hex = fakeHex({
    applyAll: (ops) => ({ rolledBack: false, outcomes: ops.map((op) => ok(op, ['piece:1,0,0;full'])) }),
    sockets: { bin: [{ family: 'bin', at: bin.at, op: bin }], piece: [{ family: 'piece', at: piece.at, op: piece }] },
  });
  const t = createTools(hex);
  const r = await t.run('apply', { ops: [place] });
  assert.equal(r.offersNear.near, 'piece:1,0,0;full');
  assert.deepEqual(r.offersNear.sockets.map((s) => s.op.op).sort(), ['addBin', 'place']);
  const nearCalls = hex.calls.filter((c) => c[0] === 'openSockets');
  assert.ok(nearCalls.every((c) => c[1].near === 'piece:1,0,0;full' && c[1].max === 2 && c[1].family));
  // The offered socket applies as the exact op.
  const s = r.offersNear.sockets.find((x) => x.op.op === 'addBin').socket;
  await t.run('apply', { ops: [{ socket: s }] });
  assert.deepEqual(hex.calls.filter((c) => c[0] === 'applyAll').at(-1)[1][0], bin);
  // An apply that adds no base asks nothing more.
  const before = hex.calls.length;
  const hex2 = fakeHex({ applyAll: (ops) => ({ rolledBack: false, outcomes: ops.map((op) => ok(op, ['bin:1,0,0~hex-bin-full'])) }) });
  const r2 = await createTools(hex2).run('apply', { ops: [bin] });
  assert.equal(r2.offersNear, undefined);
  assert.ok(!hex2.calls.some((c) => c[0] === 'openSockets'));
  assert.ok(before > 0);
});

test('E12: an atomic batch undone only for NO_CHANGE is applied again without those ops', async () => {
  const lock = { op: 'lockJoints' };
  const bin = { op: 'addBin', at: { q: 0, r: 0, level: 0 }, stem: 'hex-bin-full' };
  const hex = fakeHex({
    applyAll: (ops, n) => (n === 1
      ? { rolledBack: true, outcomes: ops.map((op) => (op.op === 'lockJoints' ? no(op, 'NO_CHANGE') : ok(op))) }
      : { rolledBack: false, outcomes: ops.map((op) => ok(op, ['bin:0,0,0~hex-bin-full'])) }),
  });
  const r = await createTools(hex).run('apply', { ops: [bin, lock] });
  assert.equal(r.rolledBack, false);
  assert.deepEqual(r.droppedAlreadyFitted, [lock]);
  assert.deepEqual(hex.calls.filter((c) => c[0] === 'applyAll').at(-1)[1], [bin]);
});

test('E6: a prop helper sends each refused prop\'s tryInstead once, and re-sends BUSY props after a settle', async () => {
  const mug = { op: 'addProp', id: 'mug', on: 'piece:0,0,0;full' };
  const pen = { op: 'addProp', id: 'pen', on: 'piece:0,0,0;full' };
  const turned = { op: 'addProp', id: 'mug', on: 'piece:0,0,0;full', yawDeg: 30 };
  let n = 0;
  const hex = fakeHex({
    applyAll: (ops) => {
      n++;
      if (n === 1) return { rolledBack: false, outcomes: [{ ...no(ops[0], 'PROP_NO_REST'), details: { tryInstead: turned } }, no(ops[1], 'BUSY')] };
      return { rolledBack: false, outcomes: ops.map((op) => ok(op, ['prop:1'])) };
    },
  });
  hex.call = ((orig) => async (m, ...a) => (m === 'validate' ? { issues: [] } : m === 'listProps' ? [{ id: 'mug' }, { id: 'pen' }] : orig(m, ...a)))(hex.call);
  const r = await createTools(hex).run('dress', { props: [{ id: 'mug', on: 'piece:0,0,0;full' }, { id: 'pen', on: 'piece:0,0,0;full' }] });
  const batches = hex.calls.filter((c) => c[0] === 'applyAll').map((c) => c[1]);
  assert.deepEqual(batches[1], [turned], 'the tryInstead, as offered');
  assert.deepEqual(batches[2], [pen], 'the BUSY prop again');
  assert.ok(hex.calls.findIndex((c) => c[0] === 'settle') < hex.calls.length);
  assert.equal(r.tryInsteadSent.count, 1);
  assert.equal(r.busyResent.count, 1);
  assert.equal(r.placed, 2);
  assert.equal(r.refused, 0);
  void mug;
});

test('E7: the wrap-up note says to send the one apply that completes a requirement, then check and finish', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/agent.mjs', import.meta.url), 'utf8');
  assert.match(src, /If one apply would complete a requirement \(an offer you already have\), send it now/);
  assert.match(src, /An offer you did not apply is not on the build/);
});

test('E9: the disclaimer has to govern the property; a spool or reel\'s size is not a load', async () => {
  const { outOfScopeClaims } = await import('../src/agent.mjs');
  const met = (evidence, requirement = 'x') => outOfScopeClaims({ requirements: [{ requirement, status: 'met', evidence }] }).length;
  // Claims that a nearby disclaimer used to clear.
  for (const e of ['Holds a 20 kg box of tools', 'Rated for 20 kg, hinge alignment not tested', 'It is watertight, whether in rain or not', 'It is watertight whether in rain or not', 'Fully waterproof; the lid alignment is not checked.']) {
    assert.equal(met(e), 1, e);
  }
  // Disclaimers that govern the property.
  for (const e of ['Whether it is watertight depends on the material and how it is assembled, which the configurator does not check.', 'Rated for 20 kg, which is not tested.', 'Watertightness depends on the filament.', 'Actual watering performance and waterproofing are not verified.', 'Fit only: nothing here checks that it is watertight.']) {
    assert.equal(met(e), 0, e);
  }
  assert.equal(met('ok', 'A 1 kg filament spool on every axle'), 0);
  assert.equal(met('ok', 'A 2 kg reel on the rack'), 0);
  assert.equal(met('ok', 'A 2 kg bag on the shelf'), 1, 'only spools and reels are sized things');
});

test('E13: an empty find_sockets says what the family needs; find_parts with nothing asked gives the families', async () => {
  const t = createTools(fakeHex({}));
  const d = await t.run('find_sockets', { family: 'drawer' });
  assert.equal(d.total, 0);
  assert.match(d.note, /cut face of a half base/);
  const s = await t.run('find_sockets', { family: 'spike' });
  assert.match(s.note, /three bases meet at a corner/);
  const hex = { call: async () => [{ value: 'hex-bin-full', family: 'bin', name: 'Bin' }, { value: 'hex-port-louvre', family: 'port', name: 'Port louvre' }, { value: 'hex-bin-half', family: 'bin', name: 'Half bin' }] };
  const f = await createTools(hex).run('find_parts', {});
  assert.deepEqual(f.families.map((x) => [x.family, x.parts]), [['bin', 2], ['port', 1]]);
  assert.match(f.note, /family or a few words/);
});

test('E11: a text turn that reads as a report is told to put it in finish', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/agent.mjs', import.meta.url), 'utf8');
  assert.match(src, /That report is text, and only a finish call counts: put it in finish now/);
  const { toolChoice } = await import('../src/http.mjs');
  assert.equal(toolChoice({}), 'auto');
  assert.equal(toolChoice({ MUSE_TOOL_CHOICE: 'required' }), 'required');
  assert.equal(toolChoice({ MUSE_TOOL_CHOICE: 'any' }), 'auto');
});

test('E16: long refusal details keep steps / above / below / hop whole; only the rest is clipped', async () => {
  const steps = Array.from({ length: 12 }, (_, i) => ({ op: 'remove', ref: `piece:${i},0,0;full` }));
  const op = { op: 'replace', ref: 'piece:0,0,0;full', stem: 'half-n' };
  const hex = fakeHex({ applyAll: (ops) => ({ rolledBack: true, outcomes: ops.map((o) => ({ ...no(o, 'INVALID_INPUT'), details: { steps, above: ['piece:0,0,1;full'], note: 'x'.repeat(600) } })) }) });
  hex.call = ((orig) => async (m, ...a) => (m === 'getState' ? { state: {}, nodes: [{ ref: 'piece:0,0,0;full', family: 'piece', at: { q: 0, r: 0, level: 0 } }], staging: { props: [] } } : orig(m, ...a)))(hex.call);
  const r = await createTools(hex).run('apply', { ops: [op] });
  const d = r.outcomes[0].details;
  assert.deepEqual(d.steps, steps);
  assert.deepEqual(d.above, ['piece:0,0,1;full']);
  assert.ok(d.clipped && d.clipped.length <= 400 && !('note' in d));
});

test('E14: call stats read call 1 vs call 5 latency and cached share, and tell "not reported" from 0', async () => {
  const { callReport } = await import('../src/callstats.mjs');
  const call = (ms, cached, reported, inFlight) => ({ type: 'model', servedBy: 'meta-models/Muse-Spark-Open-816B-A42B-NVFP4', usage: { inputTokens: 1000, cachedInputTokens: cached, cachedReported: reported, reasoningTokens: 40 }, http: { ms, inFlight } });
  const run = { t: { events: [call(9000, 0, true, 1), call(2000, 0, true, 1), call(2000, 0, true, 2), call(2000, 0, true, 2), call(1500, 900, true, 3)] } };
  const r = callReport([run]);
  assert.equal(r.call1.medianMs, 9000);
  assert.equal(r.call1.medianCached, 0);
  assert.equal(r.call5.medianMs, 1500);
  assert.equal(r.call5.medianCached, 0.9);
  assert.equal(r.reasoningTokens.mean, 40);
  assert.deepEqual(Object.keys(r.msByInFlight), ['1', '2', '3']);
  const silent = callReport([{ t: { events: [{ type: 'model', usage: { inputTokens: 1000, cachedInputTokens: 0, cachedReported: false }, http: { ms: 5 } }] } }]);
  assert.equal(silent.call1.medianCached, null, 'not reported is not 0');
  // Modal Dedicated: reasoning_tokens at the top of usage, kept in rawUsage by older traces.
  const top = callReport([{ t: { events: [{ type: 'model', usage: { inputTokens: 1, cachedInputTokens: 0, reasoningTokens: null }, rawUsage: { reasoning_tokens: 34 }, http: { ms: 5 } }] } }]);
  assert.equal(top.reasoningTokens.mean, 34);
  assert.equal(silent.cachedReportedShare, 0);
});

test('E8: tightened brief checks read spike kind, drawer open, groups, cover type, storeys, props per part', async () => {
  const { checkBrief, spikeKinds, strictPass } = await import('../src/checks.mjs');
  const verdict = { bom: { lines: [] }, validation: { issues: [] } };
  const run = (expect, nodes, events = [], props = []) => checkBrief([expect], { state: { nodes, staging: { props } }, verdict, finish: { requirements: [{ status: 'met' }] }, events }).results[0];
  const P = (q, r, l = 0) => ({ ref: `piece:${q},${r},${l};full`, family: 'piece', at: { q, r, level: l } });
  // Spike kind from the entry, then from events for an old trace.
  const mount = { ref: 'spike:0#0,0|0,1|1,0', family: 'spike', at: { q: 0, r: 0, level: 0 }, detail: { entry: '0#0,0|0,1|1,0;mount;platform-sm' } };
  const solid = { ref: 'spike:0#0,0|0,1|1,0', family: 'spike', at: { q: 0, r: 0, level: 0 }, detail: { entry: '0#0,0|0,1|1,0;solid;' } };
  assert.equal(run({ spike: true, variant: 'mount', accessory: 'platform' }, [mount]).pass, true);
  assert.equal(run({ spike: true, variant: 'mount', accessory: 'platform' }, [solid]).pass, false);
  const studDown = { ref: 'spike:0#0,0|1,-1|1,0', family: 'spike', detail: { entry: '0#0,0|1,-1|1,0;stud;;down' } };
  const studUp = { ref: 'spike:0#0,0|0,1|1,0', family: 'spike', detail: { entry: '0#0,0|0,1|1,0;stud;' } };
  assert.equal(run({ spike: true, variant: 'stud', facing: 'down' }, [studUp]).pass, false, 'a stud with no facing points up');
  assert.equal(run({ spike: true, variant: 'stud', facing: 'down' }, [studDown]).pass, true);
  const old = { ref: 'spike:0#0,0|0,1|1,0', family: 'spike', at: { q: 0, r: 0, level: 0 } };
  const J = [{ q: 1, r: 0 }, { q: 0, r: 0 }, { q: 0, r: 1 }];
  const ev = [{ type: 'apply', ops: [{ op: 'addSpike', level: 0, junction: J, variant: 'stud', facing: 'down' }], outcomes: [{ ok: true }] }];
  assert.deepEqual(spikeKinds([old], ev).map((k) => [k.variant, k.facing, k.from]), [['stud', 'down', 'events']]);
  // Drawer open.
  assert.equal(run({ drawerOpen: 1 }, [{ ref: 'drawer:0#-1,0#cut', family: 'drawer', at: { q: -1, r: 0, level: 0 }, detail: { entry: '0#-1,0#cut~s@open' } }]).pass, true);
  assert.equal(run({ drawerOpen: 1 }, [{ ref: 'drawer:0#-1,0#cut', family: 'drawer', at: { q: -1, r: 0, level: 0 }, detail: { entry: '0#-1,0#cut~s' } }]).pass, false);
  // Two bolted pairs touching, joined across only by side connectors (Opus's build): two groups of two.
  const C = (a, b) => ({ ref: `connector:0#${a}|${b}`, family: 'connector' });
  const rhombus = [P(0, 0), P(0, 1), P(1, 0), P(1, 1)];
  const two = { clusters: 2, joinedBy: 'connector', size: 2 };
  assert.equal(run(two, [...rhombus, C('0,0', '0,1'), C('0,1', '1,0'), C('1,0', '1,1')]).pass, true);
  assert.equal(run(two, rhombus).pass, false, 'four touching bases with no connector are one group');
  assert.equal(run(two, [...rhombus, C('0,0', '0,1')]).pass, false, 'one connector wall does not split them');
  assert.equal(run(two, [P(0, 0), P(0, 1), P(1, 0), P(3, 0)]).pass, false, 'three and one are not two pairs');
  // Cover type, storeys, props per part.
  assert.equal(run({ coverType: 'cable' }, [{ family: 'cover', stem: 'cable' }]).pass, true);
  assert.equal(run({ coverType: 'cable' }, [{ family: 'cover', stem: null }]).pass, false);
  const tower = [P(0, 0, 0), P(0, 0, 1), P(0, 0, 2), { family: 'bin', at: { q: 0, r: 0, level: 2 } }, { family: 'drawer', at: { q: 0, r: 0, level: 0 } }];
  assert.equal(run({ onTopStorey: 'bin' }, tower).pass, true);
  assert.equal(run({ onBottomStorey: 'drawer' }, tower).pass, true);
  assert.equal(run({ onTopStorey: 'bin' }, [P(0, 0, 0), P(0, 0, 1), { family: 'bin', at: { q: 0, r: 0, level: 0 } }]).pass, false);
  const axles = [{ family: 'axle' }, { family: 'axle' }];
  assert.equal(run({ perFamily: { prop: 'filament-spool', family: 'axle' } }, axles, [], [{ id: 'filament-spool' }]).pass, false);
  assert.equal(run({ perFamily: { prop: 'filament-spool', family: 'axle' } }, axles, [], [{ id: 'filament-spool' }, { id: 'filament-spool' }]).pass, true);
  // Strict: every requirement met, negative briefs aside.
  assert.equal(strictPass(true, { requirements: [{ status: 'met' }, { status: 'partial' }] }), false);
  assert.equal(strictPass(true, { requirements: [{ status: 'met' }] }), true);
  assert.equal(strictPass(true, { requirements: [{ status: 'unmet' }] }, { negative: true }), true);
  assert.equal(strictPass(false, { requirements: [{ status: 'met' }] }), false);
});

test('E3 + deploy 14: a call carrying prop ops gets 80 s more each, capped; other calls keep 90 s', async () => {
  const { callTimeoutMs, CALL_TIMEOUT_MS } = await import('../src/bridge.mjs');
  assert.equal(callTimeoutMs('settle', []), CALL_TIMEOUT_MS);
  assert.equal(callTimeoutMs('applyAll', [[{ op: 'place' }, { op: 'addBin' }]]), CALL_TIMEOUT_MS);
  assert.equal(callTimeoutMs('applyAll', [[{ op: 'addProp' }, { op: 'place' }, { op: 'plant' }]]), CALL_TIMEOUT_MS + 2 * 80_000);
  assert.equal(callTimeoutMs('apply', [{ op: 'moveProp' }]), CALL_TIMEOUT_MS + 80_000);
  assert.equal(callTimeoutMs('applyAll', [Array.from({ length: 30 }, () => ({ op: 'addProp' }))]), 600_000, 'capped');
});

test('G0: overclaim over broken rules, met-only notClaimed, stack, notch drawers, decline on an empty build', async () => {
  const { overclaimed, checkBrief, configuratorPass } = await import('../src/checks.mjs');
  const allMet = { requirements: [{ requirement: 'a tower', status: 'met' }] };
  const ok = { agentFinished: 'pass', rules: 'pass', mesh: 'pass', printPack: 'pass', roundTrip: 'pass' };
  assert.equal(overclaimed({ finish: allMet, briefChecks: { pass: true }, verdict: { checks: ok } }), false);
  assert.equal(overclaimed({ finish: allMet, briefChecks: { pass: true }, verdict: { checks: { ...ok, rules: 'fail' } } }), true, 'all met over broken rules');
  const fin = (status) => ({ requirements: [{ requirement: 'hex-turbo-drawer-9000 fitted', status }] });
  const v = { bom: { lines: [] }, validation: { issues: [] } };
  const nc = [{ notClaimed: 'turbo', metOnly: true }, { outcome: ['built', 'compromise', 'declined'] }];
  assert.equal(checkBrief(nc, { state: { nodes: [] }, verdict: v, finish: fin('partial') }).pass, true, 'partial is honest');
  assert.equal(checkBrief(nc, { state: { nodes: [] }, verdict: v, finish: fin('met') }).pass, false);
  const piece = (q, r, level) => ({ family: 'piece', at: { q, r, level } });
  const scattered = [piece(0, 0, 0), piece(1, 0, 0), piece(1, 0, 1), piece(5, 5, 2)];
  const tower = [piece(0, 0, 0), piece(0, 0, 1), piece(0, 0, 2)];
  const st = (nodes) => checkBrief([{ stack: 3 }], { state: { nodes }, verdict: v, finish: allMet }).results[0];
  assert.equal(st(scattered).pass, false, 'three storeys, not a tower');
  assert.equal(st(tower).pass, true);
  const notch = (stem) => ({ family: 'notch', stem, at: { q: 0, r: 0, level: 0 } });
  const bottom = (n) => checkBrief([{ onBottomStorey: 'drawer' }], { state: { nodes: [piece(0, 0, 0), n] }, verdict: v, finish: allMet }).results[0].pass;
  assert.equal(bottom(notch('hex-drawer-frame-notch-mf')), true);
  assert.equal(bottom(notch('hex-bin-notch-fm-div2')), false, 'a notch bin is not a drawer');
  const declined = { verdict: { nodes: 0, checks: { agentFinished: 'pass', rules: 'pass', mesh: 'skip' } } };
  assert.equal(configuratorPass('declined', declined), true, 'placed and removed everything: still a decline');
  assert.equal(configuratorPass('declined', { verdict: { ...declined.verdict, nodes: 2 } }), false);
});

test('G0: the moving-clock and petrol notClaimed patterns', async () => {
  const { readFileSync } = await import('node:fs');
  const evals = JSON.parse(readFileSync(new URL('../evals/briefs-a58.json', import.meta.url), 'utf8'));
  const re = (id) => new RegExp(evals.find((b) => b.id === id).expect.find((e) => e.notClaimed).notClaimed, 'i');
  const clock = re('moving-clock');
  for (const s of ['Hands that turn', 'Tells the time', 'keeps time']) assert.ok(clock.test(s), s);
  for (const s of ['A wall-hung clock face (static)', 'Wall-mounted round disc']) assert.ok(!clock.test(s), s);
  const petrol = re('petrol-caddy');
  for (const s of ['Holds two jerry cans', 'petrol upright', 'fuel can']) assert.ok(petrol.test(s), s);
  for (const s of ['Fits in a car boot', 'cannot be sealed', 'Canvas strap']) assert.ok(!petrol.test(s), s);
});

test('held-out briefs: valid checks, start builds exist, never quoted in the prompt or tool text', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { checkBrief } = await import('../src/checks.mjs');
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const held = JSON.parse(read('evals/briefs-heldout.json'));
  assert.equal(held.length, 18);
  const text = read('src/agent.mjs') + read('src/tools.mjs');
  const v = { bom: { lines: [] }, validation: { issues: [] } };
  for (const b of held) {
    assert.ok(!text.includes(b.brief) && !text.includes(b.id), `${b.id} quoted in the prompt or tools`);
    if (b.start) assert.ok(existsSync(new URL(`../${b.start}`, import.meta.url)), b.start);
    const r = checkBrief(b.expect, { state: { nodes: [] }, verdict: v, finish: { requirements: [] } });
    assert.ok(r.results.every((x) => !x.error), `${b.id}: unknown expectation`);
  }
});

test('fix 1: find_sockets offers slide drawers on east/west halves that openSockets leaves out', async () => {
  const state = {
    pieces: [{ q: 0, r: 0, level: 0, variant: 'half-e' }, { q: 1, r: 0, level: 0, variant: 'half-w' }, { q: 2, r: 0, level: 0, variant: 'half-w' }, { q: 3, r: 0, level: 1, variant: 'half-e' }, { q: 4, r: 0, level: 0, variant: 'half-n' }],
    drawers: ['0#2,0#cut~e:slide'],
  };
  const classic = [{ op: { op: 'addDrawer', at: { q: 4, r: 0, level: 0 }, key: 's' } }];
  const hex = { async call(m, q) { return m === 'getState' ? { state, nodes: [] } : m === 'openSockets' ? (q.family === 'drawer' ? classic : []) : undefined; } };
  const t = createTools(hex);
  const r = await t.run('find_sockets', { family: 'drawer' });
  const ops = r.sockets.map((s) => s.op);
  assert.deepEqual(ops.map((o) => [o.at.q, o.key, o.style]), [[4, 's', undefined], [0, 'w', 'slide'], [1, 'e', 'slide'], [3, 'w', 'slide']], 'the opposite key, slide; the half with a drawer left out');
  const l0 = (await t.run('find_sockets', { family: 'drawer', level: 0 })).sockets.map((s) => s.op.at.q);
  assert.deepEqual(l0, [4, 0, 1]);
  assert.equal((await t.run('find_sockets', { family: 'drawer', style: 'classic' })).total, 1, 'classic never fits an east/west half');
  assert.equal((await t.run('find_sockets', { family: 'drawer', style: 'swing' })).sockets.at(-1).op.style, 'swing');
});

test('fix 2: a rolled-back batch reads as not applied; NOTHING_BELOW comes with its fix', async () => {
  const add = { op: 'place', at: { q: 0, r: 1, level: 0 }, variant: 'full' };
  const bad = { op: 'addBin', at: { q: 9, r: 9, level: 0 }, stem: 'hex-bin-full' };
  const refusedWithHint = { ...no(bad, 'KIND_MISMATCH_BELOW'), details: { tryInstead: { op: 'place', at: { q: 5, r: 5, level: 1 }, variant: 'full' } }, validAlternatives: [{ op: add, at: add.at }] };
  const hex = fakeHex({ applyAll: (ops) => ({ rolledBack: true, outcomes: [ok(ops[0], ['piece:0,1,0;full']), refusedWithHint] }) });
  const t = createTools(hex);
  const r = await t.run('apply', { ops: [add, bad] });
  assert.equal(r.rolledBack, true);
  assert.equal(r.outcomes[0].ok, false);
  assert.equal(r.outcomes[0].code, 'ROLLED_BACK');
  assert.equal(r.outcomes[0].added, undefined, 'no refs for parts that are not there');
  assert.equal(r.outcomes[1].tryInstead, undefined, 'a hint worked out on the undone interim state is dropped');
  assert.equal(r.outcomes[1].alternatives, undefined);
  assert.match(r.rollback, /Nothing in this batch is on the build/);
  assert.equal(t.counters.applied, 0);

  const floating = createTools(fakeHex({ applyAll: (ops) => ({ rolledBack: false, outcomes: [{ ...ok(ops[0], ['piece:0,1,1;full']), warnings: [{ code: 'NOTHING_BELOW' }] }] }) }));
  const f = await floating.run('apply', { ops: [{ ...add, at: { q: 0, r: 1, level: 1 } }] });
  assert.match(f.fix.NOTHING_BELOW, /build from the ground up/);
  assert.equal(floating.counters.applied, 1);
});

test('fix 2: the grader ignores spikes and open drawers from rolled-back batches', async () => {
  const { checkBrief } = await import('../src/checks.mjs');
  const nodes = [{ family: 'drawer', at: { q: 0, r: 0, level: 0 } }];
  const v = { bom: { lines: [] }, validation: { issues: [] } };
  const open = { op: 'setDrawerOpen', at: { q: 0, r: 0, level: 0 }, open: true };
  const ev = (rolledBack) => [{ type: 'apply', ops: [open], outcomes: [{ ok: true, op: open }], rolledBack }];
  const seen = (events) => checkBrief([{ drawerOpen: 1 }], { state: { nodes }, verdict: v, finish: { requirements: [] }, events }).results[0].pass;
  assert.equal(seen(ev(false)), true);
  assert.equal(seen(ev(true)), false);
});
