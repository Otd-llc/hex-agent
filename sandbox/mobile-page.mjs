// Phone-first review page for a sandbox round, published as an Artifact.
//   SANDBOX_SET=2 node sandbox/mobile-page.mjs  ->  sandbox/mobile/index.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SET2 = process.env.SANDBOX_SET === '2';
const { CONFIGS } = await import(SET2 ? './configs2.mjs' : './configs.mjs');
const OUT = SET2 ? 'sandbox/out2' : 'sandbox/out';
const reports = CONFIGS.map((c) => JSON.parse(readFileSync(`${OUT}/${c.id}.json`, 'utf8')));
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const mix = (f) => Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${v} ${k}`).join(' · ');

const card = (r) => {
  const ok = r.rulesOk && r.meshClash === 'clear' && r.roundTrip;
  const dr = r.drawers ?? [];
  const drawers = dr.length ? `${dr.length} drawer${dr.length > 1 ? 's' : ''}, face ${[...new Set(dr.map((d) => d.faces))].join(' / ')}, ${dr.every((d) => d.opens) ? 'all open' : 'not all open'}` : 'none';
  return `
<article class="card" id="${r.id}">
  <figure class="shot">
    <img class="light" src="img/${r.id}-light.png" alt="${esc(r.title)} in the configurator" loading="lazy" width="1440" height="900">
    <img class="dark" src="img/${r.id}-dark.png" alt="" loading="lazy" width="1440" height="900">
  </figure>
  <div class="body">
    <div class="head">
      <h2>${esc(r.title)}</h2>
      <label class="pick" for="pick-${r.id}"><input type="checkbox" id="pick-${r.id}" data-id="${r.id}"><span>Keep</span></label>
    </div>
    <p class="pitch">${esc(r.pitch)}</p>
    <dl>
      <div><dt>Parts</dt><dd>${r.parts} · ${r.levels.length} storey${r.levels.length > 1 ? 's' : ''}</dd></div>
      <div><dt>Drawers</dt><dd>${esc(drawers)}</dd></div>
      <div><dt>Mix</dt><dd>${esc(mix(r.families))}</dd></div>
      <div><dt>Checks</dt><dd class="${ok ? 'ok' : 'bad'}">${ok ? 'rules ok · mesh clear · link reloads' : 'check failed'}</dd></div>
    </dl>
    <a class="open" href="${esc(r.shareUrl)}" target="_blank" rel="noopener">Open in the configurator</a>
  </div>
