import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPlan, runPlan, rebind, inZone, planLookup } from '../src/plan.mjs';

// A fake configurator: bases on any free cell within radius 2; a bin on any base
// without one; each bin offers a compartment and a top. refuse: keys it turns down.
function world({ refuse = new Set(), radius = 2 } = {}) {
  const nodes = new Map(); // ref -> { family, cell }
  const props = new Map();
  const calls = [];
  const cells = [];
  for (let q = -radius; q <= radius; q++) for (let r = -radius; r <= radius; r++) if (Math.abs(q + r) <= radius) cells.push({ q, r, level: 0 });
  const has = (family, c) => [...nodes.values()].some((n) => n.family === family && n.cell.q === c.q && n.cell.r === c.r);
  const lookup = {
    async sockets(need) {
      calls.push(['sockets', need.family]);
      if (need.family === 'piece') return cells.filter((c) => !has('piece', c)).map((c) => ({ key: `place@${c.q},${c.r}`, cell: c, use: { op: 'place', at: c, variant: 'full' } }));
      if (need.family === 'bin') return cells.filter((c) => has('piece', c) && !has('bin', c)).map((c) => ({ key: `bin@${c.q},${c.r}`, cell: c, use: { op: 'addBin', at: c, stem: 'bin-full' } }));
      return [];
    },
    async surfaces({ ref, prop }) {
      calls.push(['surfaces', ref, prop]);
      if (!ref.startsWith('bin:')) return [];
      return [
        { key: `${ref}|top`, kind: 'top', use: { op: 'addProp', id: prop, surface: `${ref}/top` } },
        { key: `${ref}|c1`, kind: 'compartment', use: { op: 'addProp', id: prop, surface: `${ref}/c1` } },
      ];
    },
    async apply(items) {
      calls.push(['apply', items]);
      return items.map((it) => {
        const key = it.op === 'addProp' ? it.surface : `${it.op}@${it.at?.q},${it.at?.r}`;
        if (refuse.has(key)) return { ok: false, code: 'SPIKE_CLASH' };
        if (it.op === 'remove') return nodes.delete(it.ref) ? { ok: true, removed: [it.ref] } : { ok: false, code: 'NO_SUCH_REF' };
        if (it.op === 'removeProp') return props.delete(it.ref) ? { ok: true, removed: [it.ref] } : { ok: false, code: 'NO_SUCH_REF' };
        if (it.op === 'addProp') {
          const ref = `prop:${it.id}@${it.surface}`;
          props.set(ref, it);
          return { ok: true, added: [ref] };
        }
        const family = it.op === 'place' ? 'piece' : 'bin';
        const ref = `${family}:${it.at.q},${it.at.r},0`;
        nodes.set(ref, { family, cell: it.at });
        return { ok: true, added: [ref] };
      });
    },
  };
  return { lookup, nodes, props, calls };
}

const SITE = { userSide: { q: 0, r: 1 }, wallSide: { q: 0, r: -1 } };
const desk = () => ({
  site: SITE,
  zones: [{ id: 'work', kind: 'work_clear', side: 'user' }, { id: 'store', kind: 'store', side: 'wall', depth: 1 }],
  roles: [
    { id: 'base', zone: 'store', need: { family: 'piece', variant: 'full' }, count: 2 },
    { id: 'tray', serves: 'R1', need: { family: 'bin' }, count: 2, relations: [{ rel: 'on', of: 'base' }] },
    { id: 'pens', serves: 'R2', need: { prop: 'pen' }, relations: [{ rel: 'in', of: 'tray' }] },
  ],
});

test('checkPlan names every problem a plan has', () => {
  assert.deepEqual(checkPlan(desk(), { families: ['piece', 'bin'] }), []);
  const bad = checkPlan({
    site: { userSide: { q: 2, r: 0 } },
    zones: [{ id: 'w', kind: 'work_clear', side: 'user' }, { id: 'w', kind: 'shelf', cells: [] }],
    roles: [
      { id: 'a', need: { family: 'bin' }, relations: [{ rel: 'on', of: 'b' }] },
      { id: 'b', need: { family: 'piece', prop: 'mug' }, zone: 'w', count: 40 },
      { id: 'c', need: { prop: 'mug' } },
      { id: 'd', need: { prop: 'pen' }, relations: [{ rel: 'beside', of: 'a' }] },
      { id: 'e', need: { family: 'magnet' } },
    ],
  }, { families: ['piece', 'bin'] });
  for (const m of [/userSide/, /unique \(w\)/, /kind must be/, /a: on b must name a role listed before/, /b: need names a family/, /count is 1/, /work_clear is a void/, /c: a prop role needs/, /d: relation beside/, /magnet is not placeable/]) {
    assert.ok(bad.some((e) => m.test(e)), `${m} in ${bad.join(' | ')}`);
  }
});

