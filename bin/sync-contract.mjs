// Copy the configurator's public contract (hex-api-public.json) into
// contract/, so the agent's op table, value lists and ref kinds follow the API
// it runs against. Run it whenever the API changes:
//   node bin/sync-contract.mjs [path-or-url]
// Default source: the local feat/catalog-premades worktree.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2] ?? 'C:/zzz/bs-premades/src/hex/api/public/hex-api-public.json';
const text = /^https?:/.test(src) ? await (await fetch(src)).text() : readFileSync(src, 'utf8');
const json = JSON.parse(text);
if (!json.hash || !Array.isArray(json.ops)) throw new Error(`${src} is not a hexAPI contract`);
const out = 'contract/hex-api-public.json';
let before = null;
try {
  before = JSON.parse(readFileSync(out, 'utf8')).hash;
} catch {}
writeFileSync(out, JSON.stringify(json, null, 2) + '\n');
console.log(`${out}: ${before ? before.slice(0, 8) : 'none'} -> ${json.hash.slice(0, 8)} (${json.ops.length} ops)`);
