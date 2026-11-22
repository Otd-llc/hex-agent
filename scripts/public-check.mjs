// PUBLIC CHECK: this repository is public, so before a branch is pushed nothing private may be
// in what it adds: no local path, no machine or account name, nothing of a private codebase's
// layout, no private host name, no key. It searches, against a base (default
// origin/feat/look-ahead):
//   every line the branch adds (git diff <base>...HEAD, and git diff HEAD: not yet committed),
//   and every file name it touches
//   every commit message of <base>..HEAD, whole
//   every untracked file that is not ignored (it could be committed next)
// for each pattern below (literal, case as written), prints each finding, and exits 1 on any
// (0 when there is none, 2 when git cannot answer).
//   node scripts/public-check.mjs [<base>]
// The patterns are put together from pieces so that this file, which the branch adds, does not
// hold them itself.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PATTERNS = [
  'C:' + '\\', // a drive's path, with one backslash or two
  'C' + ':/',
  '/c/' + 'z'.repeat(3),
  'z'.repeat(3),
  ['ra', 'ven'].join(''),
  'U' + 'sers',
  ['hex', 'core'].join('-'),
  'crates' + '/',
  '.' + 'rs',
  'ts' + '.net',
  'sk' + '-ant-',
];

/** Each pattern found in `text`, with the line it is on: [{ pattern, line, text }]. */
export function findings(text) {
  const out = [];
  text.split('\n').forEach((t, i) => {
    for (const pattern of PATTERNS) if (t.includes(pattern)) out.push({ pattern, line: i + 1, text: t.trim().slice(0, 160) });
  });
  return out;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

/** What the branch adds, as [{ where, text }] to search. */
export function whatIsAdded(base) {
  const items = [];
  // the lines added, by file (-U0: no context, which is the base's own text)
  // and those not yet committed (git diff HEAD), which the next commit could carry
  for (const [range, tag] of [[`${base}...HEAD`, ''], ['HEAD', ' (uncommitted)']]) {
    let file = null;
    let n = 0;
    for (const line of git('diff', '--no-color', '--no-ext-diff', '-U0', range).split('\n')) {
      if (line.startsWith('+++ ')) {
        file = line.slice(4).replace(/^b\//, '') + tag;
        continue;
      }
      if (line.startsWith('@@')) {
        n = Number(line.match(/\+(\d+)/)?.[1] ?? 0);
        continue;
      }
      if (line.startsWith('+')) items.push({ where: `${file}:${n++}`, text: line.slice(1) });
    }
  }
  for (const name of git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean)) items.push({ where: `file name ${name}`, text: name });
  for (const sha of git('rev-list', `${base}..HEAD`).split('\n').filter(Boolean)) {
    items.push({ where: `commit ${sha.slice(0, 8)} message`, text: git('log', '-1', '--format=%B', sha) });
  }
  for (const name of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) {
    items.push({ where: `untracked file ${name}`, text: name });
    if (statSync(name).size <= 8 << 20) items.push({ where: `untracked contents ${name}`, text: readFileSync(name, 'utf8') });
  }
  return items;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const base = process.argv[2] ?? 'origin/feat/look-ahead';
  let items;
  try {
    items = whatIsAdded(base);
  } catch (e) {
    console.error(`public-check: git could not answer for ${base}: ${e.message.split('\n')[0]}`);
    process.exit(2);
  }
  const found = [];
  for (const { where, text } of items) for (const f of findings(text)) found.push({ where, ...f });
  const counted = (p) => items.filter((i) => i.where.startsWith(p)).length;
  const lines = items.filter((i) => /:\d+$/.test(i.where)).length;
  console.log(`public-check against ${base}: ${lines} lines added, ${counted('file name')} files, ${counted('commit')} commit messages, ${counted('untracked file')} untracked files searched for ${PATTERNS.length} patterns`);
  for (const f of found) console.log(`  FOUND ${JSON.stringify(f.pattern)} in ${f.where}${f.where.includes(':') && /:\d+$/.test(f.where) ? '' : ` line ${f.line}`}: ${f.text}`);
  console.log(found.length ? `public-check: ${found.length} found, FAIL` : 'public-check: none found, PASS');
  process.exit(found.length ? 1 : 0);
}
