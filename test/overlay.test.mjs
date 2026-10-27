import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linesFor } from '../src/overlay.mjs';

test('model turns read as plain moves', () => {
  const l = linesFor({ type: 'model', text: '', calls: [
    { name: 'find_sockets', arguments: '{"family":"spike","type":"stud","facing":"down"}' },
    { name: 'apply', arguments: '{"ops":[{"socket":"s1"},{"socket":"s2"}]}' },
    { name: 'finish', arguments: '{"requirements":[{"status":"met"},{"status":"unmet"}]}' },
  ] });
  assert.deepEqual(l.map((x) => x.text), ['asks where a spike fits (stud, down)', 'applies 2 ops', 'finishes: met, unmet']);
  assert.ok(l.every((x) => x.layer === 'model'));
});

test('configurator outcomes keep their codes, and a rollback is said out loud', () => {
  const l = linesFor({ type: 'apply', rolledBack: true, outcomes: [
    { ok: true, op: { op: 'addDrawer' }, warnings: [] },
    { ok: false, op: { op: 'addSpike' }, code: 'SPIKE_CLASH', message: 'a drawer fills this corner' },
  ] });
  assert.deepEqual(l.map((x) => [x.layer, x.tone]), [['hex', 'ok'], ['hex', 'refused'], ['hex', 'refused']]);
  assert.match(l[1].text, /SPIKE_CLASH/);
  assert.match(l[2].text, /taken back/);
});

test('a mesh clash in check_build is not shown as ok', () => {
  const [l] = linesFor({ type: 'tool', name: 'check_build', result: { ok: true, meshClash: { a: 'x', b: 'y', depthMm: 1.2, limitMm: 0.3 } } });
  assert.equal(l.tone, 'refused');
  assert.match(l.text, /clash 1.2 mm/);
});
