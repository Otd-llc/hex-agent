// Holders: a bolt-on bin that holds hand tools, designed by hex-core's holder family
// (tools/bolt_on/holder.py in Otd-llc/hex-core) and proved by its build gate
// (hex-cad build --recipe --scene --held: built, proved at every feature, and each tool
// dropped in, tipped, pushed and taken out against the built mesh).
//
// It runs offline, on a local hex-core checkout: the live configurator cannot place a
// holder yet (its custom-parts hexAPI takes recipes for full bases, not bolt bins), so the
// agent places the plain bolt bin and the holder's files go to the run folder.
//
// Off by default: --features=+holders. Needs HEX_CORE_DIR (a hex-core checkout with
// `cargo build --release -p hex-cad-cli` run) and a python with numpy and shapely
// (HEX_PYTHON, default `python`).

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The tools hex-core has vendored (fixtures/held): the bench kit's models, not measured tools.
export const HELD_TOOLS = [
  'cutters', 'pliers-45', 'pliers-90', 'pliers-straight', 'tweezers-straight', 'tweezers-curved', 'tweezers-blunt',
  // the four hex drivers (1.5 to 3.0 mm) and the screwdriver set's driver (its bits stay in their case)
  'driver-1.5', 'driver-2.0', 'driver-2.5', 'driver-3.0', 'screwdriver',
  // wire strippers, sprung open: placed last, in what room is left
  'strippers',
];
export const HOLDER_SIZES = ['S', 'M', 'L'];
// An edge bolt-on bin's stem, as the configurator lists it (find_parts family binBolt) and
// hex-core names it: hex-bin-bolt-edge-{m,f}-{solid,port}[-x2|-x3][-...]. The holder family
// refuses the drained and divided ones itself, by name.
const EDGE_BIN = /^hex-bin-bolt-edge-[mf]-[a-z0-9-]+$/;
// One holder's generation and its build gate, each (measured 1 to 20 s and 5 to 45 s at L).
const STEP_MS = 180_000;

export function holderConfig(env = process.env) {
  const dir = env.HEX_CORE_DIR ? resolve(env.HEX_CORE_DIR) : null;
  return {
    dir,
    python: env.HEX_PYTHON || 'python',
    exe: dir ? join(dir, 'target', 'release', process.platform === 'win32' ? 'hex-cad.exe' : 'hex-cad') : null,
  };
}

// What is wrong with a design_holder call, or null.
export function checkHolderArgs({ tools, base, size, spareSlots } = {}) {
  if (!Array.isArray(tools) || !tools.length) return `tools: a list of one or more of ${HELD_TOOLS.join(', ')}`;
  const unknown = tools.filter((t) => !HELD_TOOLS.includes(t));
  if (unknown.length) return `tools: ${unknown.join(', ')} not held by the family; it holds ${HELD_TOOLS.join(', ')}`;
  if (new Set(tools).size !== tools.length) return 'tools: a tool is named twice';
  if (typeof base !== 'string' || !EDGE_BIN.test(base)) return 'base: an edge bolt-on bin stem, such as hex-bin-bolt-edge-m-solid-x2 (find_parts family binBolt)';
  if (!HOLDER_SIZES.includes(size)) return `size: one of ${HOLDER_SIZES.join(', ')}`;
  if (spareSlots != null && !(Number.isInteger(spareSlots) && spareSlots >= 0 && spareSlots <= 4)) return 'spareSlots: 0 to 4';
  return null;
}

function run(cmd, args, opts) {
  return new Promise((ok) => {
    execFile(cmd, args, { timeout: STEP_MS, maxBuffer: 16 << 20, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      ok({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), error: err && typeof err.code !== 'number' ? String(err.message ?? err) : null });
    });
  });
}

// The generator's last line, `HOLDER result <json>`.
export function parseResult(stdout) {
  const line = stdout.split(/\r?\n/).reverse().find((l) => l.startsWith('HOLDER result '));
  return line ? JSON.parse(line.slice('HOLDER result '.length)) : null;
}

// The build gate's lines: the verdict, the proof, and each tool's `HELD <tool> <OK|CHECK|...>: <why>`.
export function parseBuild(text) {
  const lines = text.split(/\r?\n/);
  const verdict = lines.find((l) => l.startsWith('VERDICT '))?.split(' ')[1] ?? null;
  const proved = lines.some((l) => /^PROVED at every feature: true/.test(l));
  const volume = Number(lines.find((l) => l.startsWith('PROVED'))?.match(/volume ([0-9.]+)/)?.[1] ?? NaN);
  const held = lines.filter((l) => l.startsWith('HELD ')).map((l) => {
    const m = l.match(/^HELD (\S+) (\S+): (.*)$/);
    return m ? { tool: m[1], verdict: m[2], says: m[3] } : { tool: null, verdict: null, says: l };
  });
  const refused = lines.find((l) => /refused/.test(l)) ?? null;
  return { verdict, proved, volumeMm3: Number.isFinite(volume) ? volume : null, held, refused };
}

