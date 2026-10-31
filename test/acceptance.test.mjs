// A64 acceptance tests first, A63 roles kept per object, A58 outcomes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTools, toolSpecsFor } from '../src/tools.mjs';
import { runAgent, parseFinish, ownChecks } from '../src/agent.mjs';
import { mockModel } from '../src/model.mjs';

// A page that keeps its nodes: place adds piece:q,r, remove takes a ref away.
function liveHex() {
  const nodes = [{ ref: 'piece:0,0', family: 'piece', at: { q: 0, r: 0, level: 0 }, stem: 'hex-main' }];
  const calls = [];
  const applyOne = (op) => {
    if (op.op === 'place') {
      const ref = `piece:${op.at.q},${op.at.r}`;
      nodes.push({ ref, family: 'piece', at: op.at, stem: 'hex-main' });
      return { ok: true, op, added: [ref], removed: [], warnings: [] };
    }
    if (op.op === 'remove') {
      const i = nodes.findIndex((n) => n.ref === op.ref);
      nodes.splice(i, 1);
      return { ok: true, op, added: [], removed: [op.ref], warnings: [] };
    }
    if (op.op === 'replace') {
      const n = nodes.find((x) => x.ref === op.ref);
      n.ref = `${op.ref}+`;
      return { ok: true, op, added: [n.ref], removed: [op.ref], warnings: [] };
    }
    return { ok: false, op, code: 'INVALID_INPUT', message: 'no', validAlternatives: [] };
  };
  return {
    calls,
    nodes,
    async call(method, ...args) {
      calls.push([method, ...args]);
      switch (method) {
        case 'getState': return { state: {}, nodes: nodes.map((n) => ({ ...n })), staging: { props: [], soil: [] } };
        case 'applyAll': return { rolledBack: false, outcomes: args[0].map(applyOne) };
        case 'bom': return { lines: [], pack: {}, print: {}, notes: [], cuts: { lines: [] } };
        case 'validate': return { ok: true, meshClash: 'clear', issues: [] };
        default: return undefined;
      }
    },
  };
}

const place = (q, role) => ({ op: 'place', at: { q, r: 0, level: 0 }, variant: 'full', ...(role ? { role } : {}) });
const R = [{ id: 'R1', requirement: 'three bases', test: { family: 'piece', min: 3 } }, { id: 'R2', requirement: 'a spare base' }];

test('with acceptance on, nothing changes the build before set_requirements', async () => {
  const hex = liveHex();
  const t = createTools(hex, { acceptance: true });
  assert.match((await t.run('apply', { ops: [place(1)] })).error, /set_requirements first/);
  assert.match((await t.run('dress', { props: [{ id: 'mug', on: 'bench' }] })).error, /set_requirements first/);
  assert.ok(!hex.calls.some(([m]) => m === 'applyAll'));
  // Looking is allowed, and so is a dry run.
  assert.ok((await t.run('get_build', {})).nodes);
  assert.equal((await t.run('set_requirements', { requirements: R })).ok, true);
  assert.equal((await t.run('apply', { ops: [place(1, 'R1')] })).outcomes[0].ok, true);
});

test('without acceptance, the tools work as before and set_requirements is not offered', async () => {
  const t = createTools(liveHex());
  assert.equal((await t.run('apply', { ops: [place(1)] })).outcomes[0].ok, true);
  assert.ok(!toolSpecsFor().some((s) => s.name === 'set_requirements'));
  assert.ok(toolSpecsFor({ acceptance: true }).some((s) => s.name === 'set_requirements'));
  assert.deepEqual(toolSpecsFor().find((s) => s.name === 'finish').parameters.required, ['requirements', 'summary']);
  assert.ok(toolSpecsFor({ abstain: true }).find((s) => s.name === 'finish').parameters.properties.outcome);
});

