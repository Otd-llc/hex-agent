// The tool-layer fixes of 2026-11-03, each behind a feature flag (default on):
// yawSweep, dressInside, uncheckablePushback, claimChecks, viewGuard, survey.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTools, toolSpecsFor, turnedOp } from '../src/tools.mjs';
import { runAgent, uncheckableClaims, claimIssues, partLimit, viewIssues, verifyIssues, parseFeatures } from '../src/agent.mjs';
import { mockModel } from '../src/model.mjs';

const BIN = 'bin:0,0,0~hex-bin-full';
const COVER = 'cover:0,0,0;full;top';

// A page where a prop rests only at the yaw in `fitsAt` (dry run and real apply agree), and the
// surfaces of BIN are `binSurfaces`.
function fakeHex({ fitsAt = -30, binSurfaces = null, nodes: extraNodes = [], hidden = [], drawers = false } = {}) {
  const nodes = [
    { ref: BIN, family: 'bin', at: { q: 0, r: 0, level: 0 }, stem: 'hex-bin-full' },
    { ref: COVER, family: 'cover', at: { q: 0, r: 0, level: 0 }, stem: 'cover' },
    ...(drawers ? [{ ref: 'drawer:0#0,0#cut', family: 'drawer', at: { q: 0, r: 0, level: 0 } }] : []),
    ...extraNodes,
  ];
  const surf = binSurfaces ?? [{ id: 'surface:floor@bin', kind: 'floor', depthMm: 60, outlineMm: [[0, 0], [80, 0], [80, 70], [0, 70]] }];
  const rests = (op) => op.op !== 'addProp' || op.id !== 'quad-5in' || (op.yawDeg ?? 0) === fitsAt;
  const outcome = (op) => (rests(op)
    ? { ok: true, op, added: [`prop:${op.id}`], removed: [], warnings: [] }
    : { ok: false, op, code: 'PROP_NO_REST', message: 'the prop has no place to rest there: Overlaps the cell wall.', details: { obstacle: 'piece:1,0,0;full' }, validAlternatives: [] });
  const calls = [];
  return {
    calls,
    async call(method, ...args) {
      calls.push([method, ...args]);
      switch (method) {
        case 'getState': return { state: { pieces: [], snaps: [] }, nodes, staging: { props: [], soil: [] } };
        case 'listProps': return [
          { id: 'quad-5in', sizeMm: { long: 230, mid: 230, short: 60 } },
          { id: 'tweezers', sizeMm: { long: 120, mid: 12, short: 8 } },
          { id: 'mug', sizeMm: { long: 120, mid: 90, short: 82 } },
        ];
        case 'surfaces': return args[0] === BIN ? surf : [];
        case 'apply': return outcome(args[0]);
        case 'applyAll': {
          const outs = args[0].map(outcome);
          const atomic = !args[1]?.keepGoing;
          return { rolledBack: atomic && outs.some((o) => !o.ok), outcomes: outs };
        }
        case 'validate': return { ok: true, meshClash: 'clear', issues: [] };
        case 'view': return { ok: true, az: 45, polar: 62, fit: 'build', outOfFrame: [] };
        case 'still': return { ok: true, png: 'x', seen: [{ ref: 'prop:mug', samples: hidden.includes('prop:mug') ? 0 : 9 }] };
        case 'openSockets': return [{ op: { op: 'addBin', at: { q: 0, r: 0, level: 0 }, stem: 'hex-bin-full' } }];
        default: return undefined;
      }
    },
  };
}
const applied = (hex) => hex.calls.filter((c) => c[0] === 'applyAll').flatMap((c) => c[1]);
const dryRuns = (hex) => hex.calls.filter((c) => c[0] === 'apply' && c[2]?.dryRun);

// ---- yawSweep

test('yawSweep: turnedOp turns yawDeg, facingDeg of a posed prop, or the long axis', () => {
  assert.equal(turnedOp({ op: 'addProp', id: 'a' }, -30).yawDeg, -30);
  assert.equal(turnedOp({ op: 'addProp', id: 'a', yawDeg: 170 }, 30).yawDeg, -160);
  assert.deepEqual(turnedOp({ op: 'addProp', id: 'a', pose: 'stand', facingDeg: 0 }, 60), { op: 'addProp', id: 'a', pose: 'stand', facingDeg: 60 });
  assert.deepEqual(turnedOp({ op: 'addProp', id: 'a', orient: { longAlong: 'z' } }, 30).orient, { longAlong: 120 });
});

