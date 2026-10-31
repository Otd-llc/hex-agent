#!/usr/bin/env node
// Still sheets for the offline critic (A56): each build's share link loaded in
// the configurator, then three views as the critic asks for them, three-quarter
// from the front (az 45), the opposite three-quarter (az 225) and from above
// (polar 10), saved as <name>.png, <name>-back.png and <name>-top.png. No model.
// Needs a page with view() and still() (contract d2fd3dad on).
//   HEX_URL=http://127.0.0.1:5330/hex.html node bin/sheets.mjs --picks=C:/zzz/_premades/picks-round2.json --out=runs/sheets-round2 [--only=a,b] [--max=20]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openHex, hexUrl } from '../src/bridge.mjs';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}`));
  if (!a) return dflt;
  const [, v] = a.split('=');
  return v ?? true;
};
const picks = JSON.parse(readFileSync(flag('picks', 'C:/zzz/_premades/picks-round2.json'), 'utf8')).picks;
const out = flag('out', 'runs/sheets');
const only = flag('only', null)?.split(',');
const max = Number(flag('max', Infinity));
const SHEET_VIEWS = [['', { az: 45, polar: 62 }], ['-back', { az: 225, polar: 62 }], ['-top', { az: 45, polar: 10 }]];

mkdirSync(out, { recursive: true });
const names = Object.keys(picks).filter((n) => picks[n].link && (!only || only.includes(n))).slice(0, max);
console.log(`${hexUrl()}: ${names.length} builds -> ${out}`);
const hex = await openHex({ headless: true });
const failed = [];
try {
  for (const name of names) {
    if (SHEET_VIEWS.every(([suf]) => existsSync(join(out, `${name}${suf}.png`)))) continue;
    try {
      const loaded = await hex.call('load', picks[name].link.split('#')[1]);
      if (!loaded.ok) throw new Error(`${loaded.code} ${loaded.message}`);
      await hex.call('settle');
      for (const [suf, view] of SHEET_VIEWS) {
        const v = await hex.call('view', view);
        if (!v.ok) throw new Error(`view ${JSON.stringify(view)}: ${v.code}`);
        const s = await hex.call('still', { width: 960, height: 640 });
        if (!s.ok) throw new Error(`still: ${s.code}`);
        writeFileSync(join(out, `${name}${suf}.png`), Buffer.from(s.png.split(',')[1], 'base64'));
      }
      console.log(`ok   ${name}`);
    } catch (e) {
      failed.push(name);
      console.log(`FAIL ${name}: ${String(e.message ?? e).split('\n')[0]}`);
    }
  }
} finally {
  await hex.close();
}
writeFileSync(join(out, 'sheets.json'), JSON.stringify({ origin: hexUrl(), views: SHEET_VIEWS, failed }, null, 2) + '\n');
console.log(`${names.length - failed.length}/${names.length} sheets`);