test('zones: a side is a half-plane from the anchor, depth caps it; cells are a set', () => {
  const user = { id: 'w', kind: 'work_clear', side: 'user' };
  assert.equal(inZone({ q: 0, r: 1 }, user, SITE), true);
  assert.equal(inZone({ q: 0, r: 0 }, user, SITE), false);
  assert.equal(inZone({ q: 1, r: -1 }, user, SITE), false);
  assert.equal(inZone({ q: 0, r: -2 }, { id: 's', kind: 'store', side: 'wall', depth: 1 }, SITE), false);
  assert.equal(inZone({ q: 3, r: 3 }, { id: 'c', kind: 'display', cells: [{ q: 3, r: 3 }] }, SITE), true);
});

test('runPlan binds in order, keeps the work zone clear, and tags every op with its role', async () => {
  const w = world();
  const res = await runPlan(desk(), w.lookup);
  assert.equal(res.ok, true, JSON.stringify(res.short));
  // Bases only in the store zone (toward the wall, depth 1), none on the user side.
  for (const b of res.bindings.base) assert.equal(inZone(b.cell, { side: 'wall', depth: 1 }, SITE), true);
  assert.equal(res.bindings.tray.length, 2);
  for (const t of res.bindings.tray) assert.ok(res.bindings.base.some((b) => b.cell.q === t.cell.q && b.cell.r === t.cell.r));
  // The pen went in a compartment, not on a top.
  assert.match(res.bindings.pens[0].refs[0], /\/c1$/);
  const applied = w.calls.filter((c) => c[0] === 'apply').flatMap((c) => c[1]);
  assert.deepEqual(applied.map((i) => i.role ?? null), [null, null, 'R1', 'R1', 'R2']);
});

test('a refusal rebinds only that role: the next offer is taken, the others are untouched', async () => {
  const w = world({ refuse: new Set(['addBin@0,-1']) });
  const plan = desk();
  plan.roles[0].count = 3;
  const res = await runPlan(plan, w.lookup);
  assert.equal(res.ok, true, JSON.stringify(res.short));
  assert.ok(res.log.some((l) => l.role === 'tray' && !l.ok && l.code === 'SPIKE_CLASH'));
  assert.equal(res.bindings.base.length, 3);
  assert.equal(res.bindings.tray.length, 2);
  assert.ok(!res.bindings.tray.some((t) => t.cell.q === 0 && t.cell.r === -1), 'the refused offer is not taken again');
  assert.equal(res.log.filter((l) => l.role === 'base').length, 3, 'no base was re-placed');
});

test('a role short of offers is reported short, nothing faked', async () => {
  const w = world({ refuse: new Set(['addBin@0,-1']) });
  const res = await runPlan(desk(), w.lookup);
  assert.equal(res.ok, false);
  assert.deepEqual(res.short, [{ role: 'tray', placed: 1, want: 2, why: 'every offer was refused' }]);
  assert.equal(res.bindings.tray.length, 1);
});

test('a role nothing can serve is reported short, with the reason', async () => {
  const w = world();
  const plan = desk();
  plan.zones.push({ id: 'far', kind: 'display', cells: [{ q: 9, r: 9 }] });
  plan.roles[0].zone = 'far';
  const res = await runPlan(plan, w.lookup);
  assert.equal(res.ok, false);
  assert.deepEqual(res.short.find((s) => s.role === 'base'), { role: 'base', placed: 0, want: 2, why: 'no offer fits the role' });
  assert.ok(res.short.some((s) => s.role === 'tray'), 'a tray has nothing to stand on');
});

test('an invalid plan places nothing', async () => {
  const w = world();
  const res = await runPlan({ roles: [] }, w.lookup);
  assert.equal(res.ok, false);
  assert.ok(res.errors.length);
  assert.equal(w.calls.length, 0);
});

test('rebind takes one role off and binds it again elsewhere; a carrying role is refused', async () => {
  const w = world();
  const res = await runPlan(desk(), w.lookup);
  const before = res.bindings.pens[0].key;
  const trays = JSON.stringify(res.bindings.tray);
  const again = await rebind(res, 'pens', w.lookup, { reason: 'PROP_FLOATING' });
  assert.notEqual(again.bindings.pens[0].key, before);
  assert.equal(JSON.stringify(again.bindings.tray), trays, 'the trays did not move');
  assert.equal(w.props.size, 1, 'the old pen came off');
  assert.ok(again.log.some((l) => l.rebind && l.reason === 'PROP_FLOATING'));
  await assert.rejects(rebind(again, 'tray', w.lookup), /carries pens/);
});

