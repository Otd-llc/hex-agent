// Disposable: tall fused bases, the bins they take, notch and bay planter
// offers around a tight cluster.
import { builder, cell } from './lib.mjs';

const b = await builder();
const log = console.log;
try {
  await b.apply([{ op: 'place', at: cell(1, 0), variant: 'full', storeys: 3 }, { op: 'place', at: cell(0, 1), variant: 'full', storeys: 2 }], 'tall bases');
  const s = await b.state();
  log('nodes:', JSON.stringify(s.nodes.map((n) => [n.family, n.ref])));
  for (const q of [{ family: 'bin' }, { family: 'bin', level: 2 }, { family: 'bin', storeys: 3 }, { family: 'bin', level: 1 }]) {
    const o = await b.offers(q);
    log('bin offers', JSON.stringify(q), o.length, [...new Set(o.map((x) => `${x.at.q},${x.at.r},${x.at.level}:${x.op.stem}`))].filter((x) => x.includes('drain')).slice(0, 8).join(' '));
  }
  const notch = await b.offers({ family: 'notch' });
  log('notch offers', notch.length, [...new Set(notch.map((x) => x.op.stem))].filter((x) => x.includes('drain')).slice(0, 8).join(' '));
  log('notch sample', JSON.stringify(notch.find((x) => x.op.stem.includes('drain'))?.op));
  await b.place([cell(1, 1)]);
  const bay = await b.offers({ family: 'bay' });
  log('bay offers', bay.length, [...new Set(bay.map((x) => x.op.stem))].filter((x) => x.includes('drain')).slice(0, 6).join(' '));
  const parts = await b.hex.call('listParts');
  log('tall drain bins:', parts.filter((p) => p.family === 'bin' && /full-drain(-x[23])?$/.test(p.value)).map((p) => p.value).join(' '));
} finally {
  await b.close();
}
