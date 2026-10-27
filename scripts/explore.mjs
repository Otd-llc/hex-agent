// Disposable exploration: load a starter, apply ops from a JSON file, then
// report the socket counts for the given families. Usage:
//   node scripts/explore.mjs ops.json [family,...]
import { readFileSync } from 'node:fs';
import { openHex } from '../src/bridge.mjs';

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const families = (process.argv[3] ?? 'drawer,handle,spike,cover,insert').split(',');
const hex = await openHex();
try {
  if (plan.starter) console.log('load', JSON.stringify(await hex.call('load', plan.starter)));
  for (const step of plan.steps ?? []) {
    if (step.sockets) {
      const s = await hex.call('openSockets', step.sockets);
      console.log('sockets', JSON.stringify(step.sockets), s.length, JSON.stringify(s.slice(0, 3).map((x) => x.op)));
      if (step.applyFirst && s.length) {
        const o = await hex.call('apply', s[0].op);
        console.log('  apply first ->', o.ok ? `ok +${o.added.length} ${o.warnings.map((w) => w.code)}` : `${o.code}: ${o.message}`);
      }
      continue;
    }
    const o = await hex.call('apply', step);
    console.log('apply', JSON.stringify(step), '->', o.ok ? `ok +${o.added.length} ${o.warnings.map((w) => w.code)}` : `${o.code}: ${o.message} alts=${o.validAlternatives.length} ${JSON.stringify(o.validAlternatives.slice(0, 2).map((a) => a.op))}`);
  }
  for (const family of families) {
    const s = await hex.call('openSockets', { family });
    console.log('final sockets', family, s.length, JSON.stringify(s.slice(0, 2).map((x) => x.op)));
  }
  const v = await hex.call('validate');
  console.log('validate', v.ok, JSON.stringify(v.meshClash), v.issues.map((i) => `${i.severity}:${i.code}`).join(' '));
} finally {
  await hex.close();
}
