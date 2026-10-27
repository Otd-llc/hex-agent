// Generate the sandbox review page from sandbox/out/*.json.
//   node sandbox/page.mjs   ->  sandbox/out/index.html
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const SET2 = process.env.SANDBOX_SET === '2';
const { CONFIGS } = await import(SET2 ? './configs2.mjs' : './configs.mjs');
const OUT = SET2 ? 'sandbox/out2' : 'sandbox/out';

const reports = CONFIGS.map((c) => {
  try { return JSON.parse(readFileSync(`${OUT}/${c.id}.json`, 'utf8')); } catch { return null; }
}).filter(Boolean);

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const famLine = (f) => Object.entries(f).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(' · ');

const card = (r, i) => {
  const valid = r.rulesOk && r.meshClash === 'clear' && r.roundTrip;
  const drawers = r.drawers?.length
    ? `${r.drawers.length} drawer${r.drawers.length > 1 ? 's' : ''}, ${[...new Set(r.drawers.map((d) => d.faces))].join(' / ')}-facing, ${r.drawers.every((d) => d.opens) ? 'all open' : 'NOT ALL OPEN'}`
    : 'no drawers';
  return `
  <article class="card" id="${r.id}">
    <header><span class="idx">${String(i + 1).padStart(2, '0')}</span><h2>${esc(r.title)}</h2>
      <label class="pick"><input type="checkbox" data-id="${r.id}"> pick</label></header>
    <figure><img class="shot light" src="${r.id}-light.png" alt="${esc(r.title)}, light theme" loading="lazy">
      <img class="shot dark" src="${r.id}-dark.png" alt="${esc(r.title)}, dark theme" loading="lazy"></figure>
    <p class="pitch">${esc(r.pitch)}</p>
    <dl>
      <dt>Parts</dt><dd>${r.parts} parts, ${r.printed} printed · storeys ${r.levels.length}</dd>
      <dt>Mix</dt><dd>${esc(famLine(r.families))}</dd>
      <dt>Drawers</dt><dd>${esc(drawers)}</dd>
      <dt>Staging</dt><dd>${r.props} props${r.soil ? `, soil in ${r.soil}` : ''}</dd>
      <dt>Checks</dt><dd class="${valid ? 'ok' : 'bad'}">rules ${r.rulesOk ? 'ok' : 'FAIL'} · mesh ${typeof r.meshClash === 'string' ? r.meshClash : 'CLASH'} · share link reloads ${r.roundTrip ? 'yes' : 'NO'}${r.issues.length ? ' · ' + esc(r.issues.join(' ')) : ''}</dd>
    </dl>
    <nav><a href="${esc(r.shareUrl)}" target="_blank" rel="noopener">Open in configurator ↗</a>${r.pack ? `<a href="${esc(r.pack)}" target="_blank" rel="noopener">Print pack ↗</a>` : ''}</nav>
  </article>`;
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hex sandbox: reference configurations</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Saira:wght@400;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>
  :root { --bg:#faf7f0; --ink:#08090d; --muted:#5b5a55; --line:#d9d2c0; --gold:#9a6f22; --ok:#2f6b3a; --bad:#a3341f; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#08090d; --ink:#faf7f0; --muted:#a8a49a; --line:#2a2b31; --gold:#c8963e; --ok:#8fcf9a; --bad:#f2a07b; } }
  :root[data-theme="dark"] { --bg:#08090d; --ink:#faf7f0; --muted:#a8a49a; --line:#2a2b31; --gold:#c8963e; --ok:#8fcf9a; --bad:#f2a07b; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 Saira, system-ui, sans-serif; }
  .wrap { max-width:1240px; margin:0 auto; padding:24px 16px 64px; }
  .top { display:flex; justify-content:space-between; align-items:end; gap:16px; border-bottom:1px solid var(--line); padding-bottom:16px; flex-wrap:wrap; }
  h1 { font:400 44px/1 'Bebas Neue', sans-serif; letter-spacing:.02em; margin:0; }
  .kicker { font:12px/1.4 'JetBrains Mono', monospace; color:var(--gold); text-transform:uppercase; letter-spacing:.08em; }
  .lede { color:var(--muted); max-width:72ch; margin:10px 0 0; }
  .tools { display:flex; gap:8px; align-items:center; font:12px 'JetBrains Mono', monospace; }
  button { font:inherit; color:var(--ink); background:transparent; border:1px solid var(--line); padding:6px 10px; cursor:pointer; }
  button:hover { border-color:var(--gold); }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 560px), 1fr)); gap:20px; margin-top:24px; }
  .card { border:1px solid var(--line); padding:14px; display:flex; flex-direction:column; gap:10px; }
  .card.picked { border-color:var(--gold); box-shadow:inset 0 0 0 1px var(--gold); }
  .card header { display:flex; align-items:baseline; gap:10px; }
  .idx { font:12px 'JetBrains Mono', monospace; color:var(--gold); }
  h2 { font:400 26px/1.1 'Bebas Neue', sans-serif; letter-spacing:.02em; margin:0; flex:1; }
  .pick { font:12px 'JetBrains Mono', monospace; display:flex; gap:6px; align-items:center; cursor:pointer; }
  figure { margin:0; border:1px solid var(--line); aspect-ratio:1440/900; overflow:hidden; }
  .shot { width:100%; height:100%; object-fit:cover; display:block; }
  .shot.dark { display:none; }
  :root[data-theme="dark"] .shot.dark { display:block; } :root[data-theme="dark"] .shot.light { display:none; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .shot.dark { display:block; } :root:not([data-theme="light"]) .shot.light { display:none; } }
  .pitch { margin:0; }
  dl { display:grid; grid-template-columns:76px 1fr; gap:2px 10px; margin:0; font-size:13px; }
  dt { font:11px/1.9 'JetBrains Mono', monospace; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
  dd { margin:0; } dd.ok { color:var(--ok); } dd.bad { color:var(--bad); }
  nav { display:flex; gap:16px; flex-wrap:wrap; font:13px 'JetBrains Mono', monospace; }
  nav a { color:var(--gold); text-decoration:none; border-bottom:1px solid currentColor; }
  footer { margin-top:28px; color:var(--muted); font-size:13px; border-top:1px solid var(--line); padding-top:12px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <div class="kicker">Sandbox round ${SET2 ? 2 : 1} · reference configurations · built ${new Date().toISOString().slice(0, 10)}</div>
      <h1>${SET2 ? 'Round 2: ten builds with a purpose' : 'Ten Hex Cluster builds'}</h1>
      <p class="lede">Built by hand through the public browser API (window.hexAPI) on the live configurator, not by the agent. Each was checked the way an agent build is: placement rules, the mesh collision gate, the share link reloaded in a fresh session, and every drawer opened and closed. Tick the ones worth keeping.</p>
    </div>
    <div class="tools"><button id="theme" type="button">Theme</button><button id="copy" type="button">Copy picks</button><span id="count">0 picked</span></div>
  </div>
  <div class="grid">${reports.map(card).join('')}</div>
  <footer>Screens are the live configurator (light and dark). "Open in configurator" loads the exact build from its share link. Picks are kept in this browser only.</footer>
</div>
<script>
  const root = document.documentElement;
  const KEY = 'hex-sandbox-picks-${SET2 ? 2 : 1}';
  let picks = [];
  try { picks = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
  const boxes = [...document.querySelectorAll('.pick input')];
  const sync = () => {
    picks = boxes.filter((b) => b.checked).map((b) => b.dataset.id);
    boxes.forEach((b) => b.closest('.card').classList.toggle('picked', b.checked));
    document.getElementById('count').textContent = picks.length + ' picked';
    try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch {}
  };
  boxes.forEach((b) => { b.checked = picks.includes(b.dataset.id); b.addEventListener('change', sync); });
  sync();
  document.getElementById('copy').addEventListener('click', async () => {
    const text = 'Sandbox picks: ' + (picks.join(', ') || '(none)');
    try { await navigator.clipboard.writeText(text); document.getElementById('copy').textContent = 'Copied'; } catch { prompt('Copy:', text); }
    setTimeout(() => (document.getElementById('copy').textContent = 'Copy picks'), 1500);
  });
  document.getElementById('theme').addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
  });
</script>
</body>
</html>
`;
writeFileSync(`${OUT}/index.html`, html);
console.log(`${OUT}/index.html: ${reports.length} configurations`);
