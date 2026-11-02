import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from '../src/env.mjs';

const envFile = (text) => {
  const p = join(mkdtempSync(join(tmpdir(), 'env-')), '.env');
  writeFileSync(p, text);
  return p;
};

test('loadEnv: an empty template line does not block a filled line below it', () => {
  delete process.env.ENV_TEST_KEY;
  loadEnv(envFile('# template\nENV_TEST_KEY=\nENV_TEST_KEY=abc123\n'));
  assert.equal(process.env.ENV_TEST_KEY, 'abc123');
  delete process.env.ENV_TEST_KEY;
});

test('loadEnv: the shell environment still wins over the file', () => {
  process.env.ENV_TEST_KEY = 'from-shell';
  loadEnv(envFile('ENV_TEST_KEY=from-file\n'));
  assert.equal(process.env.ENV_TEST_KEY, 'from-shell');
  delete process.env.ENV_TEST_KEY;
});

test('loadEnv: a byte order mark does not hide the first line', () => {
  delete process.env.ENV_TEST_BOM;
  loadEnv(envFile('﻿ENV_TEST_BOM=yes\n'));
  assert.equal(process.env.ENV_TEST_BOM, 'yes');
  delete process.env.ENV_TEST_BOM;
});
