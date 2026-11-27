import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkHolderArgs, parseResult, parseBuild, designHolder, holderConfig, HELD_TOOLS } from '../src/holders.mjs';
import { createTools, toolSpecsFor } from '../src/tools.mjs';

const ARGS = { tools: ['cutters', 'tweezers-blunt'], base: 'hex-bin-bolt-edge-m-solid-x2', size: 'L' };

test('design_holder arguments are checked before anything runs', () => {
  assert.equal(checkHolderArgs(ARGS), null);
  assert.match(checkHolderArgs({ ...ARGS, tools: [] }), /one or more/);
  assert.match(checkHolderArgs({ ...ARGS, tools: ['hammer'] }), /hammer not held/);
  assert.match(checkHolderArgs({ ...ARGS, tools: ['cutters', 'cutters'] }), /named twice/);
  assert.match(checkHolderArgs({ ...ARGS, base: 'hex-bin-full' }), /edge bolt-on bin/);
  assert.match(checkHolderArgs({ ...ARGS, base: 'hex-bin-bolt-edge-m-solid-x2; rm -rf /' }), /edge bolt-on bin/, 'a stem is letters, digits and dashes');
  assert.match(checkHolderArgs({ ...ARGS, size: 'XL' }), /one of S, M, L/);
  assert.match(checkHolderArgs({ ...ARGS, spareSlots: 9 }), /0 to 4/);
});

test('the generator\'s result line and the build gate\'s lines are read', () => {
  const r = parseResult('cutters: fin at x 66\nHOLDER dropped tweezers-blunt: 4 slots do not fit\nHOLDER made t: 9 changes, 1 tools\nHOLDER result {"made": true, "tools": ["cutters"], "dropped": [{"tool": "tweezers-blunt", "why": "4 slots do not fit"}]}\n');
  assert.equal(r.made, true);
  assert.deepEqual(r.tools, ['cutters']);
  assert.equal(r.dropped[0].tool, 'tweezers-blunt');
  assert.equal(parseResult('no result here'), null);
  const b = parseBuild('VERDICT clear abc\nPROVED at every feature: true; B-rep volume 871827.506437 mm3\nHELD cutters OK: rest +0.46 mm, comes out\nHELD pliers-45 CHECK: blocked at Some(2.6) mm\n');
  assert.equal(b.verdict, 'clear');
  assert.equal(b.proved, true);
  assert.equal(b.volumeMm3, 871827.506437);
  assert.deepEqual(b.held.map((h) => [h.tool, h.verdict]), [['cutters', 'OK'], ['pliers-45', 'CHECK']]);
});

// A hex-core checkout with nothing in it but the two files designHolder looks for.
function fakeCore() {
  const dir = mkdtempSync(join(tmpdir(), 'hex-core-'));
  mkdirSync(join(dir, 'tools', 'bolt_on'), { recursive: true });
  writeFileSync(join(dir, 'tools', 'bolt_on', 'holder.py'), '');
  mkdirSync(join(dir, 'target', 'release'), { recursive: true });
  const config = holderConfig({ HEX_CORE_DIR: dir, HEX_PYTHON: 'py' });
  writeFileSync(config.exe, '');
  return config;
}

// A runner that answers as the generator and the gate do; `gate` says how the build goes.
function fakeExec({ made = true, gate = 'ok' } = {}) {
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'py') {
      const out = args[2];
      if (!made) {
        return { code: 1, stdout: 'HOLDER refused hex-bin-bolt-edge-m-solid-drain-x2: a drained bin\nHOLDER result {"made": false, "refused": {"tool": "hex-bin-bolt-edge-m-solid-drain-x2", "why": "a drained bin"}, "dropped": []}\n', stderr: '' };
      }
      const recipe = join(out, 't.recipe.json'), scene = join(out, 't.scene.json');
      writeFileSync(recipe, '{}');
      writeFileSync(scene, JSON.stringify({ tools: [{ tool: 'cutters', held_by: 'hangs head up in a saddle' }] }));
      return { code: 0, stdout: `HOLDER dropped tweezers-blunt: 4 slots do not fit\nHOLDER result ${JSON.stringify({ made: true, tools: ['cutters'], dropped: [{ tool: 'tweezers-blunt', why: '4 slots do not fit' }], recipe, scene })}\n`, stderr: '' };
    }
    if (gate === 'ok') return { code: 0, stdout: 'VERDICT clear x\nPROVED at every feature: true; B-rep volume 1 mm3\nHELD cutters OK: comes out\n', stderr: '' };
    return { code: 1, stdout: 'VERDICT clear x\nPROVED at every feature: true; B-rep volume 1 mm3\nHELD cutters STUCK: rest +0.00 mm\n', stderr: 'hex-cad: refused: a held tool is not held, or blocks a bolt: nothing is written\n' };
  };
  return { exec, calls };
}

