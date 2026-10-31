// Drive the compound helpers (A85) against a real configurator, no model:
// the spool rack (hang_spools, fill_compartments), a two-cover deck (dress a
// magazine across it) and a planter (fill_and_plant). HEX_URL picks the page.
//   HEX_URL=http://127.0.0.1:5310/hex.html node bin/smoke-helpers.mjs
import { readFileSync } from 'node:fs';
import { openHex, hexUrl } from '../src/bridge.mjs';
import { createTools } from '../src/tools.mjs';
import { CONTRACT } from '../src/contract.mjs';

const results = [];
const check = (name, pass, r) => {
  results.push(pass);
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${pass ? '' : `  ${JSON.stringify(r).slice(0, 600)}`}`);
};
const clean = (r) => !r.error && r.refused === 0 && r.flagged.length === 0;

console.log(`${hexUrl()}  contract ${CONTRACT.hash.slice(0, 8)}`);
let hex = await openHex({ headless: true });
try {
  // The spool rack, parts only.
  await hex.call('load', JSON.parse(readFileSync('evals/starts/storage-spool-rack-4.json', 'utf8')).state);
  await hex.call('settle');
  let t = createTools(hex);
  let r = await t.run('hang_spools', {});
  check(`hang_spools: ${r.placed} hung`, clean(r) && r.placed === 4, r);
  r = await t.run('hang_spools', {});
  check(`hang_spools again: ${r.placed} hung, ${r.refused} refused`, !r.error && r.placed === 0, r);
  const bins = (await t.run('get_build', {})).nodes.filter((n) => n.family === 'bin' && n.at.level === 2).map((n) => n.ref);
  r = await t.run('fill_compartments', { parts: bins.slice(0, 2), props: ['heap-screws-div3', 'heap-nuts-div3', 'heap-standoffs-div3'] });
  check(`fill_compartments ${bins.length ? bins.slice(0, 2).join(' ') : '(no top bins)'}: ${r.placed} placed, ${r.refused} refused, flagged ${r.flagged?.map((f) => f.code)}`, !r.error && r.placed > 0, r);
  const c = await t.run('check_build', {});
  check(`check_build: meshClash ${c.meshClash}, props ${JSON.stringify(c.props?.map((p) => p.code) ?? [])}`, c.meshClash === 'clear', c);
  await hex.page.screenshot({ path: 'scratch/smoke-spool-rack.png' });
  await hex.close();

  // A deck on the starter: a second base, a cover on each, a magazine across.
  hex = await openHex({ headless: true });
  t = createTools(hex);
  r = await t.run('apply', { ops: [
    { op: 'place', at: { q: -1, r: 0, level: 0 }, variant: 'full' },
    { op: 'addCover', at: { q: -1, r: 0, level: 0 }, variant: 'full', face: 'top' },
    { op: 'addCover', at: { q: 0, r: 0, level: 0 }, variant: 'full', face: 'top' },
  ] });
  check('two covered bases', !r.rolledBack, r);
  const s = await t.run('find_surfaces', { fits: 'magazine' });
  const deck = s.surfaces.find((f) => f.deckOf);
  check(`deck for a magazine: ${deck?.label}`, Boolean(deck), s);
  r = await t.run('dress', { props: [{ id: 'magazine', surface: deck.surface }, { id: 'mug', on: 'bench' }] });
  check(`dress magazine + mug: ${r.placed} placed, flagged ${JSON.stringify(r.flagged?.map((f) => f.code))}`, clean(r) && r.placed === 2, r);
  const cup = (await t.run('get_build', {})).props.find((p) => p.id === 'mug').ref;
  r = await t.run('dress', { props: [{ id: 'pencil', in: cup, pose: 'stand' }] });
  check(`pencil standing in the mug: ${r.placed} placed, flagged ${JSON.stringify(r.flagged?.map((f) => `${f.code} ${f.prop?.split('@')[0]}`))}`, !r.error && r.placed === 1, r);
  await hex.page.screenshot({ path: 'scratch/smoke-deck.png' });
  await hex.close();

  // A planter: two bins on the starter and a new base.
  hex = await openHex({ headless: true });
  t = createTools(hex);
  r = await t.run('apply', { ops: [
    { op: 'place', at: { q: -1, r: 0, level: 0 }, variant: 'full' },
    { op: 'addBin', at: { q: -1, r: 0, level: 0 }, stem: 'hex-bin-full' },
    { op: 'addBin', at: { q: 0, r: 0, level: 0 }, stem: 'hex-bin-full' },
  ] });
  check('two bins', !r.rolledBack, r);
  const two = (await t.run('get_build', {})).nodes.filter((n) => n.family === 'bin').map((n) => n.ref);
  r = await t.run('fill_and_plant', { beds: [{ part: two[0], plant: 'basil-young' }, { part: two[1], plant: 'thyme-young' }] });
  check(`fill_and_plant: ${r.placed} ops ok, flagged ${JSON.stringify(r.flagged?.map((f) => f.code))}`, clean(r) && r.placed === 4, r);
  await hex.page.screenshot({ path: 'scratch/smoke-planter.png' });
} finally {
  await hex.close();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
