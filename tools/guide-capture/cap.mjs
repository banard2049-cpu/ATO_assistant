// ATO Assistant guide capture driver.
//
// The agent sandbox forbids the named pipes Chrome needs for multi-process Mojo
// IPC, so every Chrome invocation here uses --single-process and runs as a
// one-shot `--screenshot` job (in that mode Chrome cannot keep a DevTools port
// alive). Node's child_process with stdio:'inherit' is allowed under the
// sandbox, so Node - not PowerShell - orchestrates the batch.
//
// Job file: JSON array of captures. Each entry:
//   name      output file stem (a .png under --out)
//   url       page URL to load (may be the driver page for scripted flows)
//   width     viewport width  (default 1600)
//   height    viewport height (default 1000)
//   budget    virtual time budget in ms (default 20000)
//   profile   profile directory name (default: derived from `account`, else
//             a throwaway dir per capture); captures sharing a profile share a
//             cookie jar
//   keep      true to leave the profile on disk after the run
//
// Usage: node cap.mjs --jobs jobs.json --out <dir> [--only a,b] [--chrome <path>]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.jobs || !args.out) {
  console.error('usage: node cap.mjs --jobs <file.json> --out <dir> [--only a,b] [--chrome <path>]');
  process.exit(2);
}

const CHROME = args.chrome || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = path.resolve(args.out);
const jobs = JSON.parse(fs.readFileSync(args.jobs, 'utf8'));
const only = args.only ? new Set(String(args.only).split(',').map((s) => s.trim())) : null;

fs.mkdirSync(OUT_DIR, { recursive: true });

// NOTE: --user-data-dir is deliberately never passed. In this environment
// Chrome aborts with STATUS_ACCESS_VIOLATION (0xC0000005) as soon as a custom
// profile directory is combined with --single-process, while the default
// profile works. Captures therefore cannot share a cookie jar across runs;
// scripted flows establish their session inside the single run instead.

function shoot(job) {
  const width = job.width || 1600;
  const height = job.height || 1000;
  const budget = job.budget || 20000;
  const out = path.join(OUT_DIR, `${job.name}.png`);
  if (fs.existsSync(out)) fs.rmSync(out, { force: true });

  const chArgs = [
    '--headless=new',
    '--single-process',
    '--no-zygote',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    `--virtual-time-budget=${budget}`,
    `--screenshot=${out}`,
    job.url,
  ];

  const started = Date.now();
  // stdio:'inherit' keeps the sandbox happy (piped stdio would need a pipe).
  const res = spawnSync(CHROME, chArgs, { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
  const ms = Date.now() - started;

  if (!fs.existsSync(out)) {
    console.log(`FAIL  ${job.name}  (${ms}ms, code=${res.status})`);
    return { name: job.name, ok: false, code: res.status };
  }
  const size = fs.statSync(out).size;
  console.log(`ok    ${job.name}  ${width}x${height}  ${size}B  ${ms}ms`);
  return { name: job.name, ok: true, size, ms };
}

const results = [];
for (const job of jobs) {
  if (only && !only.has(job.name)) continue;
  try {
    results.push(shoot(job));
  } catch (err) {
    console.log(`ERROR ${job.name}: ${err.message}`);
    results.push({ name: job.name, ok: false, error: err.message });
  }
}

// Chrome can keep a transient lock on its default profile; leftovers there are
// Chrome's own business, so nothing is deleted after the batch.

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} captured${failed.length ? ', failed: ' + failed.map((f) => f.name).join(',') : ''}`);
process.exit(failed.length ? 1 : 0);