// Design and prove one holder. `exec` (cmd, args) -> {code, stdout, stderr, error} is the
// runner; tests pass their own. Returns what the model reads.
export async function designHolder(args, { config = holderConfig(), outDir, exec = run, name = null } = {}) {
  const bad = checkHolderArgs(args);
  if (bad) return { error: bad };
  if (!config.dir || !existsSync(join(config.dir, 'tools', 'bolt_on', 'holder.py'))) {
    return { error: 'holders are not set up here: HEX_CORE_DIR must name a hex-core checkout (tools/bolt_on/holder.py)' };
  }
  if (!existsSync(config.exe)) return { error: `holders are not set up here: no ${config.exe} (cargo build --release -p hex-cad-cli in hex-core)` };
  const id = name ?? `holder-${Date.now().toString(36)}`;
  const dir = resolve(outDir, 'holders', id);
  mkdirSync(dir, { recursive: true });
  const spec = { schema: 'hex-holder/1', name: id, base: args.base, size: args.size, tools: args.tools, spare_slots: args.spareSlots ?? 1 };
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec, null, 1) + '\n');

  const gen = await exec(config.python, [join(config.dir, 'tools', 'bolt_on', 'holder.py'), join(dir, 'spec.json'), dir, '--hex-cad', config.exe, '--fit']);
  writeFileSync(join(dir, 'generate.log'), gen.stdout + gen.stderr);
  const made = gen.error ? null : parseResult(gen.stdout);
  if (!made) return { error: `the holder generator did not answer (${gen.error ?? `exit ${gen.code}`}): ${(gen.stderr || gen.stdout).trim().split(/\r?\n/).slice(-2).join(' ')}`.slice(0, 600) };
  const dropped = made.dropped ?? [];
  if (!made.made) {
    return { made: false, base: args.base, size: args.size, refused: made.refused, dropped, note: 'Nothing was made. Try a larger size, a taller bin (cutters need two or more storeys), or fewer tools.' };
  }

  const buildDir = join(dir, 'build');
  const gate = await exec(config.exe, ['build', '--recipe', made.recipe, '--out', buildDir, '--no-store', '--force', '--stl', '--scene', made.scene, '--held', join(config.dir, 'fixtures', 'held')]);
  writeFileSync(join(dir, 'build.log'), gate.stdout + gate.stderr);
  const b = parseBuild(gate.stdout + '\n' + gate.stderr);
  const scene = JSON.parse(readFileSync(made.scene, 'utf8'));
  const heldBy = Object.fromEntries(scene.tools.map((t) => [t.tool, t.held_by]));
  const proved = gate.code === 0 && b.verdict === 'clear' && b.proved && b.held.length === made.tools.length && b.held.every((h) => h.verdict === 'OK');
  // The print file, only for a proved holder: the built STL as a PrusaSlicer 3MF carrying the house
  // print intent, the holder's fill at 10% infill and the bin at 30% (hex-core tools/bolt_on/print_file.py).
  let print = null;
  let printProblem = null;
  if (proved && made.print) {
    const stl = existsSync(buildDir) ? readdirSync(buildDir).filter((f) => f.endsWith('.stl')) : [];
    if (stl.length !== 1) {
      printProblem = `no print file: the build wrote ${stl.length} STL files`;
    } else {
      const out = join(dir, `${id}.3mf`);
      const p = await exec(config.python, [join(config.dir, 'tools', 'bolt_on', 'print_file.py'), join(buildDir, stl[0]), made.print, out]);
      writeFileSync(join(dir, 'print.log'), p.stdout + p.stderr);
      if (p.code === 0 && existsSync(out)) print = out;
      else printProblem = `no print file: print_file.py exit ${p.error ?? p.code}`;
    }
  }
  return {
    made: true,
    proved,
    base: args.base,
    size: args.size,
    holds: made.tools.map((t) => ({ tool: t, heldBy: heldBy[t] ?? null, check: b.held.find((h) => h.tool === t)?.verdict ?? null })),
    dropped,
    ...(proved ? {} : { problem: b.refused ?? `gate exit ${gate.code}, verdict ${b.verdict}, proved ${b.proved}` }),
    files: { folder: dir, recipe: made.recipe, scene: made.scene, ...(print ? { print } : {}) },
    ...(printProblem ? { printProblem } : {}),
    note: 'Designed and proved offline by hex-core. The live configurator cannot place a holder yet: place the plain bolt-on bin ' +
      `${args.base} where it goes (find_sockets family binBolt), and say in finish that the holder is a separate print file in the run folder` +
      (print ? ' (a PrusaSlicer 3MF: the holder\'s fill at 10% infill, the bin at the house 30%). ' : '. ') +
      'The tools fit the bench kit\'s models, not measured tools.',
  };
}

export const DESIGN_HOLDER_SPEC = {
  name: 'design_holder',
  description:
    'Design a bolt-on bin that holds hand tools upright (flush cutters on a saddle, needle-nose pliers in raked pockets, tweezers in slots, ' +
    'hex drivers and the screwdriver shaft down in raked holes, wire strippers head down with their handles fanned open), ' +
    'made and proved offline by hex-core: built, and each tool dropped in, tipped and taken out. Tools it cannot hold at this bin and size are dropped, ' +
    'each with the reason. The live build cannot show the holder yet: place the plain bolt-on bin it is made on. Takes 10 to 60 s.',
  parameters: {
    type: 'object',
    properties: {
      tools: { type: 'array', items: { type: 'string', enum: HELD_TOOLS }, description: 'The tools to hold.' },
      base: { type: 'string', description: 'The edge bolt-on bin stem to make it on, as find_parts lists it (family binBolt), e.g. hex-bin-bolt-edge-m-solid-x2; a solid bin, two or three storeys for cutters.' },
      size: { type: 'string', enum: HOLDER_SIZES, description: 'The system size. L holds the most: eleven of the thirteen tools on a two-storey bin.' },
      spareSlots: { type: 'integer', description: 'Extra tweezer slots for the user\'s own (default 1).' },
    },
    required: ['tools', 'base', 'size'],
    additionalProperties: false,
  },
};