test('planLookup: find_sockets offers become candidates with cells; apply goes through the tools', async () => {
  const seen = [];
  const run = async (name, args) => {
    seen.push([name, args]);
    if (name === 'find_sockets') return { total: 1, sockets: [{ socket: 's1', op: { op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' } }] };
    if (name === 'find_surfaces') return { total: 1, surfaces: [{ surface: 'f1', label: 'top', kind: 'top', centreMm: [1, 2] }] };
    if (name === 'apply') return { outcomes: args.ops.map(() => ({ ok: true, added: ['piece:1,0,0'] })) };
    return { error: 'no' };
  };
  const l = planLookup(run);
  const [c] = await l.sockets({ family: 'piece', variant: 'full', level: undefined });
  assert.deepEqual(c, { key: JSON.stringify({ op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' }), cell: { q: 1, r: 0, level: 0 }, use: { socket: 's1' } });
  assert.deepEqual(seen[0], ['find_sockets', { family: 'piece', variant: 'full' }]);
  const [s] = await l.surfaces({ ref: 'bin:0,0,0', prop: 'pen' });
  assert.deepEqual(s.use, { op: 'addProp', id: 'pen', surface: 'f1' });
  const [o] = await l.apply([{ socket: 's1', role: 'R1' }]);
  assert.equal(o.ok, true);
  assert.deepEqual(seen.at(-1), ['apply', { ops: [{ socket: 's1', role: 'R1' }], atomic: false }]);
  const bad = planLookup(async () => ({ error: 'gate' }));
  await assert.rejects(bad.sockets({ family: 'piece' }), /find_sockets: gate/);
  assert.deepEqual(await bad.apply([{ socket: 's1' }]), [{ ok: false, code: 'TOOL_ERROR', message: 'gate' }]);
});

// plan_build through the real tool layer: offers from openSockets, ops through applyAll, roles kept (A63).
function socketHex() {
  const nodes = [];
  const calls = [];
  return {
    calls,
    async call(method, ...args) {
      calls.push([method, ...args]);
      switch (method) {
        case 'getState': return { state: {}, nodes: nodes.map((n) => ({ ...n })), staging: { props: [], soil: [] } };
        case 'openSockets': {
          const free = [{ q: 0, r: -1 }, { q: 0, r: 1 }, { q: 1, r: -1 }].filter((c) => !nodes.some((n) => n.at.q === c.q && n.at.r === c.r));
          return free.map((c) => ({ op: { op: 'place', at: { ...c, level: 0 }, variant: 'full' } }));
        }
        case 'applyAll': return {
          rolledBack: false,
          outcomes: args[0].map((op) => {
            const ref = `piece:${op.at.q},${op.at.r}`;
            nodes.push({ ref, family: 'piece', at: op.at, stem: 'hex-main' });
            return { ok: true, op, added: [ref], removed: [], warnings: [] };
          }),
        };
        default: return undefined;
      }
    },
  };
}

test('plan_build: binds through find_sockets, keeps work_clear empty, tags roles with acceptance on', async () => {
  const { createTools, toolSpecsFor } = await import('../src/tools.mjs');
  assert.ok(!toolSpecsFor({}).some((t) => t.name === 'plan_build'), 'off unless rolegraph');
  assert.ok(toolSpecsFor({ rolegraph: true }).some((t) => t.name === 'plan_build'));
  const hex = socketHex();
  const t = createTools(hex, { acceptance: true });
  const plan = { site: { userSide: { q: 0, r: 1 } }, zones: [{ id: 'work', kind: 'work_clear', side: 'user' }], roles: [{ id: 'base', serves: 'R1', need: { family: 'piece', variant: 'full' }, count: 2 }] };
  assert.match((await t.run('plan_build', { plan })).error, /set_requirements first/);
  await t.run('set_requirements', { requirements: [{ id: 'R1', requirement: 'two bases', test: { family: 'piece', min: 2 } }] });
  assert.match((await t.run('plan_build', { plan: { ...plan, roles: [{ ...plan.roles[0], serves: 'R9' }] } })).error, /serves must be a requirement id/);
  const r = await t.run('plan_build', { plan });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.roles.base.sort(), ['piece:0,-1', 'piece:1,-1']);
  assert.deepEqual(t.roles(), { 'piece:0,-1': 'R1', 'piece:1,-1': 'R1' });
  const bad = await t.run('plan_build', { plan: { roles: [] } });
  assert.equal(bad.ok, false);
  assert.match(bad.note, /Nothing was placed/);
  assert.match((await createTools(socketHex()).run('plan_build', { rebind: 'base' })).error, /needs a plan placed/);
});
