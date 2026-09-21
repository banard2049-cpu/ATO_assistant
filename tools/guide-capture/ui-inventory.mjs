// Static UI inventory: pull the interactive element labels out of each page's
// HTML so capture jobs can target real buttons/tabs without trial and error.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\desktop\\ATO_assistant';
const targets = process.argv.slice(2);
const showIds = process.env.SHOW_IDS === '1';

for (const rel of targets) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { console.log(`\n### ${rel}  (missing)`); continue; }
  const html = fs.readFileSync(file, 'utf8');
  console.log(`\n### ${rel}  (${(html.length / 1024).toFixed(0)} KB)`);

  const labels = new Set();
  // Buttons, links and tab-like elements with literal text.
  for (const m of html.matchAll(/<(button|a|label|summary|option|th|h1|h2|h3)\b[^>]*>([^<>{}]{2,42})</g)) {
    const txt = m[2].replace(/\s+/g, ' ').trim();
    if (txt && !/^[\s\d.,:;|/\\-]*$/.test(txt)) labels.add(`${m[1]}: ${txt}`);
  }
  const sorted = [...labels].sort();
  console.log(sorted.slice(0, 120).join('\n'));

  if (showIds) {
    const ids = [...html.matchAll(/\bid="([A-Za-z][\w-]{1,40})"/g)].map((m) => m[1]);
    console.log('IDS: ' + [...new Set(ids)].join(', '));
  }
}