test('yawSweep: dress puts a prop refused PROP_NO_REST on at the first turn that rests, and says which', async () => {
  const hex = fakeHex({ fitsAt: -30 });
  const r = await createTools(hex).run('dress', { props: [{ id: 'quad-5in', on: COVER }] });
  assert.equal(r.placed, 1);
  assert.equal(r.refused, 0);
  assert.deepEqual(r.yawSwept.turns.map((t) => [t.id, t.turnDeg, t.yawDeg, t.ok]), [['quad-5in', -30, -30, true]]);
  // +30 tried first, then -30 rests: two dry runs, then the real one.
  assert.deepEqual(dryRuns(hex).map((c) => c[1].yawDeg), [30, -30]);
  assert.equal(applied(hex).at(-1).yawDeg, -30);
});

test('yawSweep: off, the refusal stands and nothing is dry-run', async () => {
  const hex = fakeHex({ fitsAt: -30 });
  const r = await createTools(hex, { fixes: { yawSweep: false } }).run('dress', { props: [{ id: 'quad-5in', on: COVER }] });
  assert.equal(r.placed, 0);
  assert.equal(r.yawSwept, undefined);
  assert.equal(dryRuns(hex).length, 0);
});

test('yawSweep: no turn rests, nothing more goes on and the refusal is reported', async () => {
  const hex = fakeHex({ fitsAt: 45 });
  const r = await createTools(hex).run('dress', { props: [{ id: 'quad-5in', on: COVER }] });
  assert.equal(r.placed, 0);
  assert.equal(dryRuns(hex).length, 5);
  assert.equal(applied(hex).length, 1);
});

test('yawSweep: a plain atomic apply rolled back gets the turn as tryInstead; a dry run too', async () => {
  const hex = fakeHex({ fitsAt: 60 });
  const t = createTools(hex);
  const r = await t.run('apply', { ops: [{ op: 'addProp', id: 'quad-5in', on: COVER }] });
  assert.equal(r.rolledBack, true);
  const ti = r.outcomes[0].tryInstead;
  assert.equal(ti.turnDeg, 60);
  assert.equal(applied(hex).length, 1, 'a rolled-back batch is not re-applied on its own');
  const ok = await t.run('apply', { ops: [{ socket: ti.socket }] });
  assert.equal(ok.outcomes[0].ok, true);
  const d = await t.run('apply', { ops: [{ op: 'addProp', id: 'quad-5in', on: COVER, yawDeg: 0 }], dryRun: true });
  assert.equal(d.outcomes[0].tryInstead.op.yawDeg, 60);
});

test('yawSweep: a plain apply with atomic false puts the turned prop on', async () => {
  const hex = fakeHex({ fitsAt: 90 });
  const r = await createTools(hex).run('apply', { ops: [{ op: 'addProp', id: 'mug', on: COVER }, { op: 'addProp', id: 'quad-5in', on: COVER }], atomic: false });
  assert.equal(r.yawSwept.turns[0].turnDeg, 90);
  assert.equal(r.yawSwept.outcomes[0].ok, true);
});

// ---- dressInside

test('dressInside: in a part with only a top that fits is refused with the floor sizes, not put on top', async () => {
  const binSurfaces = [{ id: 'surface:top@bin', kind: 'top', outlineMm: [[0, 0], [80, 0], [80, 70], [0, 70]] }, { id: 'surface:floor@bin', kind: 'floor', depthMm: 60, outlineMm: [[0, 0], [80, 0], [80, 70], [0, 70]] }];
  const hex = fakeHex({ binSurfaces });
  // fits returns what the page says fits: here only the top (the floor is too small)
  const base = hex.call;
  hex.call = async (m, ...a) => (m === 'surfaces' && a[1]?.fits ? [binSurfaces[0]] : base(m, ...a));
  const r = await createTools(hex).run('dress', { props: [{ id: 'quad-5in', in: BIN }] });
  assert.equal(r.placed, 0);
  assert.equal(r.refused, 1);
  assert.equal(r.notPlaced[0].code, 'NO_FIT_INSIDE');
  assert.match(r.notPlaced[0].message, /floor 80 x 70 mm \(depth 60\)/);
  assert.match(r.notPlaced[0].message, /230 x 230 x 60 mm/);
  assert.equal(applied(hex).length, 0, 'nothing went on top');
});

