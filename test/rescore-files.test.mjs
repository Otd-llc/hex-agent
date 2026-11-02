import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rescoreFiles, loadRuns } from '../src/runkey.mjs';

const suite = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'rescore-'));
  writeFileSync(join(dir, 'summary.json'), JSON.stringify({ provider: 'baseten', model: 'm', rows: [{ id: 'b', attempt: 1, pass: true }] }));
  for (const [name, at, after] of files) writeFileSync(join(dir, name), JSON.stringify({ rescoredAt: at, graderCommit: name, rows: [{ id: 'b', attempt: 1, after }] }));
  return dir;
};

test('rescoreFiles: newest by rescoredAt first, legacy rescore.json kept as an earlier vintage', () => {
  const dir = suite([['rescore.json', '2026-11-01T21:00:00Z', false], ['rescore-aaaaaaa.json', '2026-11-02T09:00:00Z', true], ['rescore-bbbbbbb.json', '2026-11-02T08:00:00Z', false]]);
  assert.deepEqual(rescoreFiles(dir).map((f) => f.file), ['rescore-aaaaaaa.json', 'rescore-bbbbbbb.json', 'rescore.json']);
});

test('rescoreFiles: none when the suite was never rescored', () => {
  assert.deepEqual(rescoreFiles(suite([])), []);
});

test('loadRuns reads the newest rescore, not the legacy file', () => {
  const dir = suite([['rescore.json', '2026-11-01T21:00:00Z', false], ['rescore-aaaaaaa.json', '2026-11-02T09:00:00Z', true]]);
  assert.equal(loadRuns([dir])[0].row.pass, true);
});
