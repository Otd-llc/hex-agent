// Disposable: theme button, bins beside a spike, prop sizes, drawers on
// stacked half bases.
import { builder, cell } from './lib.mjs';

const b = await builder();
const log = console.log;
try {
  const names = await b.hex.page.evaluate(() => [...document.querySelectorAll('button')].map((x) => x.getAttribute('aria-label') || x.title || x.textContent.trim()).filter(Boolean).slice(0, 20));
  log('buttons:', JSON.stringify(names));
  await b.place([cell(1, 0), cell(0, 1)]);
  await b.fillOffers({ family: 'spike', type: 'mount' }, () => true, { max: 1 });
  const bins = await b.offers({ family: 'bin' });
  log('bin offers beside spike:', bins.length, [...new Set(bins.map((o) => o.op.stem))].slice(0, 8).join(' '));
  const props = await b.hex.call('listProps');
  log('drone/desk/tools props:', props.filter((p) => ['drone', 'desk', 'tools', 'kitchen'].includes(p.kind)).map((p) => `${p.id}(${p.kind},${p.longMm}mm)`).join(' '));
  // fresh layout for drawers on stacked halves
  await b.hex.call('load', { pieces: [{ q: 0, r: 0, level: 0, variant: 'half-n' }, { q: 1, r: 0, level: 0, variant: 'half-n' }, { q: 0, r: -1, level: 0, variant: 'full' }, { q: 1, r: -1, level: 0, variant: 'full' }] });
  log('drawer offers L0:', JSON.stringify((await b.offers({ family: 'drawer' })).map((o) => o.op)));
  await b.place([{ ...cell(0, 0, 1), variant: 'half-n' }, { ...cell(1, 0, 1), variant: 'half-n' }, cell(0, -1, 1), cell(1, -1, 1)]);
  log('drawer offers after L1:', JSON.stringify((await b.offers({ family: 'drawer' })).map((o) => o.op)));
  log('drawer offers storeys 2:', JSON.stringify((await b.offers({ family: 'drawer', storeys: 2 })).map((o) => o.op)).slice(0, 300));
} finally {
  await b.close();
}
