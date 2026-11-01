// Minimal .env reader: KEY=value lines, no expansion. Existing env wins.
// Some switches are taken from the command line only: a .env line for one is
// not loaded, and is remembered so the code that reads the switch can refuse.
import { existsSync, readFileSync } from 'node:fs';

export const COMMAND_LINE_ONLY = new Set(['MODAL_DEDICATED_ALLOWED', 'META_API_ALLOWED']);
export const heldFromEnvFile = new Set();

export function loadEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (COMMAND_LINE_ONLY.has(m[1])) {
      heldFromEnvFile.add(m[1]);
      continue;
    }
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
