// Disposable: prop library by kind, and the pot workflow (pot on a cover,
// fill it, plant it).
import { builder, cell } from './lib.mjs';

const b = await builder();
const log = console.log;
try {
  const props = await b.hex.call('listProps');
  const byKind = {};
  for (const p of props) (byKind[p.kind] ??= []).push(`${p.id}${p.stage ? '/' + p.stage[0] : ''}(${Math.round(p.longMm)})`);
  for (const [k, v] of Object.entries(byKind)) log(k.padEnd(11), v.join(' '));
  await b.apply([{ op: 'addCover', at: cell(0, 0), variant: 'full', face: 'top' }], 'cover');
  const cover = (await b.state()).nodes.find((n) => n.family === 'cover');
  const r1 = await b.hex.call('apply', { op: 'addProp', id: 'pot-m', on: cover.ref });
  log('pot on cover:', r1.ok ? 'ok ' + JSON.stringify(r1.added) : r1.code + ' ' + r1.message);
  if (r1.ok) {
    const pot = r1.added[0];
    const r2 = await b.hex.call('apply', { op: 'fillPot', ref: pot });
    log('fill pot:', r2.ok ? 'ok ' + JSON.stringify(r2.added) : r2.code + ' ' + r2.message);
    const potRef = r2.ok ? r2.added[0] : pot;
    const plant = props.find((p) => p.plant && p.kind === 'flowers')?.id;
    const r3 = await b.hex.call('apply', { op: 'plant', id: plant, in: potRef });
    log('plant', plant, ':', r3.ok ? 'ok' : r3.code + ' ' + r3.message);
  }
  const r4 = await b.hex.call('apply', { op: 'addProp', id: 'laptop-open', on: 'bench', atMm: { x: 0, z: 300 } });
  log('laptop on bench:', r4.ok ? 'ok' : r4.code + ' ' + r4.message);
  log('staging:', JSON.stringify((await b.state()).staging.props.map((p) => [p.id, p.posMm.map(Math.round), p.pot])));
} finally {
  await b.close();
}
