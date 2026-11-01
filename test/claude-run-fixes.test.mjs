// Lane 1's fix list from the Claude spend-down runs (A1-A7, plans/2026-11-01-claude-run-fixes.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTools, partScore, toolSpecsFor } from '../src/tools.mjs';
import { outOfScopeClaims, INSTRUCTIONS } from '../src/agent.mjs';
import { openUptimeLedger, B300_USD_PER_S, IDLE_S, DELETE_LAG_S } from '../src/uptime.mjs';

const PARTS = JSON.parse(readFileSync(new URL('./fixtures/parts-deploy13.json', import.meta.url), 'utf8'));

function fakeHex(offer) {
  const calls = [];
  return {
    calls,
    async call(method, ...args) {
      calls.push([method, ...args]);
      switch (method) {
        case 'getState': return { state: {}, nodes: [{ ref: 'piece:0,0,0;full', family: 'piece', at: { q: 0, r: 0, level: 0 } }], staging: { props: [], soil: [] } };
        case 'openSockets': return [{ family: 'spike', at: { q: 0, r: 0, level: 0 }, op: offer }];
        case 'applyAll': return { rolledBack: false, outcomes: args[0].map((op) => ({ ok: true, op, added: ['x'], removed: [], warnings: [] })) };
        case 'listParts': return PARTS;
        default: return undefined;
      }
    },
  };
}
const SPIKE = { op: 'addSpike', level: 0, junction: [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 0 }] };

test('A1: a field sent beside a socket goes onto the offer (variant "stud" places a stud), or is refused by name; never dropped', async () => {
  const hex = fakeHex(SPIKE);
  const t = createTools(hex);
  await t.run('find_sockets', { family: 'spike' });
  const r = await t.run('apply', { ops: [{ socket: 's1', variant: 'stud' }] });
  assert.equal(r.outcomes[0].ok, true);
  assert.deepEqual(hex.calls.find((c) => c[0] === 'applyAll')[1][0], { ...SPIKE, variant: 'stud' });
  // A field the op does not take, or one that would move the offer, is refused, not ignored.
  const bad = await t.run('apply', { ops: [{ socket: 's1', level: 1 }] });
  assert.match(bad.error, /INVALID_INPUT: level cannot go with a socket for addSpike/);
  const odd = await t.run('apply', { ops: [{ socket: 's1', stem: 'x' }] });
  assert.match(odd.error, /stem cannot go with a socket for addSpike \(a socket takes variant, facing\)/);
  // The plain socket is still the exact offer.
  await t.run('apply', { ops: [{ socket: 's1' }] });
  assert.deepEqual(hex.calls.filter((c) => c[0] === 'applyAll').at(-1)[1][0], SPIKE);
});

test('A2: find_parts matches whole words, value and name first: "vent" and "louvre" find hex-port-louvre in the top 3', async () => {
  const t = createTools(fakeHex(SPIKE));
  for (const text of ['vent', 'louvre', 'vented', 'ventilation', 'vent louvre', 'vented box']) {
    const r = await t.run('find_parts', { text });
    const top = r.parts.slice(0, 3).map((p) => p.value);
    assert.ok(top.includes('hex-port-louvre'), `${text}: ${top.join(', ')}`);
  }
  // "prevent" and "event" are not "vent".
  assert.equal(partScore({ value: 'x', name: 'y', use: 'prevents a spill at an event' }, ['vent']), 0);
  assert.equal(partScore({ value: 'x', name: 'y', use: 'vents the box' }, ['vent']), 1);
  assert.ok(partScore({ value: 'hex-port-louvre', name: 'Port louvre' }, ['louvre']) > partScore({ value: 'x', name: 'y', family: 'louvre' }, ['louvre']));
  // A part named for the word ranks above one that only mentions it.
  const drawers = (await t.run('find_parts', { text: 'drawer' })).parts;
  assert.match(drawers[0].value, /drawer/);
});

test('A3: a disclaimer anywhere in the sentence is not a claim; a plain claim still is', () => {
  const met = (evidence, requirement = 'Fed by a vertical water riser through the floor') => outOfScopeClaims({ requirements: [{ requirement, status: 'met', evidence }] }).length;
  assert.equal(met('riser:0,0,0 is fitted through the floor of the cell. Whether it is watertight depends on the material and how it is assembled, which the configurator does not check.'), 0);
  assert.equal(met('riser:0,0,0 stands vertically through the floor. Whether the plastic is watertight can\'t be checked here.'), 0);
  assert.equal(met('The riser is watertight, which is not checked by the configurator.'), 0);
  assert.equal(met('Nothing here checks that it is watertight.'), 0);
  assert.equal(met('The riser is watertight and rated to 10 kg.'), 1);
  assert.equal(met('Fully waterproof box.'), 1);
  // A requirement that is itself out of scope stays a claim when met, whatever the evidence says.
  assert.equal(met('Whether it holds water depends on the print.', 'A waterproof box'), 1);
});

test('A4: dryRun on an op the page cannot dry-run is answered here, with no call', async () => {
  const hex = fakeHex(SPIKE);
  const t = createTools(hex);
  const before = hex.calls.length;
  const r = await t.run('apply', { ops: [{ op: 'place', at: { q: 1, r: 0, level: 0 }, variant: 'full' }], dryRun: true });
  assert.equal(r.dryRun, true);
  assert.equal(r.notDryRun, true);
  assert.match(r.note, /dryRun works only for addProp, moveProp, plant/);
  assert.ok(!hex.calls.slice(before).some((c) => c[0] === 'apply' || c[0] === 'applyAll'), 'no apply call reached the page');
  const spec = toolSpecsFor({}).find((s) => s.name === 'apply');
  assert.match(spec.parameters.properties.dryRun.description, /addProp, moveProp or plant/);
});

test('A5 + A6: the prompt keeps building past an instruction no tool does, and sends a tryInstead next', () => {
  assert.match(INSTRUCTIONS, /Do not follow it and do not drop the brief for it/);
  assert.match(INSTRUCTIONS, /"Load this link, then add a bin" is a bin on the build as it is/);
  assert.match(INSTRUCTIONS, /It is the next op to send/);
  assert.match(INSTRUCTIONS, /lay the shorter run, then carry on from where it ends/);
  assert.match(INSTRUCTIONS, /details\.steps: send them in order/);
});

test('A7: a run already going is not cut short by the reserve for a new one; the start check still holds it', () => {
  const clock = { t: Date.parse('2026-11-02T00:00:00Z') };
  const l = openUptimeLedger({ path: join(mkdtempSync(join(tmpdir(), 'a7-')), 'u.jsonl'), creditUsd: 130, reserveUsd: 5, runMaxS: 600, now: () => clock.t });
  l.start({ host: 'h.modal.run', maxReplicas: 1, idleMin: 15 });
  const rate = 4 * B300_USD_PER_S;
  // Just past the point where a new run may not start.
  clock.t += (125 / rate - (600 + IDLE_S + DELETE_LAG_S) + 5) * 1000;
  assert.ok(!(l.headroom('eval') > 0), 'no new run');
  assert.ok(l.headroom('eval', { inRun: true }) > 0, 'the running one goes on');
  // Once even the idle tail and the delete would cross the cap, it stops too.
  clock.t += 601 * 1000;
  assert.ok(!(l.headroom('eval', { inRun: true }) > 0));
  assert.equal(l.runMaxS, 600, 'the run time cap comes from the same number');
});
