// Prints the typeset write-up (journal layout, P1-A) and the technical report (two
// columns, P1-D) to Letter PDFs through system Chrome. Run bin/paper-render.mjs first.
//   node bin/paper-pdf.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'docs/paper');
const jobs = [['print-paper.html', 'hex-agent-paper.pdf'], ['report.html', 'hex-agent-report.pdf']];
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [src, pdf] of jobs) {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(dir, src)).href, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: join(dir, pdf), format: 'Letter', printBackground: true, preferCSSPageSize: true });
    console.log('wrote', `docs/paper/${pdf}`);
    await page.close();
  }
} finally {
  await browser.close();
}
