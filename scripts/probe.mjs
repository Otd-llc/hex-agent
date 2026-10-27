// Read-only probe of the live configurator: version, members, catalog and
// socket shapes. Changes nothing. Writes a summary to runs/probe-<ts>.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { openHex } from '../src/bridge.mjs';

const hex = await openHex();
try {
  const members = await hex.page.evaluate(() => Object.keys(window.hexAPI).sort());
  const state = await hex.call('getState');
  const parts = await hex.call('listParts');
  const props = await hex.call('listProps');
  const families = {};
  for (const p of parts) (families[p.family] ??= []).push(p.value);
  const sockets = {};
  for (const family of ['piece', 'bin', 'drawer', 'handle', 'cover', 'spike', 'cap']) {
    const s = await hex.call('openSockets', { family });
    sockets[family] = { count: s.length, sample: s.slice(0, 2) };
  }
  const validation = await hex.call('validate');
  const bom = await hex.call('bom');
  const out = {
    at: new Date().toISOString(),
    version: hex.version,
    members,
    startNodes: state.nodes.length,
    startNodeFamilies: [...new Set(state.nodes.map((n) => n.family))],
    pieces: state.state.pieces,
    partsCount: parts.length,
    families: Object.fromEntries(Object.entries(families).map(([k, v]) => [k, { n: v.length, values: v.slice(0, 12) }])),
    sampleParts: parts.slice(0, 3),
    propsCount: props.length,
    sockets,
    validation: { ok: validation.ok, meshClash: validation.meshClash, codes: validation.issues.map((i) => i.code) },
    bom: { lines: bom.lines.length, printedInstances: bom.printedInstances, maxPackInstances: bom.maxPackInstances, pack: bom.pack },
  };
  mkdirSync('runs', { recursive: true });
  writeFileSync(`runs/probe-${Date.now()}.json`, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
} finally {
  await hex.close();
}
