// The owner's pick page for the demo runs: per brief, every run of the suite with its stills
// in both themes (sandbox/demo-stills.mjs), the model's own look views, the checks and the
// model's report verbatim. Agent builds, never hand builds. A reviewer's verdicts are shown
// when docs/paper/sandbox/demo/review.json exists ({ runIdSuffix: { verdict, note } }).
//   node sandbox/demo-page.mjs <suite dir> [more suite dirs]
import { mkdirSync, readdirSync, readFileSync, existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const suites = process.argv.slice(2);
if (!suites.length) throw new Error('usage: node sandbox/demo-page.mjs <suite dir> [more suite dirs]');
const OUT = 'docs/paper/sandbox/demo';
mkdirSync(join(OUT, 'model'), { recursive: true });
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const briefs = JSON.parse(readFileSync('evals/briefs-demo.json', 'utf8'));
const review = existsSync(join(OUT, 'review.json')) ? JSON.parse(readFileSync(join(OUT, 'review.json'), 'utf8')) : {};
const rows = suites.flatMap((suite) => JSON.parse(readFileSync(join(suite, 'summary.json'), 'utf8')).rows.map((r) => {
  const runId = r.trace.split('/')[0];
  const t = JSON.parse(readFileSync(join(suite, r.trace), 'utf8'));
  const stills = readdirSync(join(suite, runId)).filter((f) => /^still-\d+\.png$/.test(f)).sort();
  for (const s of stills) copyFileSync(join(suite, runId, s), join(OUT, 'model', `${runId}-${s}`));
  return { ...r, runId, t, stills };
}));

const run = (r) => {
  const rv = review[r.runId.slice(-8)];
  const reqs = (r.t.finish?.requirements ?? []).map((q) => `<li><span class="st st-${esc(q.status)}">${esc(q.status)}</span> ${esc(q.requirement)}</li>`).join('');
  const checks = (r.t.briefChecks?.results ?? []).filter((c) => !c.expect.implicit).map((c) => `<li class="${c.pass ? 'ok' : 'bad'}">${c.pass ? 'ok' : 'FAIL'} <code>${esc(JSON.stringify(c.expect))}</code> saw ${esc(c.saw)}</li>`).join('');
  return `<article class="run ${r.pass ? 'pass' : 'fail'}${rv?.verdict === 'DROP' ? ' dropped' : ''}${rv?.verdict === 'KEEP' ? ' best' : ''}" id="${esc(r.runId.slice(-8))}">
  <header><span class="tag">#${r.attempt}</span> <span class="res">${r.pass ? 'Passed all checks' : 'Failed'}</span>
  <span class="meta">${r.t.verdict.nodes} parts · ${r.calls} calls · $${(r.costUsd ?? 0).toFixed(3)} · run ${esc(r.runId.slice(-8))}</span></header>
  ${rv ? `<p class="review rv-${esc(rv.verdict.toLowerCase().replace(/\W+/g, '-'))}"><b>Reviewer: ${esc(rv.verdict)}.</b> ${esc(rv.note)}</p>` : ''}
  <figure class="view"><a href="stills/${esc(r.runId)}-dark.png" class="on-dark"><img src="stills/${esc(r.runId)}-dark.png" alt="run ${esc(r.runId.slice(-8))}, dark theme"></a><a href="stills/${esc(r.runId)}-light.png" class="on-light"><img src="stills/${esc(r.runId)}-light.png" alt="run ${esc(r.runId.slice(-8))}, light theme"></a>
  <figcaption>The run's own share link reloaded in a fresh configurator, default camera, cropped to the scene (click for the full frame).</figcaption></figure>
  ${r.stills.length ? `<div class="model">${r.stills.map((s) => `<figure><img src="model/${esc(r.runId)}-${esc(s)}" alt="the model's own look"><figcaption>The model's own look (${esc(s)})</figcaption></figure>`).join('')}</div>` : '<p class="none">The model took no look still in this run.</p>'}
  <details><summary>The model's report</summary><p class="report">${esc(r.t.finish?.summary ?? '(no finish)')}</p><ul class="reqs">${reqs}</ul></details>
  <details><summary>Checks</summary><ul class="checks">${checks}</ul></details>
</article>`;
};

const sections = briefs.filter((b) => rows.some((r) => r.id === b.id)).map((b) => {
  const rs = rows.filter((r) => r.id === b.id);
  const k = rs.filter((r) => r.pass).length;
  return `<section class="brief-block"><p class="eyebrow">▸ ${esc(b.id.replace('demo-', ''))} · ${k}/${rs.length} passed all checks</p>
  <blockquote class="brief">${esc(b.brief)}</blockquote>
  <div class="runs">${rs.map(run).join('\n')}</div></section>`;
}).join('\n');

const html = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Demo pick</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Lora:ital,wght@0,400;0,600;1,400&family=Saira+Condensed:wght@800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../paper.css">
<style>
body { background: var(--color-deep-space); color: var(--color-text); margin: 0; font: 15px/1.6 var(--font-serif); }
.sheet { max-width: 100rem; margin: 0 auto; padding: 24px 16px 64px; }
.top { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; border-bottom: 1px solid var(--color-command-gold); padding-bottom: 12px; }
h1 { font: 44px/1 var(--font-display); letter-spacing: .02em; color: var(--color-title); margin: 0; }
.lede { max-width: 65ch; color: var(--color-muted); }
.toggle { font: 11px var(--font-mono); letter-spacing: .2em; text-transform: uppercase; background: none; color: var(--color-command-gold); border: 1px solid var(--color-command-gold); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.eyebrow { font: 10px var(--font-mono); letter-spacing: .24em; text-transform: uppercase; color: var(--color-command-gold); margin: 48px 0 8px; }
.brief { font: italic 18px/1.5 var(--font-serif); color: var(--color-title); max-width: 80ch; margin: 0 0 20px; padding-left: 14px; border-left: 2px solid var(--color-command-gold); }
.runs { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 28px; }
.run { border-top: 1px solid color-mix(in srgb, var(--color-panel-border) 60%, transparent); padding-top: 10px; }
.run header { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; }
.tag { font: 800 18px var(--font-numeral); color: var(--color-command-gold); }
.res { font: 11px var(--font-mono); letter-spacing: .14em; text-transform: uppercase; }
.pass .res { color: var(--color-status-green, #66bb6a); } .fail .res { color: var(--color-alert-red, #ef5350); }
.meta { font: 11px var(--font-mono); color: var(--color-muted); }
.view { margin: 8px 0 0; } .view a { display: block; overflow: hidden; aspect-ratio: 4 / 3; } .view img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.75); transform-origin: 54% 44%; display: block; }
:root[data-theme="light"] .view a .on-light { display: block !important; }
figcaption { font: 12px/1.5 var(--font-serif); color: var(--color-muted); }
.model { display: flex; gap: 8px; margin-top: 8px; } .model figure { margin: 0; flex: 1; } .model img { width: 100%; display: block; }
.none { font-size: 13px; color: var(--color-muted); }
details { margin-top: 6px; } summary { font: 11px var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--color-command-gold); cursor: pointer; }
.report { max-width: 65ch; } .reqs, .checks { padding-left: 18px; font-size: 13px; }
.checks code { font: 11px var(--font-mono); } .checks .bad { color: var(--color-alert-red, #ef5350); }
.st { font: 10px var(--font-mono); text-transform: uppercase; letter-spacing: .12em; color: var(--color-command-gold); }
.dropped { opacity: .45; } .best header .tag::after { content: ' · reviewer pick'; font: 10px var(--font-mono); letter-spacing: .18em; text-transform: uppercase; }
.review { font-size: 13px; border-left: 2px solid var(--color-signal-blue); padding-left: 10px; max-width: 65ch; }
@media (max-width: 480px) { .runs { grid-template-columns: 1fr; } h1 { font-size: 34px; } }
</style></head><body><main class="sheet">
<div class="top"><h1>Demo pick</h1><button class="toggle" id="t">Light</button></div>
<p class="lede">Agent builds, not hand builds: Muse Spark 1.3 through the Meta Model API, effort low, agent code identical to eval-final, five runs per brief (suites ${esc(suites.map((x) => x.split('/').pop()).join(', '))}). Every run is shown, passed or not. Each still is the run's own share link reloaded in a fresh configurator. A demo set, written for the video, not an evaluation.</p>
${sections}
</main>
<script>
const b = document.getElementById('t'), r = document.documentElement;
const set = (m) => { r.dataset.theme = m; b.textContent = m === 'dark' ? 'Light' : 'Dark'; try { localStorage.setItem('demo-theme', m); } catch (e) {} };
try { const m = localStorage.getItem('demo-theme'); if (m) set(m); } catch (e) {}
b.onclick = () => set(r.dataset.theme === 'dark' ? 'light' : 'dark');
</script></body></html>
`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(`${OUT}/index.html: ${rows.length} runs, ${rows.reduce((a, r) => a + r.stills.length, 0)} model stills`);
