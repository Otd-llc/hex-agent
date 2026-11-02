import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baselineOf, tripped } from '../src/tripwires.mjs';

const row = (id, pass, o = {}) => ({ id, pass, costUsd: 0.05, refusals: {}, ...o });
const base = baselineOf([{ rows: [row('a', true), row('a', true), row('b', false), row('c', true, { refusals: { PROP_NO_REST: 1 } }), row('x', false, { budget: 'refused' })] }]);

test('baseline: pass rate per brief, cost per scored run, every refusal code seen', () => {
  assert.deepEqual(base.rate, { a: 1, b: 0, c: 1 });
  assert.equal(base.costPerRun, 0.05);
  assert.deepEqual([...base.codes], ['PROP_NO_REST']);
});

test('tripwires: quiet on a healthy batch', () => {
  assert.equal(tripped([row('a', true), row('b', false), row('c', true, { refusals: { PROP_NO_REST: 2 } })], base), null);
});

test('tripwires: harness share needs 2+ and over 5%; budget cuts are not counted', () => {
  const ok = Array.from({ length: 30 }, () => row('a', true));
  assert.equal(tripped([...ok, row('a', false, { error: 'page.goto: Timeout' })], base), null);
  assert.match(tripped([...ok, row('a', false, { error: 'x' }), row('a', false, { error: 'y' })], base), /^harness: 2 of 32/);
  assert.equal(tripped([row('a', true), row('a', false, { error: 'no eval budget left', budget: 'refused' }), row('a', false, { error: 'no eval budget left', budget: 'refused' })], base), null);
});

test('tripwires: a regression must be past 20 points and unlikely by chance', async () => {
  const { binomCdf } = await import('../src/tripwires.mjs');
  assert.ok(Math.abs(binomCdf(2, 5, 0.9) - 0.00856) < 1e-4);
  assert.equal(tripped([row('a', false), row('a', true)], base), null, 'two runs are not enough');
  assert.equal(tripped([row('a', false), row('a', true), row('a', true)], base), null, 'one fail in three is noise');
  assert.match(tripped(Array.from({ length: 6 }, () => row('a', false)), base), /^regression: a 0% over 6 runs/);
  assert.equal(tripped([row('b', false), row('b', false), row('b', false)], base), null, 'never passed, no regression');
});

test('tripwires: cost per run drifting over 30% after 10 runs', () => {
  assert.equal(tripped(Array.from({ length: 9 }, () => row('a', true, { costUsd: 0.2 })), base), null);
  assert.match(tripped(Array.from({ length: 10 }, () => row('a', true, { costUsd: 0.07 })), base), /^cost: \$0\.0700/);
});

test('tripwires: a refusal code no checkpoint run saw, in 3+ runs', () => {
  const clash = () => row('a', true, { refusals: { SPIKE_CLASH: 1 } });
  assert.equal(tripped([clash(), clash()], base), null, 'a rare code twice is not a trip');
  assert.match(tripped([clash(), clash(), clash()], base), /^refusal: SPIKE_CLASH \(3 runs\)/);
});
