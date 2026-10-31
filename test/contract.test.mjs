import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT, servedContract, contractMatches, DOCS_URL } from '../src/contract.mjs';

const H = CONTRACT.hash;
const OTHER = 'f'.repeat(64);
const json = (hash) => JSON.stringify({ hash, ops: [] });
const never = () => {
  throw new Error('not called');
};

test('HEX_CONTRACT names the served contract: a path or a URL', async () => {
  const p = await servedContract('http://127.0.0.1:5330/hex.html', { env: { HEX_CONTRACT: 'C:/pin/hex-api-public.json' }, readText: () => json(H), fetchText: never });
  assert.deepEqual(p, { hash: H, source: 'C:/pin/hex-api-public.json' });
  const u = await servedContract('https://hex.onethousanddrones.com/', { env: { HEX_CONTRACT: 'https://x/c.json' }, fetchText: async () => json(OTHER), readText: never });
  assert.equal(u.hash, OTHER);
});

test('a local dev server serves its source copy; a built page says how to name one', async () => {
  let asked;
  const ok = await servedContract('http://127.0.0.1:5310/hex.html', { env: {}, fetchText: async (u) => ((asked = u), json(H)) });
  assert.equal(asked, 'http://127.0.0.1:5310/src/hex/api/public/hex-api-public.json');
  assert.equal(ok.hash, H);
  const built = await servedContract('http://127.0.0.1:5330/', { env: {}, fetchText: async () => '<!doctype html>' });
  assert.equal(built.hash, null);
  assert.match(built.why, /HEX_CONTRACT/);
});

test('the live site is held against the docs stamp, split text node or not', async () => {
  let asked;
  const page = `<p class="font-mono">contract <!-- -->${H.slice(0, 12)}</p><li>${OTHER.slice(0, 8)}</li>`;
  const s = await servedContract('https://hex.onethousanddrones.com/', { env: {}, fetchText: async (u) => ((asked = u), page) });
  assert.equal(asked, DOCS_URL);
  assert.deepEqual(s, { prefix: H.slice(0, 12), source: DOCS_URL });
  const none = await servedContract('https://hex.onethousanddrones.com/', { env: {}, fetchText: async () => '<p>no stamp</p>' });
  assert.equal(none.hash, null);
});

test('an unknown host cannot be checked without HEX_CONTRACT', async () => {
  const s = await servedContract('https://preview.example.com/', { env: {}, fetchText: never });
  assert.equal(s.hash, null);
  assert.match(s.why, /HEX_CONTRACT/);
});

test('contractMatches: same hash or prefix passes; a different one, or none, fails', () => {
  assert.equal(contractMatches(H, { hash: H }).ok, true);
  assert.equal(contractMatches(H, { prefix: H.slice(0, 12) }).ok, true);
  const diff = contractMatches(H, { hash: OTHER });
  assert.equal(diff.ok, false);
  assert.match(diff.why, /ffffffff != /);
  assert.equal(contractMatches(H, { prefix: OTHER.slice(0, 12) }).ok, false);
  assert.match(contractMatches(H, { hash: null, why: 'no stamp' }).why, /cannot read/);
});

test('a served file without a hash is an error, not a pass', async () => {
  await assert.rejects(servedContract('http://x/', { env: { HEX_CONTRACT: 'c.json' }, readText: () => '{"ops":[]}' }), /no contract hash/);
});
