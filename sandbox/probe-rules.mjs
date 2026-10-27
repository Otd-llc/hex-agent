// Disposable probe: how storeys stack, what caps/covers/bolts look like on a
// small cluster, and how soil and plants go in. Prints offers and outcomes.
import { builder, cell, hexagon } from './lib.mjs';

const b = await builder();
const log = console.log;
try {
  await b.place(hexagon(1).filter((c) => !(c.q === 0 && c.r === 0)));
  log('level-1 piece offers:', (await b.offers({ family: 'piece', level: 1 })).length);
  log('snap offers:', (await b.offers({ family: 'snap' })).slice(0, 2).map((o) => JSON.stringify(o.op)));
  log('riser offers:', (await b.offers({ family: 'riser' })).length);
  await b.apply([{ op: 'place', at: cell(0, 0, 1), variant: 'full' }], 'place on top directly');
  await b.fillOffers({ family: 'snap' }, () => true, { max: 3, label: 'snaps' });
  log('level-1 piece offers after snaps:', (await b.offers({ family: 'piece', level: 1 })).map((o) => JSON.stringify(o.at)).slice(0, 5));
  await b.apply([{ op: 'place', at: cell(0, 0, 0), variant: 'full', storeys: 2 }], 'tall base at centre');
  const s = await b.state();
  log('nodes:', s.nodes.length, [...new Set(s.nodes.map((n) => n.family))].join(','));
  log('jointBolt offers:', (await b.offers({ family: 'jointBolt' })).length);
  log('cap offers:', (await b.offers({ family: 'cap' })).length, 'cover offers:', (await b.offers({ family: 'cover' })).length);
  const props = await b.hex.call('listProps');
  log('props:', props.length, 'plants:', props.filter((p) => p.plant).slice(0, 6).map((p) => `${p.id}(${p.kind},${p.stage})`).join(' '));
  log('pots:', props.filter((p) => p.pot).slice(0, 4).map((p) => p.id).join(' '));
  log('kinds:', [...new Set(props.map((p) => p.kind))].join(','));
  const v = await b.validate();
  log('validate', v.ok, JSON.stringify(v.meshClash), v.issues.map((i) => i.code).join(','));
} finally {
  await b.close();
}