test('dressInside: off, the old fallback puts it on the holder', async () => {
  const hex = fakeHex();
  const base = hex.call;
  hex.call = async (m, ...a) => (m === 'surfaces' && a[1]?.fits ? [{ id: 'surface:top@bin', kind: 'top' }] : base(m, ...a));
  await createTools(hex, { fixes: { dressInside: false } }).run('dress', { props: [{ id: 'tweezers', in: BIN }] });
  assert.equal(applied(hex)[0].surface, 'surface:top@bin');
});

test('dressInside: a floor that fits is used, and the rest of the call still goes on', async () => {
  const hex = fakeHex();
  const r = await createTools(hex).run('dress', { props: [{ id: 'tweezers', in: BIN }, { id: 'mug', in: BIN }] });
  assert.equal(r.placed, 1, 'tweezers on the floor');
  assert.equal(r.notPlaced.length, 1, 'the second has no free floor left');
  assert.match(r.notPlaced[0].message, /taken by this call/);
});

// ---- uncheckablePushback

const met = (requirement, evidence = 'see build') => ({ requirement, status: 'met', evidence });

test('uncheckablePushback: looks, quiet, sturdy, pet-safe and durable claims come back; disclaimers do not', () => {
  for (const r of ['Looks good on the desk', 'A quiet fan bay', 'Sturdy enough for daily use', 'pet-safe planter', 'durable caddy', 'beautiful display']) {
    assert.ok(uncheckableClaims({ requirements: [met(r)] }), r);
  }
  assert.ok(uncheckableClaims({ requirements: [met('a planter', 'safe for cats and robust')] }));
  assert.equal(uncheckableClaims({ requirements: [met('a planter', 'whether it is sturdy is not checked here')] }), null);
  assert.equal(uncheckableClaims({ requirements: [{ requirement: 'sturdy', status: 'unmet', evidence: 'material' }] }), null);
  assert.equal(uncheckableClaims({ requirements: [met('three bins', 'pretty close to the wall')] }), null);
  assert.equal(uncheckableClaims({ requirements: [met('three bins in a row')] }), null);
});

// ---- claimChecks

test('claimChecks: a drawer requirement met on a build with no drawers comes back', () => {
  const state = { nodes: [{ ref: BIN, family: 'bin' }] };
  assert.deepEqual(claimIssues({ requirements: [met('tweezers stored in a drawer')] }, state).map((x) => x.id), ['tweezers stored in a drawer']);
  assert.deepEqual(claimIssues({ requirements: [met('no drawers, open bins only')] }, state), []);
  assert.deepEqual(claimIssues({ requirements: [met('two drawers')] }, { nodes: [{ ref: 'd', family: 'drawer' }] }), []);
  assert.deepEqual(claimIssues({ requirements: [met('a drawer')] }, { nodes: [{ ref: 'notch:x', family: 'notch', stem: 'hex-notch-drawer' }] }), []);
});

test('claimChecks: a part limit in the brief is held against the part count', () => {
  assert.equal(partLimit('A caddy with at most 12 parts.'), 12);
  assert.equal(partLimit('Keep it under 10 pieces'), 9);
  assert.equal(partLimit('no more than 20 parts please'), 20);
  assert.equal(partLimit('three bins'), null);
  const nodes = Array.from({ length: 13 }, (_, i) => ({ ref: `n${i}`, family: 'bin' }));
  assert.deepEqual(claimIssues({ requirements: [met('a caddy')] }, { nodes }, 'at most 12 parts').map((x) => x.id), ['partLimit']);
  assert.deepEqual(claimIssues({ requirements: [met('a caddy')] }, { nodes }, 'at most 13 parts'), []);
  const clear = { issues: [], meshClash: 'clear' };
  assert.ok(verifyIssues({ requirements: [met('a caddy')] }, { nodes }, clear, [], { brief: 'at most 12 parts' }));
  assert.equal(verifyIssues({ requirements: [met('a caddy')] }, { nodes }, clear, [], { brief: 'at most 12 parts', claimChecks: false }), null);
});

