// The configurator's public contract (contract/hex-api-public.json, copied by
// bin/sync-contract.mjs), read once: the op table, the value lists, and what
// each field's type allows. The agent's checks follow the API from here, so a
// new op or field reaches the model by syncing the contract, not by hand.
import { readFileSync } from 'node:fs';

const json = JSON.parse(readFileSync(new URL('../contract/hex-api-public.json', import.meta.url), 'utf8'));

// "'rim' | 'dividers'" -> ['rim', 'dividers']; null when any member is not a quoted literal.
const literals = (type) => {
  const parts = type.split('|').map((s) => s.trim());
  const lits = parts.filter((p) => /^'[^']*'$/.test(p)).map((p) => p.slice(1, -1));
  return { all: lits.length === parts.length, lits };
};

// "{ readonly x: number; readonly z: number }" -> [{ name, optional, type }]
const members = (type) =>
  type
    .replace(/^\{|\}$/g, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(?:readonly\s+)?(\w+)(\??):\s*(.+)$/);
      return m && { name: m[1], optional: m[2] === '?', type: m[3].trim() };
    })
    .filter(Boolean);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// One check per field type, or null when the type is checked elsewhere (cells,
// sites, refs, value lists) or is a plain string the configurator judges.
export function checkerFor(type) {
  if (type === 'number') return [isNum, 'a number'];
  if (type === 'boolean') return [(v) => typeof v === 'boolean', 'true or false'];
  const { all, lits } = literals(type);
  if (all && lits.length) return [(v) => lits.includes(v), `one of ${lits.join(', ')}`];
  if (type.startsWith('{')) {
    const ms = members(type);
    const says = `an object {${ms.map((m) => `${m.name}${m.optional ? '?' : ''}`).join(', ')}}`;
    const ok = (v) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
      if (Object.keys(v).some((k) => !ms.some((m) => m.name === k))) return false;
      return ms.every((m) => {
        if (!(m.name in v)) return m.optional;
        const x = v[m.name];
        // A member typed "'x' | 'z' | number" takes either.
        if (/\bnumber\b/.test(m.type) && isNum(x)) return true;
        if (m.type === 'boolean') return typeof x === 'boolean';
        return literals(m.type).lits.includes(x);
      });
    };
    return [ok, says];
  }
  return null;
}

// Which refs a field takes: node refs, prop refs, and any literal ('bench').
export function refKinds(type) {
  if (!/\b(NodeRef|PropRef)\b/.test(type)) return null;
  return { node: /\bNodeRef\b/.test(type), prop: /\bPropRef\b/.test(type), literals: literals(type).lits };
}

const opFields = {};
const fieldTypes = {};
// The cross-field rules of each op (A77): xor (not both), requires (the first
// needs the second), differs (two fields name different things), forbids.
const constraints = {};
for (const o of json.ops) {
  constraints[o.op] = o.constraints ?? [];
  opFields[o.op] = [o.fields.filter((f) => !f.optional).map((f) => f.name), o.fields.filter((f) => f.optional).map((f) => f.name)];
  fieldTypes[o.op] = Object.fromEntries(o.fields.map((f) => [f.name, f.type]));
}

// Which value list governs which field, read from the contract (A86): a field
// typed Variant takes values.variant; a plain string field whose says names
// "values.coverType" takes that list. Keys are "op.field".
export function valueFields(c = json) {
  const of = (f) => (f.type === 'Variant' ? 'variant' : f.says?.match(/\bvalues\.(\w+)/)?.[1] ?? null);
  const out = {};
  for (const o of c.ops) {
    for (const f of o.fields) {
      const list = of(f);
      if (list && c.values[list]) out[`${o.op}.${f.name}`] = list;
    }
  }
  return out;
}

export const CONTRACT = {
  hash: json.hash,
  apiVersion: json.apiVersion,
  opFields,
  fieldTypes,
  constraints,
  values: json.values,
  valueOf: valueFields(),
  placeableFamilies: json.families.filter((f) => f.placeable).map((f) => f.family),
};

// The contract the target page serves, to hold the vendored copy against (a
// smoke against a page on another contract proves nothing). The configurator
// ships no contract file, so, in order: HEX_CONTRACT (a path or URL: a pinned
// build's hex-api-public.json); a local dev server's source copy; for the live
// site, the stamp on the published docs (academy /hex/api, 12 hex digits),
// which the deploy runbook keeps in step with the configurator.
export const DOCS_URL = 'https://academy.onethousanddrones.com/hex/api';
const LIVE_HOST = 'hex.onethousanddrones.com';

export async function servedContract(pageUrl, { env = process.env, fetchText = defaultFetch, readText = defaultRead } = {}) {
  const fromJson = (text, source) => {
    const hash = JSON.parse(text).hash;
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) throw new Error(`${source} has no contract hash`);
    return { hash, source };
  };
  const spec = env.HEX_CONTRACT;
  if (spec) return fromJson(/^https?:/.test(spec) ? await fetchText(spec) : await readText(spec), spec);
  const url = new URL(pageUrl);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    const src = `${url.origin}/src/hex/api/public/hex-api-public.json`;
    try {
      return fromJson(await fetchText(src), src);
    } catch (e) {
      return { hash: null, source: src, why: `${e.message}; a built page serves no contract: set HEX_CONTRACT to its hex-api-public.json` };
    }
  }
  if (url.hostname === LIVE_HOST) {
    const html = await fetchText(DOCS_URL);
    // React may split the text node: "contract <!-- -->69c3c65be827".
    const m = html.match(/contract\s*(?:<!--\s*-->)?\s*([0-9a-f]{12})\b/i);
    if (!m) return { hash: null, source: DOCS_URL, why: 'no contract stamp on the docs page' };
    return { prefix: m[1].toLowerCase(), source: DOCS_URL };
  }
  return { hash: null, source: pageUrl, why: 'unknown host: set HEX_CONTRACT to the hex-api-public.json it serves' };
}

// Same contract, or why not. A docs stamp is a 12-digit prefix of the hash.
export function contractMatches(vendored, served) {
  if (served.hash) return served.hash === vendored ? { ok: true } : { ok: false, why: `page ${served.hash.slice(0, 8)} != vendored ${vendored.slice(0, 8)}` };
  if (served.prefix) return vendored.startsWith(served.prefix) ? { ok: true } : { ok: false, why: `page ${served.prefix.slice(0, 8)} != vendored ${vendored.slice(0, 8)}` };
  return { ok: false, why: `cannot read the page's contract (${served.why})` };
}

async function defaultFetch(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.text();
}

const defaultRead = (path) => readFileSync(path, 'utf8');
