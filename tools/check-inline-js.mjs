// Syntax-check the inline <script> blocks of an HTML page by compiling them with
// vm.Script. This catches a broken edit in hero/index.html without a browser.
//   node check-inline-js.mjs hero/index.html
import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) { console.error('usage: node check-inline-js.mjs <file.html>'); process.exit(2); }
const html = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

let index = 0;
let checked = 0;
let failed = 0;
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
while ((match = re.exec(html))) {
  const attrs = match[1] || '';
  const body = match[2];
  index += 1;
  // Skip data blocks and external includes: they are not executable JS here.
  if (/\bsrc\s*=/.test(attrs)) continue;
  if (/type\s*=\s*["'](application\/json|text\/template|application\/ld\+json)["']/i.test(attrs)) continue;
  const line = html.slice(0, match.index).split('\n').length;
  try {
    new vm.Script(body, { filename: `${file}#script@line${line}` });
    checked += 1;
  } catch (error) {
    failed += 1;
    console.log(`FAIL  script #${index} (starts at line ${line}): ${error.message}`);
  }
}
console.log(`${file}: ${checked} inline script block(s) parsed, ${failed} failed`);
process.exit(failed ? 1 : 0);