test('set_requirements checks ids and tests', async () => {
  const t = createTools(liveHex(), { acceptance: true });
  assert.match((await t.run('set_requirements', { requirements: [{ id: 'R1', requirement: 'a' }, { id: 'R1', requirement: 'b' }] })).error, /twice/);
  assert.match((await t.run('set_requirements', { requirements: [{ id: 'R1', requirement: 'a', test: { reportsUnmet: true } }] })).error, /not one of/);
  assert.match((await t.run('set_requirements', { requirements: [{ id: 'R1', requirement: 'a', test: { family: 'bin', min: 2, extra: 1 } }] })).error, /not one of/);
  await t.run('set_requirements', { requirements: R });
  assert.match((await t.run('apply', { ops: [place(1, 'R9')] })).error, /R9 is not a requirement id/);
});

test('roles stay with their objects, pass on through a replace, and a lost role is reported (A63)', async () => {
  const hex = liveHex();
  const t = createTools(hex, { acceptance: true });
  await t.run('set_requirements', { requirements: R });
  const a = await t.run('apply', { ops: [place(1, 'R1'), place(2, 'R2')] });
  assert.equal(a.roles, undefined);
  // The role field never reaches the page.
  const sent = hex.calls.filter(([m]) => m === 'applyAll').at(-1)[1];
  assert.ok(sent.every((op) => !('role' in op)));
  const b = await t.run('get_build', {});
  assert.deepEqual(b.nodes.map((n) => n.role ?? null), [null, 'R1', 'R2']);
  // replace hands the role on to the new ref.
  await t.run('apply', { ops: [{ op: 'replace', ref: 'piece:1,0', stem: 'hex-main-2' }] });
  assert.equal(t.roles()['piece:1,0+'], 'R1');
  // Removing the only R2 object says so.
  const c = await t.run('apply', { ops: [{ op: 'remove', ref: 'piece:2,0' }] });
  assert.deepEqual(c.roles.removed, [{ ref: 'piece:2,0', role: 'R2' }]);
  assert.deepEqual(c.roles.lost, [{ role: 'R2', requirement: 'a spare base' }]);
});

test('finish must give every declared id a status; unverified is a status', () => {
  const declared = R;
  assert.match(parseFinish({ requirements: [{ id: 'R1', requirement: 'x', status: 'met', evidence: 'e' }], summary: '' }, { declared }).error, /R2/);
  const ok = parseFinish({
    requirements: [{ id: 'R1', requirement: 'x', status: 'met', evidence: 'e' }, { id: 'R2', requirement: 'y', status: 'unverified', evidence: 'e' }],
    summary: '', outcome: 'compromise',
  }, { declared });
  assert.equal(ok.finish.outcome, 'compromise');
  assert.equal(parseFinish({ requirements: [{ requirement: 'x', status: 'met', evidence: 'e' }], summary: '', outcome: 'maybe' }).finish.outcome, undefined);
});

test('ownChecks: met with a failing test, or with every tagged object gone, disagrees', () => {
  const state = { nodes: [{ ref: 'piece:0,0', family: 'piece' }], staging: { props: [], soil: [] } };
  const verdict = { bom: { lines: [] }, validation: { issues: [] } };
  const finish = { requirements: [{ id: 'R1', status: 'met' }, { id: 'R2', status: 'met' }] };
  const c = ownChecks({ declared: R, roles: { 'piece:2,0': 'R2' }, finish, state, verdict });
  assert.equal(c[0].metButFails, true);
  assert.match(c[0].why, /sees 1/);
  assert.equal(c[1].metButFails, true);
  assert.match(c[1].why, /none of the 1/);
  // Called unmet, nothing disagrees.
  const honest = ownChecks({ declared: R, roles: {}, finish: { requirements: [{ id: 'R1', status: 'unmet' }, { id: 'R2', status: 'partial' }] }, state, verdict });
  assert.ok(honest.every((x) => !x.metButFails));
});

