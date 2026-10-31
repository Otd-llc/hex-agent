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
for (const o of json.ops) {
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
  values: json.values,
  valueOf: valueFields(),
  placeableFamilies: json.families.filter((f) => f.placeable).map((f) => f.family),
};
