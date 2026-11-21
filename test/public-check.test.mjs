// scripts/public-check.mjs: its matcher finds each pattern, passes clean text, and the script
// (which a branch adds) holds none of its own patterns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PATTERNS, findings } from '../scripts/public-check.mjs';

test('public-check: each pattern is found on its line, clean text passes, the script holds none', () => {
  assert.equal(PATTERNS.length, 11);
  PATTERNS.forEach((p) => {
    const f = findings(`clean\nsome ${p} here`);
    assert.ok(f.some((x) => x.pattern === p && x.line === 2), p);
  });
  assert.deepEqual(findings('make_part posts a recipe to the part service at HEX_PART_SERVICE\nhttp://127.0.0.1:5190'), []);
  assert.deepEqual(findings(readFileSync(new URL('../scripts/public-check.mjs', import.meta.url), 'utf8')), []);
  assert.deepEqual(findings(readFileSync(new URL('./public-check.test.mjs', import.meta.url), 'utf8')), []);
});
