import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { buildNames, sheetFor, parseAnswer, critique, combine, ownerVerdicts, implicated, calibrate, claudeJudge, QUESTIONS } from '../src/critic.mjs';

const on = (files) => (p) => files.some((f) => p.endsWith(f));

test('sheetFor finds the three views by name; a missing one makes it incomplete', () => {
  const full = sheetFor('desk', 'D', { exists: on(['desk.png', 'desk-back.png', 'desk-top.png']) });
  assert.equal(full.complete, true);
  assert.equal(full.views.opposite, join('D', 'desk-back.png'));
  const two = sheetFor('desk', 'D', { exists: on(['desk.png', 'desk-back.png']) });
  assert.deepEqual(two.missing, ['top']);
  assert.equal(sheetFor('desk', 'D', { views: ['threeQuarter', 'opposite'], exists: on(['desk.png', 'desk-back.png']) }).complete, true);
});

test('parseAnswer reads yes or no at the start only', () => {
  assert.equal(parseAnswer('Yes, a desk organiser.'), 'yes');
  assert.equal(parseAnswer('**No** - the mug floats'), 'no');
  assert.equal(parseAnswer('I think yes'), null);
  assert.equal(parseAnswer(''), null);
});

test('critique asks every question with every view, and skips an incomplete sheet', async () => {
  const asked = [];
  const judge = async ({ question, images }) => (asked.push([question, images.length]), { answer: /floating/.test(question) ? 'no' : 'yes', why: 'seen' });
  const sheet = sheetFor('desk', 'D', { exists: () => true });
  const r = await critique(sheet, judge);
  assert.equal(asked.length, QUESTIONS.length);
  assert.ok(asked.every(([, n]) => n === 3));
  assert.deepEqual(Object.fromEntries(Object.entries(r.answers).map(([k, a]) => [k, a.answer])), { purpose: 'yes', rests: 'no', pose: 'yes', workZone: 'yes' });
  const none = await critique(sheetFor('desk', 'D', { exists: on(['desk.png']) }), judge);
  assert.equal(none.complete, false);
  assert.equal(asked.length, QUESTIONS.length, 'not judged');
  const text = await critique(sheet, async () => ({ text: 'No: nothing in the bins.' }));
  assert.equal(text.answers.purpose.answer, 'no');
});

const crit = (answers, complete = true) => ({ complete, missing: complete ? [] : ['top'], answers: Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, { answer: a }])) });

test('combine: a failing predicate fails whatever the critic says', () => {
  const r = combine(crit({ purpose: 'yes', rests: 'yes', pose: 'yes', workZone: 'yes' }), [{ id: 'meshClash', ok: false }]);
  assert.equal(r.verdict, 'fail');
  assert.deepEqual(r.failed, ['meshClash']);
});

test('combine: the critic never outvotes a passing predicate on the same thing', () => {
  const both = [{ id: 'propFloating', ok: true }, { id: 'propInside', ok: true }];
  const r = combine(crit({ purpose: 'yes', rests: 'no', pose: 'yes', workZone: 'yes' }), both);
  assert.equal(r.verdict, 'pass');
  assert.deepEqual(r.overruled, ['rests']);
  // Only part of what the question asks was measured: a person looks.
  const half = combine(crit({ purpose: 'yes', rests: 'no', pose: 'yes', workZone: 'yes' }), [{ id: 'propFloating', ok: true }, { id: 'meshClash', ok: true }]);
  assert.equal(half.verdict, 'review');
  assert.deepEqual(half.flags, ['rests']);
  // No predicate measures pose: its no is a review, never a fail, and no passing check overrules it.
  const pose = combine(crit({ purpose: 'yes', rests: 'yes', pose: 'no', workZone: 'yes' }), [...both, { id: 'meshClash', ok: true }]);
  assert.equal(pose.verdict, 'review');
  assert.deepEqual(pose.flags, ['pose']);
  assert.equal(combine(crit({ purpose: 'no', rests: 'yes', pose: 'yes', workZone: 'yes' }), both).verdict, 'review');
});

test('buildNames: a view suffix is a view only beside its build', () => {
  assert.deepEqual(buildNames(['desk.png', 'desk-back.png', 'desk-top.png', 'bench-back.png', 'bench-back-back.png', 'notes.txt']), ['bench-back', 'desk']);
});

test('combine: all yes and all predicates passing is a pass; unanswered or incomplete is a review', () => {
  assert.equal(combine(crit({ purpose: 'yes', rests: 'yes', pose: 'yes', workZone: 'yes' }), [{ id: 'meshClash', ok: true }]).verdict, 'pass');
  assert.deepEqual(combine(crit({ purpose: null, rests: 'yes', pose: 'yes', workZone: 'yes' })).unanswered, ['purpose']);
  assert.equal(combine(crit({}, false)).verdict, 'review');
});