</article>`;
};

const html = `<title>Hex Sandbox Round ${SET2 ? 2 : 1}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Saira:wght@400;600&family=JetBrains+Mono:wght@400&display=swap">
<style>
/* Layout: one column of build cards on a phone, two from tablet up; a sticky pick bar. */
:root {
  --bg: #f6f2e8; --surface: #fdfbf6; --ink: #121318; --muted: #5e5b52; --line: #ddd5c3; --gold: #8e651c; --ok: #2d6a38; --bad: #a3341f;
  --display: 'Bebas Neue', 'Oswald', Impact, sans-serif; --body: 'Saira', system-ui, sans-serif; --mono: 'JetBrains Mono', ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #08090d; --surface: #101117; --ink: #faf7f0; --muted: #a29e93; --line: #26272e; --gold: #c8963e; --ok: #8fcf9a; --bad: #f2a07b; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #08090d; --surface: #101117; --ink: #faf7f0; --muted: #a29e93; --line: #26272e; --gold: #c8963e; --ok: #8fcf9a; --bad: #f2a07b; color-scheme: dark; }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font: 16px/1.5 var(--body); }
.wrap { max-width: 1180px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 20px 96px; }
.kicker { font: 12px/1.4 var(--mono); color: var(--gold); text-transform: uppercase; letter-spacing: .08em; }
h1 { font: 400 clamp(36px, 9vw, 56px)/1 var(--display); letter-spacing: .02em; margin: 6px 0 10px; text-wrap: balance; }
.lede { color: var(--muted); margin: 0; max-width: 62ch; }
.grid { display: grid; grid-template-columns: 1fr; gap: 18px; margin-top: 22px; }
@media (min-width: 760px) { .grid { grid-template-columns: 1fr 1fr; } }
.card { background: var(--surface); border: 1px solid var(--line); display: flex; flex-direction: column; min-width: 0; }
.card.kept { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.shot { margin: 0; aspect-ratio: 4 / 3; max-width: 100%; overflow: hidden; border-bottom: 1px solid var(--line); background: var(--bg); }
.shot img { width: 100%; height: 100%; object-fit: cover; object-position: 54% 52%; display: block; }
.shot .dark { display: none; }
:root[data-theme="dark"] .shot .dark { display: block; } :root[data-theme="dark"] .shot .light { display: none; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .shot .dark { display: block; } :root:not([data-theme="light"]) .shot .light { display: none; } }
.body { padding: 14px 14px 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.head { display: flex; align-items: center; gap: 12px; }
h2 { font: 400 28px/1.05 var(--display); letter-spacing: .02em; margin: 0; flex: 1; text-wrap: balance; }
.pick { display: flex; align-items: center; gap: 8px; font: 13px var(--mono); border: 1px solid var(--line); padding: 8px 12px; min-height: 44px; cursor: pointer; }
.pick input { width: 20px; height: 20px; accent-color: var(--gold); margin: 0; }
.pitch { margin: 0; }
dl { margin: 0; display: grid; gap: 4px; font-size: 14px; }
dl div { display: grid; grid-template-columns: 72px 1fr; gap: 8px; }
dt { font: 11px/1.9 var(--mono); color: var(--muted); text-transform: uppercase; letter-spacing: .07em; }
dd { margin: 0; min-width: 0; font-variant-numeric: tabular-nums; } dd.ok { color: var(--ok); } dd.bad { color: var(--bad); }
.open { align-self: flex-start; color: var(--gold); font: 13px var(--mono); text-decoration: none; border-bottom: 1px solid currentColor; padding-block: 6px; }
.open::after { content: ' ↗'; }
a:focus-visible, button:focus-visible, .pick:focus-within { outline: 2px solid var(--gold); outline-offset: 2px; }
.bar { position: fixed; left: 0; right: 0; bottom: 0; background: var(--surface); border-top: 1px solid var(--line);
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-top: 10px; padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  display: flex; align-items: center; gap: 12px; }
.bar .count { font: 13px var(--mono); flex: 1; min-width: 0; }
.bar button { font: 14px var(--mono); color: var(--bg); background: var(--ink); border: 0; padding: 10px 14px; min-height: 44px; cursor: pointer; }
.bar textarea { position: absolute; left: -9999px; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>

<div class="wrap">
  <div class="kicker">Hex Cluster · sandbox round ${SET2 ? 2 : 1} · ${reports.length} builds</div>
  <h1>${SET2 ? 'Ten builds with a purpose' : 'Ten Hex Cluster builds'}</h1>
  <p class="lede">Built by hand through the configurator's public browser API, not by the agent. Every build passed the placement rules and the collision check, reloads from its share link, and every drawer opens and faces the user. Tick Keep on the ones worth carrying forward, then copy your picks.</p>
  <div class="grid">${reports.map(card).join('')}</div>
</div>
<div class="bar" role="region" aria-label="Your picks">
  <span class="count" id="count" aria-live="polite">0 kept</span>
  <button type="button" id="copy">Copy picks</button>
  <textarea id="fallback" aria-hidden="true" tabindex="-1"></textarea>
</div>
<script>
(() => {
  const KEY = 'hex-sandbox-${SET2 ? 2 : 1}-picks';
  const boxes = [...document.querySelectorAll('.pick input')];
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) {}
  const picks = () => boxes.filter((b) => b.checked).map((b) => b.dataset.id);
  const sync = () => {
    const p = picks();
    boxes.forEach((b) => b.closest('.card').classList.toggle('kept', b.checked));
    document.getElementById('count').textContent = p.length + ' kept';
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
  };
  boxes.forEach((b) => { b.checked = saved.includes(b.dataset.id); b.addEventListener('change', sync); });
  sync();
  const btn = document.getElementById('copy');
  btn.addEventListener('click', () => {
    const text = 'Sandbox round ${SET2 ? 2 : 1} picks: ' + (picks().join(', ') || '(none)');
    const done = (label) => { btn.textContent = label; setTimeout(() => (btn.textContent = 'Copy picks'), 1600); };
    navigator.clipboard.writeText(text).then(() => done('Copied'), () => {
      const t = document.getElementById('fallback'); t.value = text; t.select(); done('Selected, copy it');
    });
  });
})();
</script>
`;
mkdirSync('sandbox/mobile', { recursive: true });
writeFileSync('sandbox/mobile/index.html', html);
console.log(JSON.stringify(Object.fromEntries(reports.flatMap((r) => ['light', 'dark'].map((t) => [`img/${r.id}-${t}.png`, `${OUT}/${r.id}-${t}.png`])))));