// ---- viewGuard

test('viewGuard: hidden props from the default view send back a met requirement about facing or display', () => {
  const seen = { hidden: ['prop:mug'] };
  assert.equal(viewIssues({ requirements: [met('mugs on display facing the room')] }, seen).length, 1);
  assert.equal(viewIssues({ requirements: [met('three mugs')] }, seen), null);
  assert.equal(viewIssues({ requirements: [met('all open faces capped')] }, seen), null);
  assert.equal(viewIssues({ requirements: [met('mugs on display')] }, { hidden: [] }), null);
});

// ---- the finish chain, end to end with a scripted model

const finishWith = (requirement, evidence = 'on the build') => ({ name: 'finish', args: { requirements: [{ requirement, status: 'met', evidence }], summary: 's', outcome: 'built' } });

test('finish chain: an uncheckable claim goes back once, then the second finish stands', async () => {
  const model = mockModel([[finishWith('a sturdy bin')], [finishWith('a sturdy bin')]]);
  const r = await runAgent({ hex: fakeHex(), model, brief: 'a sturdy bin' });
  assert.equal(r.pushbacks, 1);
  assert.ok(r.events.some((e) => e.type === 'finish_pushback' && /configurator checks/.test(JSON.stringify(e.disagreements))));
  assert.ok(r.finish);
  const off = await runAgent({ hex: fakeHex(), model: mockModel([[finishWith('a sturdy bin')]]), brief: 'a sturdy bin', features: parseFeatures('-uncheckablePushback') });
  assert.equal(off.pushbacks, 0);
});

test('finish chain: a drawer claim with no drawers goes back (claimChecks)', async () => {
  const model = mockModel([[finishWith('tweezers in a drawer')], [finishWith('tweezers in a drawer')]]);
  const r = await runAgent({ hex: fakeHex(), model, brief: 'tweezers in a drawer' });
  assert.equal(r.pushbacks, 1);
  assert.match(JSON.stringify(r.events.find((e) => e.type === 'finish_pushback')), /no drawers/);
  const ok = await runAgent({ hex: fakeHex({ drawers: true }), model: mockModel([[finishWith('tweezers in a drawer')]]), brief: 'x' });
  assert.equal(ok.pushbacks, 0);
});

test('finish chain: viewGuard takes one still and sends back hidden display props once', async () => {
  const model = mockModel([[finishWith('mugs on display')], [finishWith('mugs on display')]]);
  const hex = fakeHex({ hidden: ['prop:mug'] });
  const r = await runAgent({ hex, model, brief: 'mugs on display' });
  assert.equal(r.pushbacks, 1);
  assert.equal(hex.calls.filter((c) => c[0] === 'still').length, 1);
  assert.match(JSON.stringify(r.events.find((e) => e.type === 'finish_pushback')), /prop:mug/);
  const seen = fakeHex();
  const r2 = await runAgent({ hex: seen, model: mockModel([[finishWith('mugs on display')]]), brief: 'x' });
  assert.equal(r2.pushbacks, 0);
  const off = fakeHex({ hidden: ['prop:mug'] });
  await runAgent({ hex: off, model: mockModel([[finishWith('mugs on display')]]), brief: 'x', features: parseFeatures('-viewGuard') });
  assert.equal(off.calls.filter((c) => c[0] === 'still').length, 0);
});

// ---- survey

test('survey: the build, offers per family and props in one call; off, not offered', async () => {
  const hex = fakeHex();
  const r = await createTools(hex).run('survey', { families: ['bin', 'drawer'], props: ['quad'] });
  assert.equal(r.build.total, 2);
  assert.deepEqual(Object.keys(r.sockets), ['bin', 'drawer']);
  assert.equal(r.sockets.bin.sockets[0].socket, 's1');
  assert.equal(r.props.quad.props[0].id, 'quad-5in');
  assert.ok(toolSpecsFor({}).some((t) => t.name === 'survey'));
  assert.ok(!toolSpecsFor({ survey: false }).some((t) => t.name === 'survey'));
  assert.match((await createTools(hex, { fixes: { survey: false } }).run('survey', {})).error, /off/);
});