test('a holder made and proved: what it holds, what it dropped and why, and where the files are', async () => {
  const config = fakeCore();
  const outDir = mkdtempSync(join(tmpdir(), 'run-'));
  const { exec, calls } = fakeExec();
  const r = await designHolder({ ...ARGS, spareSlots: 2 }, { config, outDir, exec, name: 't' });
  assert.equal(r.made, true);
  assert.equal(r.proved, true);
  assert.deepEqual(r.holds, [{ tool: 'cutters', heldBy: 'hangs head up in a saddle', check: 'OK' }]);
  assert.deepEqual(r.dropped, [{ tool: 'tweezers-blunt', why: '4 slots do not fit' }]);
  assert.match(r.note, /cannot place a holder yet/);
  // the spec it wrote, the generator with --fit, then the gate with the tools' folder
  assert.ok(existsSync(join(r.files.folder, 'spec.json')));
  assert.deepEqual(calls[0].slice(-3), ['--hex-cad', config.exe, '--fit']);
  assert.equal(calls[1][0], config.exe);
  assert.ok(calls[1].includes('--held') && calls[1].includes('--scene'));
  assert.ok(existsSync(join(r.files.folder, 'build.log')));
});

test('a refused holder says by whom and why; a failed gate is not proved', async () => {
  const config = fakeCore();
  const outDir = mkdtempSync(join(tmpdir(), 'run-'));
  const refused = await designHolder({ ...ARGS, base: 'hex-bin-bolt-edge-m-solid-drain-x2' }, { config, outDir, exec: fakeExec({ made: false }).exec, name: 'r' });
  assert.equal(refused.made, false);
  assert.equal(refused.refused.why, 'a drained bin');
  const failed = await designHolder(ARGS, { config, outDir, exec: fakeExec({ gate: 'stuck' }).exec, name: 'f' });
  assert.equal(failed.made, true);
  assert.equal(failed.proved, false);
  assert.match(failed.problem, /not held/);
  assert.equal(failed.holds[0].check, 'STUCK');
});

test('without a hex-core checkout design_holder says so, and runs nothing', async () => {
  const { exec, calls } = fakeExec();
  const r = await designHolder(ARGS, { config: holderConfig({}), outDir: tmpdir(), exec });
  assert.match(r.error, /HEX_CORE_DIR/);
  assert.equal(calls.length, 0);
});

test('design_holder is offered only with the holders feature, and reports to the trace', async () => {
  assert.ok(!toolSpecsFor({}).some((t) => t.name === 'design_holder'));
  const on = toolSpecsFor({ holders: true }).map((t) => t.name);
  assert.deepEqual(on.slice(-2), ['design_holder', 'finish']);
  const spec = toolSpecsFor({ holders: true }).find((t) => t.name === 'design_holder');
  assert.deepEqual(spec.parameters.properties.tools.items.enum, HELD_TOOLS);
  const hex = { async call() { return undefined; } };
  assert.match((await createTools(hex).run('design_holder', ARGS)).error, /off in this session/);
  const events = [];
  const t = createTools(hex, { onEvent: (e) => events.push(e), holders: async (a) => ({ made: true, proved: true, base: a.base, size: a.size, holds: [{ tool: 'cutters' }], dropped: [], files: { folder: 'f' } }) });
  const r = await t.run('design_holder', ARGS);
  assert.equal(r.proved, true);
  assert.deepEqual(events, [{ type: 'holder', made: true, proved: true, base: ARGS.base, size: 'L', holds: ['cutters'], dropped: [], folder: 'f' }]);
});

// The real thing, when a hex-core checkout is named: the generator, the build and the drop test.
test('live: hex-core makes and proves a holder for cutters and tweezers at L', { skip: !process.env.HEX_CORE_DIR && 'HEX_CORE_DIR not set', timeout: 300_000 }, async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'run-'));
  const r = await designHolder({ tools: ['cutters', 'tweezers-blunt', 'pliers-45'], base: 'hex-bin-bolt-edge-m-solid-x2', size: 'L' }, { outDir, name: 'live' });
  assert.ok(!r.error, r.error);
  assert.equal(r.made, true, JSON.stringify(r));
  assert.equal(r.proved, true, JSON.stringify(r));
  assert.deepEqual(r.holds.map((h) => h.tool).sort(), ['cutters', 'pliers-45', 'tweezers-blunt']);
  assert.ok(r.holds.every((h) => h.check === 'OK'));
});

test('in the loop: +holders offers design_holder, says how to use it, and the trace keeps the result', async () => {
  const { runAgent, HOLDERS } = await import('../src/agent.mjs');
  const { mockModel } = await import('../src/model.mjs');
  const nodes = [{ ref: 'n1', family: 'piece', at: { q: 0, r: 0, level: 0 }, stem: 'hex-main', detail: {} }];
  const hex = { async call(m) { return m === 'getState' ? { state: { pieces: [], snaps: [] }, nodes, staging: { props: [], soil: [] } } : undefined; } };
  let offered = null, told = null;
  const model = mockModel((ctx, i) => {
    if (i === 0) {
      offered = ctx.tools.map((t) => t.name);
      told = ctx.instructions;
      return [{ name: 'design_holder', args: ARGS }];
    }
    return [{ name: 'finish', args: { requirements: [{ requirement: 'hold cutters', status: 'partial', evidence: 'a print file' }], summary: 'holder' } }];
  });
  const asked = [];
  const r = await runAgent({ hex, model, brief: 'hold my cutters', features: { holders: true }, holderDesign: async (a) => (asked.push(a), { made: true, proved: true, base: a.base, size: a.size, holds: [{ tool: 'cutters' }], dropped: [], files: { folder: 'f' } }) });
  assert.ok(offered.includes('design_holder'));
  assert.ok(told.includes(HOLDERS.trim().slice(0, 40)));
  assert.deepEqual(asked, [ARGS]);
  assert.equal(r.features.holders, true);
  assert.ok(r.events.some((e) => e.type === 'holder' && e.proved === true));
});
