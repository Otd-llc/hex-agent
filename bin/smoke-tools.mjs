// Drive every agent tool against a real configurator, no model: the A72 smoke
// test, and the one to run after a deploy. HEX_URL picks the page. It FAILS
// when the vendored contract is not the one the page serves (HEX_CONTRACT names
// a built page's hex-api-public.json; see servedContract).
//   HEX_URL=http://127.0.0.1:5310/hex.html node bin/smoke-tools.mjs
import { openHex, hexUrl } from '../src/bridge.mjs';
import { createTools } from '../src/tools.mjs';
import { CONTRACT, servedContract, contractMatches } from '../src/contract.mjs';

const served = await servedContract(hexUrl()).catch((e) => ({ hash: null, source: 'contract lookup', why: e.message }));
const same = contractMatches(CONTRACT.hash, served);
console.log(`${same.ok ? 'ok  ' : 'FAIL'} contract ${CONTRACT.hash.slice(0, 8)} is the page's (${served.source})${same.ok ? '' : `: ${same.why}`}`);

const hex = await openHex({ headless: true });
const t = createTools(hex);
const results = [same.ok];
const step = async (name, tool, args, ok) => {
  const r = await t.run(tool, args);
  const pass = !r.error && ok(r);
  results.push(pass);
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${pass ? '' : `  ${JSON.stringify(r).slice(0, 400)}`}`);
  return r;
};
// A bench x past every prop on the build.
const mmFar = (b) => Math.max(0, ...b.props.map((p) => p.atMm[0])) + 600;
const firstOk =(r) => r.outcomes?.[0]?.ok === true && !r.rolledBack;

try {
  console.log(`${hexUrl()}  api v${hex.version}  contract ${CONTRACT.hash.slice(0, 8)}`);
  // The page opens on a starter build: take a free cell the configurator offers.
  const pieces = await step('base offers', 'find_sockets', { family: 'piece', level: 0, variant: 'full' }, (r) => r.total > 0);
  await step('place a base', 'apply', { ops: [{ socket: pieces.sockets[0].socket }] }, firstOk);
  const bins = await step('bin offers', 'find_sockets', { family: 'bin' }, (r) => r.total > 0);
  const bin = bins.sockets.find((s) => /full/.test(s.op.stem) && !/div/.test(s.op.stem)) ?? bins.sockets[0];
  await step(`add ${bin.op.stem}`, 'apply', { ops: [{ socket: bin.socket }] }, firstOk);
  let b = await step('get_build', 'get_build', {}, (r) => r.total >= 2 && Array.isArray(r.props));
  const binRef = b.nodes.find((n) => n.family === 'bin').ref;
  const baseRef = b.nodes.find((n) => n.family === 'piece').ref;
  const props = await step('find_props use desk', 'find_props', { use: 'desk' }, (r) => r.total > 0);
  const plants = await step('find_props use grow', 'find_props', { use: 'grow' }, (r) => r.props.some((p) => p.plant));
  const plantId = plants.props.find((p) => p.plant).id;
  const small = [...props.props].sort((a, c) => a.sizeMm[0] - c.sizeMm[0])[0].id;
  const surf = await step(`find_surfaces fits ${small}`, 'find_surfaces', { fits: small }, (r) => r.total > 0);
  const top = surf.surfaces.find((s) => s.kind === 'top') ?? surf.surfaces[0];
  await step(`dry run addProp ${small} on ${top.surface} (${top.label})`, 'apply', { ops: [{ op: 'addProp', id: small, surface: top.surface }], dryRun: true }, (r) => r.dryRun && r.outcomes[0].ok);
  b = await step('dry run changed nothing', 'get_build', {}, (r) => r.props.length === 0);
  await step(`addProp ${small}`, 'apply', { ops: [{ op: 'addProp', id: small, surface: top.surface }] }, firstOk);
  await step('addProp on the bench', 'apply', { ops: [{ op: 'addProp', id: small, on: 'bench' }] }, firstOk);
  b = await step('get_build shows 2 props', 'get_build', {}, (r) => r.props.length === 2);
  const [p1, p2] = b.props.map((p) => p.ref);
  const far = { x: mmFar(b), z: 0 };
  await step('moveProp to a clear spot, yaw 90', 'apply', { ops: [{ op: 'moveProp', ref: p2, on: 'bench', atMm: far, yawDeg: 90 }] }, firstOk);
  // A prop ref names its pose, so a move gives the prop a new ref: read it again.
  b = await step('get_build after the move', 'get_build', {}, (r) => r.props.length === 2);
  const moved = b.props.find((p) => p.ref !== p1)?.ref;
  console.log(`     ref ${p2 === moved ? 'kept' : `changed: ${p2} -> ${moved}`}`);
  await step('removeProp', 'apply', { ops: [{ op: 'removeProp', ref: moved }] }, firstOk);
  await step('fillSoil the bin', 'apply', { ops: [{ op: 'fillSoil', part: binRef }] }, firstOk);
  await step(`plant ${plantId}`, 'apply', { ops: [{ op: 'plant', id: plantId, in: binRef }] }, firstOk);
  b = await step('get_build shows soil', 'get_build', {}, (r) => r.soil.length === 1);
  await step('emptySoil', 'apply', { ops: [{ op: 'emptySoil', part: binRef }] }, firstOk);
  await step('measure', 'measure', {}, (r) => r.parts?.x > 0 && r.withProps?.x > 0);
  await step('bom, no pack link', 'bom', {}, (r) => r.lines.length > 0 && !JSON.stringify(r).includes('http'));
  await step('undo', 'undo', {}, (r) => r.undone === true);
  await step('redo', 'redo', {}, (r) => r.redone === true);
  // Meant to error: a part ref where a prop ref goes never reaches the page.
  const bad = await t.run('apply', { ops: [{ op: 'removeProp', ref: baseRef }] });
  results.push(/prop ref/.test(bad.error ?? ''));
  console.log(`${results.at(-1) ? 'ok  ' : 'FAIL'} part ref refused for removeProp`);
  await step('removeProp the first', 'apply', { ops: [{ op: 'removeProp', ref: p1 }] }, firstOk);
  await step('check_build', 'check_build', {}, (r) => typeof r.ok === 'boolean');
  // The release-candidate ops and the look tool (contract d2fd3dad on): skipped on a page without them.
  if (CONTRACT.opFields.capOpenFaces) {
    await step('capOpenFaces', 'apply', { ops: [{ op: 'capOpenFaces' }] }, (r) => r.outcomes[0].ok && r.budget?.parts > 0);
    await step('lockJoints', 'apply', { ops: [{ op: 'lockJoints' }] }, (r) => r.outcomes[0].ok);
    await step('look from above', 'look', { polar: 10 }, (r) => r.polar === 10 && Array.isArray(r.seen));
    await step('fill_and_plant, plant suggested', 'fill_and_plant', { beds: [{ part: binRef }] }, (r) => r.placed >= 1);
  }
} finally {
  await hex.close();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
