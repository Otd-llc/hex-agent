#!/usr/bin/env node
/**
 * Pack the run data into one zip a reader can download without cloning the repository.
 *
 *   node bin/pack-data.mjs --out <dir> [--date YYYY-MM-DD]
 *
 * Contents: every TRACKED file (git ls-files) under runs/, docs/data/, evals/, contract/ and the
 * markdown of docs/submission/paper/, except PNG stills (they stay in git and in the screenshots
 * release), plus DATA.md, LICENSE and NOTICE at the zip root. Paths
 * inside the zip match the repository. The packed paths must be clean in the working tree, so
 * the zip is reproducible from the commit the manifest names. Stored with deflate; the manifest
 * (printed, and written beside the zip as <name>.manifest.json) carries the commit, the file
 * count, the byte count and the sha256 of the zip.
 *
 * Writes only to --out, never into the tree. No zip tool needed: the zip format is written here
 * (local headers, central directory, end record; deflate via node:zlib).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
    const i = process.argv.indexOf(k);
    return i > 0 ? process.argv[i + 1] : d;
};
const OUT = arg('--out', null);
const DATE = arg('--date', new Date().toISOString().slice(0, 10));
if (!OUT) {
    console.error('usage: node bin/pack-data.mjs --out <dir> [--date YYYY-MM-DD]');
    process.exit(2);
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, maxBuffer: 1 << 28 }).toString();
const PACKED = ['runs', 'docs/data', 'evals', 'contract', 'docs/submission/paper'];
const ROOT_FILES = ['DATA.md', 'LICENSE', 'NOTICE'];

const dirty = git('status', '--porcelain', '--', ...PACKED, ...ROOT_FILES).trim();
if (dirty) {
    console.error('packed paths are not clean in the working tree; commit or stash first:\n' + dirty);
    process.exit(1);
}
const commit = git('rev-parse', 'HEAD').trim();

const files = git('ls-files', '-z', '--', ...PACKED, ...ROOT_FILES)
    .split('\0')
    .filter(Boolean)
    .filter(f => !f.startsWith('docs/submission/paper/') || f.endsWith('.md'))
    // stills stay out: the tracked PNGs are 293 MB and live in git and in the screenshots release
    .filter(f => !f.endsWith('.png'))
    .sort();
for (const f of ROOT_FILES) if (!files.includes(f)) throw new Error(`${f} is not tracked`);

// --- a minimal zip writer (PKZIP 2.0, deflate, no zip64: the pack is well under 4 GB) ---------
const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = buf => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
// one fixed DOS timestamp (the date of the pack at 00:00) so the zip bytes depend on the files only
const [yy, mm, dd] = DATE.split('-').map(Number);
const dosTime = 0;
const dosDate = ((yy - 1980) << 9) | (mm << 5) | dd;

const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

const parts = [];
const central = [];
let offset = 0;
let bytesIn = 0;
for (const f of files) {
    const data = readFileSync(path.join(ROOT, f));
    bytesIn += data.length;
    const name = Buffer.from(f, 'utf8');
    const crc = crc32(data);
    const deflated = deflateRawSync(data, { level: 9 });
    const store = deflated.length >= data.length;
    const body = store ? data : deflated;
    const method = store ? 0 : 8;
    const local = Buffer.concat([
        u32(0x04034b50), u16(20), u16(0x0800), u16(method), u16(dosTime), u16(dosDate),
        u32(crc), u32(body.length), u32(data.length), u16(name.length), u16(0), name,
    ]);
    central.push(Buffer.concat([
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(method), u16(dosTime), u16(dosDate),
        u32(crc), u32(body.length), u32(data.length), u16(name.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    parts.push(local, body);
    offset += local.length + body.length;
}
const cd = Buffer.concat(central);
const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0),
]);
const zip = Buffer.concat([...parts, cd, end]);

mkdirSync(OUT, { recursive: true });
const name = `hex-agent-data-${DATE}.zip`;
const zipPath = path.join(OUT, name);
writeFileSync(zipPath, zip);
const sha256 = createHash('sha256').update(zip).digest('hex');
const manifest = {
    name,
    commit,
    date: DATE,
    files: files.length,
    bytesUnpacked: bytesIn,
    bytesZip: zip.length,
    sha256,
    paths: PACKED,
    rootFiles: ROOT_FILES,
    perTopLevel: Object.fromEntries(
        PACKED.map(p => [p, files.filter(f => f === p || f.startsWith(p + '/')).length]),
    ),
};
writeFileSync(path.join(OUT, name.replace(/\.zip$/, '.manifest.json')), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
console.log(`${zipPath}: ${files.length} files, ${(zip.length / 1048576).toFixed(1)} MB zip (${(bytesIn / 1048576).toFixed(1)} MB unpacked), sha256 ${sha256}, commit ${commit.slice(0, 7)}`);
void statSync;