const ROUND1 = `# Premades review round 1 (owner, 2026-10-30): 163 Keep, 36 Fix, 5 Drop

## Drop
tables-harvest, workstation-bay-drawer-desk

## Fix, with owner note
- structure-screen-divider: "Plant it out."

## Fix, gate failures (rerun2 queue)
tables-pedestal-desk tables-work

## Fix, gates pass, no note (my read from stills)
- floor props: storage-tower-corner/-slim/-spice (driver stand on floor), field-mast-tower (cable on floor)
- odd placement: storage-organizer-ring-bay (lone upright driver, open centre), field-solder-kit (meter
  overhangs)
`;

test('ownerVerdicts reads round 1 markdown, shorthand included, and round 2 picks', () => {
  const v = ownerVerdicts({ round1: ROUND1, round2: { picks: { 'tables-work': { v: 'fix', note: 'Coffee cup is on its side.' }, 'tables-bar-high': { v: 'yes' } } } });
  const r1 = v.round1;
  assert.equal(r1.get('tables-harvest').verdict, 'drop');
  assert.equal(r1.get('structure-screen-divider').note, 'Plant it out.');
  assert.equal(r1.get('tables-work').verdict, 'fix');
  for (const n of ['storage-tower-corner', 'storage-tower-slim', 'storage-tower-spice', 'field-mast-tower', 'storage-organizer-ring-bay', 'field-solder-kit']) assert.ok(r1.has(n), n);
  assert.equal(r1.get('storage-tower-slim').note, 'storage-tower-corner/-slim/-spice (driver stand on floor), field-mast-tower (cable on floor)');
  assert.ok(!r1.has('floor'));
  assert.equal(v.round2.get('tables-bar-high').verdict, 'keep');
  assert.equal(v.round2.get('tables-work').verdict, 'fix');
});

test('implicated maps an owner note or chip to the question it is about', () => {
  assert.deepEqual(implicated({ note: 'Coffee cup is on its side.' }), ['pose']);
  assert.deepEqual(implicated({ note: 'Not enough props. Fill the bins with appropriate props.' }), ['purpose']);
  assert.deepEqual(implicated({ note: null, chips: ['gate_failure'] }), []);
  assert.deepEqual(implicated({ note: 'Screwdriver is upside down and standing up.', chips: ['invisible_in_bin'] }), ['pose', 'purpose']);
});

test('calibrate counts agreement with the owner, per build and per question', () => {
  const verdicts = new Map([
    ['a', { verdict: 'fix', note: 'Coffee cup is on its side.' }],
    ['b', { verdict: 'keep' }],
    ['c', { verdict: 'fix', note: 'Not enough props.' }],
    ['d', { verdict: 'keep' }],
  ]);
  const res = (name, answers, complete = true) => ({ name, ...crit(answers, complete) });
  const c = calibrate([
    res('a', { purpose: 'yes', rests: 'yes', pose: 'no', workZone: 'yes' }),
    res('b', { purpose: 'yes', rests: 'yes', pose: 'yes', workZone: 'yes' }),
    res('c', { purpose: 'yes', rests: 'yes', pose: 'yes', workZone: 'yes' }),
    res('d', { purpose: 'no', rests: 'yes', pose: 'yes', workZone: 'yes' }),
    res('e', { purpose: 'no' }),
    res('a2', {}, false),
  ], verdicts);
  assert.equal(c.n, 4);
  assert.equal(c.agreement, 0.5);
  assert.deepEqual([c.fixFlagged, c.fixMissed, c.keepFlagged, c.keepPassed], [1, 1, 1, 1]);
  assert.deepEqual(c.perQuestion.pose, { implicated: 1, caught: 1, noOnKeep: 0 });
  assert.deepEqual(c.perQuestion.purpose, { implicated: 1, caught: 0, noOnKeep: 1 });
  assert.equal(c.recallOnly, false);
  assert.equal(c.recall, 0.5);
  assert.deepEqual(c.disagreements.map((d) => d.name), ['c', 'd']);
});

test('calibrate: a round that lists no keeps gives recall, never agreement', () => {
  const verdicts = new Map([['a', { verdict: 'fix', note: 'x' }], ['b', { verdict: 'drop', note: 'y' }]]);
  const allNo = ['a', 'b'].map((name) => ({ name, ...crit({ purpose: 'no', rests: 'no', pose: 'no', workZone: 'no' }) }));
  const c = calibrate(allNo, verdicts);
  assert.equal(c.recallOnly, true);
  assert.equal(c.agreement, null);
  assert.equal(c.recall, 1);
});

test('claudeJudge sends every view as an image and parses the answer', async () => {
  let sent;
  const client = { messages: { create: async (p) => ((sent = p), { content: [{ type: 'text', text: 'No. The mug floats.' }], usage: { input_tokens: 9 } }) } };
  let usage;
  const judge = claudeJudge({ client, readImage: (p) => `b64:${p}`, onUsage: (u) => (usage = u) });
  const r = await judge({ name: 'desk', question: 'Q?', images: [{ view: 'threeQuarter', path: 'a.png' }, { view: 'top', path: 'c.png' }] });
  assert.equal(r.answer, 'no');
  assert.equal(sent.model, 'claude-haiku-5-5');
  assert.deepEqual(sent.messages[0].content.filter((b) => b.type === 'image').map((b) => b.source.data), ['b64:a.png', 'b64:c.png']);
  assert.equal(usage.input_tokens, 9);
});
