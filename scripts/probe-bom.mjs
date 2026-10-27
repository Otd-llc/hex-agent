// Disposable: build small examples and print node stems and BOM keys, so the
// eval checks can name parts the way the configurator reports them.
import { openHex } from '../src/bridge.mjs';

const hex = await openHex();
const show = async (label) => {
  const s = await hex.call('getState');
  const b = await hex.call('bom');
  console.log(`== ${label}`);
  console.log(' nodes', JSON.stringify(s.nodes.map((n) => [n.family, n.stem])));
  console.log(' bom', JSON.stringify(b.lines.map((l) => [l.key, l.qty, l.kind])));
};
const first = async (q) => (await hex.call('openSockets', q))[0]?.op;
try {
  await hex.call('load', { pieces: [{ q: 0, r: 0, level: 0, variant: 'full' }, { q: 1, r: 0, level: 0, variant: 'full' }, { q: 0, r: 1, level: 0, variant: 'full' }] });
  let o = await hex.call('apply', await first({ family: 'spike', type: 'stud', facing: 'down' }));
  console.log('stud down', o.ok || o.code);
  await show('stud spike facing down');
  await hex.call('undo');
  o = await hex.call('apply', await first({ family: 'spike' }));
  console.log('solid up', o.ok || o.code);
  const spike = (await hex.call('getState')).nodes.find((n) => n.family === 'spike');
  console.log(' spike node', JSON.stringify(spike));
  const j = (await hex.call('openSockets', { family: 'spike' }));
  o = await hex.call('apply', { op: 'setSpikeAccessory', level: 0, junction: [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 0 }], accessory: 'platform-sm' });
  console.log('platform', o.ok || `${o.code} ${o.message}`);
  await show('solid spike + platform');
  for (const stem of ['hex-acc-hook', 'hex-acc-keyhole', 'hex-port-louvre']) {
    const fam = stem.includes('port') ? 'port' : 'accessory';
    const s = await hex.call('openSockets', { family: fam, stem });
    if (s[0]) console.log(stem, (await hex.call('apply', s[0].op)).ok);
  }
  await show('with accessories and port');
  console.log(' drawer stems sample:', JSON.stringify((await hex.call('listParts')).filter((p) => /drawer|run/.test(p.value)).slice(0, 5).map((p) => p.value)));
} finally {
  await hex.close();
}
