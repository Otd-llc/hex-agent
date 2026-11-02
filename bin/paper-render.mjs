// Typesets the submission write-up and its technical report from Markdown, verbatim:
// the text from docs/submission/paper/{paper,report}.md, Figure 1 drawn as an SVG from
// docs/data/presentation.json, and a plate of one real agent build (its trace's brief,
// checks and claims beside the configurator's own still of the build). No model calls.
//
// Layouts (owner picks, sandbox round P1, 2026-11-02):
//   P1-C plate first  -> docs/paper/index.html      the paper's web page
//   P1-A journal      -> docs/paper/hex-agent-paper.pdf   (print of the journal page)
//   P1-D two columns  -> docs/paper/report.html, docs/paper/hex-agent-report.pdf
//   P1-B rail         -> kept for the apex /updates articles (after 2026-11-04)
//   node bin/paper-render.mjs            final pages (then: node bin/paper-pdf.mjs)
//   node bin/paper-render.mjs --sandbox  all four layouts of the paper in docs/paper/sandbox/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs/paper');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- a Markdown source: title, byline, abstract, body ----
function load(name) {
  const md = readFileSync(join(root, 'docs/submission/paper', `${name}.md`), 'utf8').replace(/<!--[\s\S]*?-->\n?/g, '');
  const title = md.split('\n').find((l) => l.startsWith('# ')).slice(2).trim();
  let restMd = md.slice(md.indexOf(title) + title.length).trim();
  let byline, abstract;
  const abs = restMd.match(/^([\s\S]*?)\n## Abstract\n+([\s\S]*?)\n(?=## )/);
  if (abs) {
    // The report: byline lines, then an Abstract section.
    byline = abs[1].trim().replace(/\n/g, ' ');
    abstract = abs[2].trim();
    restMd = restMd.slice(abs[0].length).trim();
  } else {
    [byline, abstract] = restMd.split(/\n\n+/);
    restMd = restMd.split(/\n\n+/).slice(2).join('\n\n');
  }
  return { title, byline, abstract, body: restMd };
}

// ---- Figure 1: dot and whisker from the data file ----
const data = JSON.parse(readFileSync(join(root, 'docs/data/presentation.json'), 'utf8'));
const pts = data.points;
function figure1() {
  const W = 880, labelW = 250, valW = 56, rowH = 30, top = 18, x0 = labelW, x1 = W - valW;
  const lo = 80, hi = 100, X = (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  const H = top + pts.length * rowH + 34;
  const parts = [];
  for (let v = lo; v <= hi; v += 5) {
    parts.push(`<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${top - 8}" y2="${H - 30}"/>`);
    parts.push(`<text class="tick" x="${X(v)}" y="${H - 12}" text-anchor="middle">${v}</text>`);
  }
  pts.forEach((p, i) => {
    const y = top + i * rowH + rowH / 2;
    const five = p.repeat === 5;
    const ci = five ? p.passClustered.ci : p.passCI;
    const [a, b] = ci.map((c) => Math.max(lo, Math.min(hi, c * 100)));
    const prev = pts[i - 1];
    if (prev && prev.host !== p.host) parts.push(`<line class="sep" x1="0" x2="${W}" y1="${y - rowH / 2}" y2="${y - rowH / 2}"/>`);
    const tip = `${p.label} ${p.host}, ×${p.repeat}: ${p.passed}/${p.completed} passed (${p.passRate}%), 95% interval ${(ci[0] * 100).toFixed(1)} to ${(ci[1] * 100).toFixed(1)} (${five ? 'clustered by brief' : 'Wilson over runs'})`;
    parts.push(`<g class="row" tabindex="0"><title>${esc(tip)}</title>`
      + `<rect x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}" fill="transparent"/>`
      + `<text class="rowlab" x="0" y="${y + 4}"><tspan class="host">${esc(p.host)}</tspan> ${esc(p.label.replace(/ (a|b|c|S2|S3a|SB|F1|M1|M5)$/, ''))} ×${p.repeat}${p.briefs !== 36 ? `, ${p.briefs} briefs` : ''}</text>`
      + `<line class="whisk" x1="${X(a)}" x2="${X(b)}" y1="${y}" y2="${y}"/>`
      + `<circle class="dot${five ? '' : ' hollow'}" cx="${X(p.passRate)}" cy="${y}" r="5"/>`
      + `<text class="val" x="${W}" y="${y + 5}" text-anchor="end">${p.passRate}</text></g>`);
  });
  parts.push(`<line class="axis" x1="${x0}" x2="${x1}" y1="${H - 30}" y2="${H - 30}"/>`);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pass rate per effort-low batch with 95% intervals; Table 1 lists every value.">${parts.join('')}</svg></div>`;
}

// ---- the plate: one real build ----
const plateRun = { suite: 'suite-2026-11-02T05-57-28-000Z', run: '2026-11-02T06-03-33-851Z-3e60e00d', name: 'tool-caddy' };
const tr = JSON.parse(readFileSync(join(root, 'runs', plateRun.suite, plateRun.run, 'trace.json'), 'utf8'));
const CHECK_NAMES = { agentFinished: 'finished', requirementsClaimedMet: 'claims match checks', claimsInScope: 'claims in scope', rules: 'placement rules', mesh: 'collision check', printPack: 'print pack', roundTrip: 'share link round trip' };
function plate(assets) {
  const checks = Object.entries(tr.verdict.checks).map(([k, v]) => `<li><span class="k">${esc(CHECK_NAMES[k] ?? k)}</span><span class="v">${esc(v)}</span></li>`).join('');
  const brief = tr.briefChecks.results.filter((r) => !r.expect.implicit).map((r) => `<li><span class="k">${esc(Object.entries(r.expect).map(([a, b]) => `${a} ${b}`).join(', '))}: saw ${esc(r.saw)}</span><span class="v">${r.pass ? 'pass' : 'fail'}</span></li>`).join('');
  const claims = tr.finish.requirements.map((r) => `<li><span class="k">${esc(r.requirement)}</span><span class="v">${esc(r.status)}</span></li>`).join('');
  const alt = 'The configurator\'s still of the agent\'s tool caddy: three hexagonal bases, an open divided bin, a covered bin with a carry handle, and a screwdriver in a bin.';
  const view = `<div class="view ticks"><span></span>`
    + `<img class="on-dark" src="${assets}plate-${plateRun.name}-dark.png" alt="${esc(alt)}">`
    + `<img class="on-light" src="${assets}plate-${plateRun.name}-light.png" alt="${esc(alt)}">`
    + `<img class="on-print" src="${assets}plate-${plateRun.name}-print.png" alt=""></div>`;
  const meta = `<div><p class="eyebrow">▸ Brief</p><p class="brief">${esc(tr.brief)}</p>`
    + `<p class="eyebrow" style="margin-top:18px">▸ The model's report</p><ul class="leaders">${claims}</ul></div>`
    + `<div><p class="eyebrow">▸ Checked in code</p><ul class="leaders">${checks}${brief}</ul></div>`;
  const cap = `<figcaption><b>Plate</b>One run from Fireworks F1 (Table 1, last row): Muse Spark Open, effort low, agent ${esc(tr.agent.commit.slice(0, 7))}, contract ${esc(tr.contractHash.slice(0, 8))}, ${tr.usage.calls} model calls. Image: the configurator's own still() of the build reloaded from the run's share link. Checks and claims: the run's trace, runs/${esc(plateRun.suite)}/${esc(plateRun.run)}/trace.json.</figcaption>`;
  return { view, meta, cap };
}

// ---- Markdown body to HTML, with numbered sections and captioned tables ----
function bodyHtml(src) {
  let n = 0;
  const body = src.body.replace(/```(?!sh)[\s\S]*?```\n*/, '<!--FIGURE1-->\n\n');
  return marked.parse(body)
    .replace(/<h2>(?:(\d+)\. )?([^<]*)<\/h2>/g, (_, num, t) => (num || !/^Appendix|^References/.test(t)
      ? `<h2><span class="secno">${String(num ? Number(num) : ++n).padStart(2, '0')}</span>${t}</h2>` : `<h2>${t}</h2>`))
    .replace(/<p><!--FIGURE1--><\/p>|<!--FIGURE1-->/, `<figure id="fig1">${figure1()}`)
    // The Markdown drawing marks batches with # and o; the SVG uses filled and hollow dots.
    .replace(/<p><strong>Figure 1\.<\/strong>([\s\S]*?)<\/p>/, (_, c) => `<figcaption><b>Figure 1</b>${c.replace('# a five-repeat batch', 'filled dot: a five-repeat batch').replace('o a one-run batch', 'hollow dot: a one-run batch')}</figcaption></figure>`)
    .replace(/<p><strong>Table ([A-Z]?\d+)\.<\/strong>([\s\S]*?)<\/p>\s*<table>/g, (_, id, c) => `<figure class="tab" id="tab${id}"><figcaption style="margin:0 0 10px"><b>Table ${id}</b>${c}</figcaption><div class="tablewrap"><table>`)
    .replace(/<\/table>(\s*<p>(\(a\)[\s\S]*?)<\/p>)?/g, (_, __, notes) => `</table></div>${notes ? `<p class="notes">${notes}</p>` : ''}</figure>`);
}

const head = (theme, css) => `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>hex-agent results</title>
<meta name="description" content="hex-agent: Meta's Muse Spark Open designs hardware in One Thousand Drones' live Hex Cluster configurator. Evaluation write-up, Meta Global AI Developer Hackathon.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Lora:ital,wght@0,400;0,600;1,400&family=Saira+Condensed:wght@800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${css}paper.css"></head>`;
const toggle = `<button class="toggle" type="button" aria-pressed="false" onclick="var r=document.documentElement;var l=r.dataset.theme==='light';r.dataset.theme=l?'dark':'light';this.setAttribute('aria-pressed',String(!l))">Theme</button>`;
const eyebrow = `<p class="eyebrow">▸ Meta Global AI Developer Hackathon · Startup track · Push the Frontier</p>`;
const ident = `<dl class="ident"><div><dt>Track</dt><dd>Startup</dd></div><div><dt>Problem</dt><dd>Push the Frontier</dd></div><div><dt>Model</dt><dd>Muse Spark Open</dd></div><div><dt>Hosts</dt><dd>Baseten · Modal · Fireworks</dd></div><div><dt>Repository</dt><dd>Otd-llc/hex-agent</dd></div><div><dt>As of</dt><dd>2026-11-02</dd></div></dl>`;
const range = pts.filter((p) => p.repeat === 5);
const numeral = `<p class="numeral">${Math.min(...range.map((p) => p.passRate))}<small> to </small>${Math.max(...range.map((p) => p.passRate))}<small>%</small></p><p class="numeral-label">Pass rate per batch · ${range.length} batches of 36 briefs × 5 · effort low</p>`;
const claimBlock = (s) => `<h1 class="claim">${esc(s.title)}</h1><p class="byline">${esc(s.byline)}</p><p class="abstract">${marked.parseInline(s.abstract)}</p>`;

const layouts = {
  // P1-A
  journal(s, assets) {
    const p = plate(assets);
    return `<main><header class="masthead">${eyebrow}${claimBlock(s)}</header>
<figure class="plate">${p.view}<div class="meta">${p.meta}</div>${p.cap}</figure>
<article class="paper">${bodyHtml(s)}</article></main>`;
  },
  // P1-B
  rail(s, assets) {
    const p = plate(assets);
    return `<main><aside class="rail"><div class="rail-inner">${eyebrow}<p class="brand-title">hex-agent</p><hr class="rule">
<div style="margin-top:28px">${numeral}</div><div style="margin-top:24px">${ident}</div>
<figure class="plate">${p.view}${p.cap}</figure></div></aside>
<div class="reading paper">${claimBlock(s)}<div class="plate" style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px">${p.meta}</div>${bodyHtml(s)}</div></main>`;
  },
  // P1-C
  plate(s, assets, links = '') {
    const p = plate(assets);
    return `<main><section class="front plate"><figure style="margin:0">${p.view}${p.cap}</figure><div class="meta">${eyebrow}<p class="brand-title" style="font-size:64px">hex-agent</p>${links}${p.meta}</div></section>
<section class="lede paper"><div>${claimBlock(s)}</div><div>${numeral}<div style="margin-top:24px">${ident}</div></div></section>
<article class="body paper">${bodyHtml(s)}</article></main>`;
  },
  // P1-D
  columns(s, assets, links = '') {
    const p = plate(assets);
    // Tables, Figure 1 and code blocks span both columns.
    const spanned = bodyHtml(s).replace(/<figure class="tab"/g, '<figure class="tab span"').replace(/<figure id="fig1"/, '<figure class="span" id="fig1"').replace(/<pre>/g, '<pre class="span">');
    return `<main><header class="head paper"><div>${eyebrow}${claimBlock(s)}${links}</div><div>${numeral}<div style="margin-top:20px">${ident}</div></div></header>
<article class="paper cols"><figure class="plate span" style="display:grid;grid-template-columns:3fr 2fr;gap:28px"><div>${p.view}${p.cap}</div><div>${p.meta}</div></figure>${spanned}</article></main>`;
  },
};

const page = (layout, s, theme, opts) => `${head(theme, opts.css)}<body class="v-${layout}">${toggle}${layouts[layout](s, opts.assets, opts.links)}</body></html>\n`;
const paper = load('paper');
const report = load('report');
const links = (here) => `<p class="doclinks">${[['index.html', 'Write-up'], ['hex-agent-paper.pdf', 'PDF'], ['report.html', 'Technical report'], ['hex-agent-report.pdf', 'Report PDF'], ['https://github.com/Otd-llc/hex-agent', 'Repository']].map(([h, t]) => (h === here ? `<span>${t}</span>` : `<a href="${h}">${t}</a>`)).join(' · ')}</p>`;

if (process.argv.includes('--sandbox')) {
  mkdirSync(join(out, 'sandbox'), { recursive: true });
  for (const v of ['journal', 'rail', 'plate', 'columns']) {
    writeFileSync(join(out, 'sandbox', `${v}.html`), page(v, paper, v === 'journal' ? 'light' : 'dark', { css: '../', assets: '../assets/' }));
    console.log('wrote', `docs/paper/sandbox/${v}.html`);
  }
} else {
  const opts = { css: '', assets: 'assets/' };
  writeFileSync(join(out, 'index.html'), page('plate', paper, 'dark', { ...opts, links: links('index.html') }));
  writeFileSync(join(out, 'print-paper.html'), page('journal', paper, 'light', opts));
  writeFileSync(join(out, 'report.html'), page('columns', report, 'dark', { ...opts, links: links('report.html') }));
  console.log('wrote docs/paper/index.html, print-paper.html, report.html');
}
