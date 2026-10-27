// A live panel in our own configurator tab, for watching (and filming) a run.
// Plain DOM appended to the page; it never touches the configurator's own
// state. Three layers, told apart by label and colour: what the model chose,
// what the configurator ruled, and what code concluded at the end.

// Pure: one trace event -> panel lines, or [] for events the panel skips.
export function linesFor(e) {
  if (e.type === 'model') {
    const lines = [];
    if (e.text) lines.push({ layer: 'model', text: clip(e.text, 220) });
    for (const c of e.calls) lines.push({ layer: 'model', text: describeCall(c) });
    return lines;
  }
  if (e.type === 'apply') {
    return e.outcomes.map((o) =>
      o.ok
        ? { layer: 'hex', tone: 'ok', text: `accepted ${o.op.op}${o.warnings?.length ? `  (warns ${o.warnings.map((w) => w.code).join(', ')})` : ''}` }
        : { layer: 'hex', tone: 'refused', text: `refused ${o.op.op}: ${o.code}${o.message ? ` · ${clip(o.message, 120)}` : ''}` },
    ).concat(e.rolledBack ? [{ layer: 'hex', tone: 'refused', text: 'batch taken back as one step' }] : []);
  }
  if (e.type === 'tool' && e.name === 'check_build' && e.result && !e.result.error) {
    const mesh = typeof e.result.meshClash === 'string' ? e.result.meshClash : `clash ${e.result.meshClash.depthMm} mm`;
    return [{ layer: 'hex', tone: e.result.ok && mesh === 'clear' ? 'ok' : 'refused', text: `checked: rules ${e.result.ok ? 'ok' : 'errors'}, mesh ${mesh}` }];
  }
  if (e.type === 'model_error') return [{ layer: 'model', tone: 'refused', text: `model error${e.retrying ? ', retrying' : ''}: ${clip(e.message, 120)}` }];
  return [];
}

function describeCall(c) {
  let a = {};
  try { a = JSON.parse(c.arguments || '{}'); } catch { /* shown bare */ }
  switch (c.name) {
    case 'get_build': return 'reads the build';
    case 'find_parts': return `searches parts${a.family ? ` (${a.family})` : ''}${a.text ? ` "${a.text}"` : ''}`;
    case 'find_sockets': return `asks where a ${a.family ?? 'part'} fits${a.type ? ` (${a.type}${a.facing ? `, ${a.facing}` : ''})` : ''}`;
    case 'apply': return `applies ${a.ops?.length ?? '?'} op${a.ops?.length === 1 ? '' : 's'}`;
    case 'undo': return 'undoes the last step';
    case 'check_build': return 'runs the checks';
    case 'finish': return `finishes: ${(a.requirements ?? []).map((r) => `${r.status}`).join(', ')}`;
    default: return c.name;
  }
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export async function installOverlay(page, { brief, provider, model }) {
  await page.evaluate(({ brief, provider, model }) => {
    const css = `
      #hexagent{position:fixed;top:84px;right:16px;bottom:16px;width:380px;z-index:2147483646;display:flex;flex-direction:column;
        background:rgba(8,9,13,.94);color:#faf7f0;border:1px solid #c8963e;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace}
      #hexagent header{padding:10px 12px;border-bottom:1px solid rgba(200,150,62,.4)}
      #hexagent .k{color:#c8963e;letter-spacing:.08em;font-size:10px;text-transform:uppercase}
      #hexagent .brief{margin-top:4px;color:#faf7f0}
      #hexagent ol{list-style:none;margin:0;padding:8px 12px;overflow:auto;flex:1}
      #hexagent li{padding:2px 0 2px 8px;border-left:2px solid transparent;margin-bottom:2px}
      #hexagent li.model{border-color:#7aa2f7}
      #hexagent li.hex{border-color:#c8963e}
      #hexagent li.hex.ok{color:#b9e3b0}
      #hexagent li.hex.refused{color:#f2b36b}
      #hexagent li.code{border-color:#faf7f0;font-weight:600}
      #hexagent li .t{opacity:.55;margin-right:6px}
      #hexagent footer{padding:8px 12px;border-top:1px solid rgba(200,150,62,.4);display:flex;gap:12px;flex-wrap:wrap}
      #hexagent footer span::before{content:'';display:inline-block;width:8px;height:8px;margin-right:5px;vertical-align:middle}
      #hexagent footer .m::before{background:#7aa2f7} #hexagent footer .h::before{background:#c8963e} #hexagent footer .c::before{background:#faf7f0}`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const root = document.createElement('section');
    root.id = 'hexagent';
    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const header = el('header');
    header.append(el('div', 'k', `${provider} · ${model} · live`), el('div', 'brief', brief));
    const footer = el('footer');
    footer.append(el('span', 'm', 'model plans'), el('span', 'h', 'configurator rules'), el('span', 'c', 'code verdict'));
    root.append(header, el('ol'), footer);
    document.body.appendChild(root);
  }, { brief, provider, model });
}

export async function pushLines(page, lines, tSeconds) {
  if (!lines.length) return;
  await page.evaluate(({ lines, t }) => {
    const ol = document.querySelector('#hexagent ol');
    if (!ol) return;
    for (const l of lines) {
      const li = document.createElement('li');
      li.className = `${l.layer} ${l.tone ?? ''}`;
      const ts = document.createElement('span');
      ts.className = 't';
      ts.textContent = `${t.toFixed(0).padStart(3, ' ')}s`;
      li.append(ts, document.createTextNode(l.text));
      ol.appendChild(li);
    }
    ol.scrollTop = ol.scrollHeight;
  }, { lines, t: tSeconds }).catch(() => {});
}