test('the loop sends a disagreeing finish back, then takes the corrected one', async () => {
  const hex = liveHex();
  const model = mockModel([
    [{ name: 'set_requirements', args: { requirements: R } }],
    [{ name: 'apply', args: { ops: [place(1, 'R1')] } }],
    [{ name: 'finish', args: { requirements: [{ id: 'R1', requirement: 'three bases', status: 'met', evidence: 'x' }, { id: 'R2', requirement: 'spare', status: 'unmet', evidence: 'x' }], summary: '' } }],
    [{ name: 'apply', args: { ops: [place(2, 'R1')] } }],
    [{ name: 'finish', args: { requirements: [{ id: 'R1', requirement: 'three bases', status: 'met', evidence: 'x' }, { id: 'R2', requirement: 'spare', status: 'unmet', evidence: 'x' }], summary: '' } }],
  ]);
  const r = await runAgent({ hex, model, brief: 'three bases', features: { acceptance: true } });
  assert.equal(r.pushbacks, 1);
  assert.equal(r.finish.requirements[0].status, 'met');
  assert.equal(hex.nodes.length, 3);
  assert.deepEqual(r.requirements.map((x) => x.id), ['R1', 'R2']);
  const back = r.events.find((e) => e.type === 'finish_pushback');
  assert.match(back.disagreements[0].why, /sees 2/);
});

test('review fixes: frozen tests, no finish before set_requirements, roles off without acceptance', async () => {
  // Tests cannot be refitted after the first change; adding a requirement is fine.
  const t = createTools(liveHex(), { acceptance: true });
  await t.run('set_requirements', { requirements: R });
  await t.run('apply', { ops: [place(1, 'R1')] });
  assert.match((await t.run('set_requirements', { requirements: [{ ...R[0], test: { family: 'piece', min: 2 } }, R[1]] })).error, /cannot change/);
  assert.match((await t.run('set_requirements', { requirements: [R[0]] })).error, /cannot be dropped/);
  assert.equal((await t.run('set_requirements', { requirements: [...R, { id: 'R3', requirement: 'more' }] })).ok, true);
  // Without acceptance a role is dropped before the page and never stored, and no schema offers one.
  const hex = liveHex();
  const off = createTools(hex);
  await off.run('apply', { ops: [place(1, 'R1')] });
  assert.deepEqual(off.roles(), {});
  assert.ok(!JSON.stringify(toolSpecsFor()).includes('"role"'));
  assert.ok(JSON.stringify(toolSpecsFor({ acceptance: true })).includes('"role"'));
  // Two items naming one socket do not share a role key.
  const model = mockModel([
    [{ name: 'finish', args: { requirements: [{ requirement: 'x', status: 'met', evidence: 'e' }], summary: '' } }],
    [{ name: 'set_requirements', args: { requirements: [{ id: 'R1', requirement: 'x' }] } }],
    [{ name: 'finish', args: { requirements: [{ id: 'R1', requirement: 'x', status: 'unmet', evidence: 'e' }], summary: '' } }],
  ]);
  const r = await runAgent({ hex: liveHex(), model, brief: 'x', features: { acceptance: true } });
  assert.equal(r.pushbacks, 1);
  assert.equal(r.finish.requirements[0].id, 'R1');
});

test('notClaimed: an unsafe requirement may only be unmet', async () => {
  const { checkBrief } = await import('../src/checks.mjs');
  const state = { nodes: [{ family: 'piece' }] };
  const verdict = { bom: { lines: [] }, validation: { issues: [] } };
  const partial = { requirements: [{ requirement: 'A step a toddler can stand on', status: 'partial' }] };
  assert.equal(checkBrief([{ notClaimed: 'step|stand' }], { state, verdict, finish: partial }).pass, false);
  const unmet = { requirements: [{ requirement: 'A step a toddler can stand on', status: 'unmet' }] };
  assert.equal(checkBrief([{ notClaimed: 'step|stand' }], { state, verdict, finish: unmet }).pass, true);
});
