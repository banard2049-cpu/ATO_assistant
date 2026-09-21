// Validate and preview the generated DOCX without Word:
//  - resolve every part reference (document -> styles, document -> images)
//  - check every <w:drawing> has a matching relationship and media part
//  - report package contents and UTF-8 text integrity
//
// node verify-docx.mjs <file.docx>

import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
if (!file) { console.error('usage: node verify-docx.mjs <file.docx>'); process.exit(2); }
const buf = fs.readFileSync(file);

// ---- read the central directory ----
const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
if (eocd < 0) { console.error('FAIL: no end-of-central-directory record (not a zip)'); process.exit(1); }
const count = buf.readUInt16LE(eocd + 10);
const cdSize = buf.readUInt32LE(eocd + 12);
const cdOfs = buf.readUInt32LE(eocd + 16);
console.log(`zip: ${count} entries, central directory ${cdSize} bytes at ${cdOfs}`);

const entries = new Map();
let p = cdOfs;
for (let i = 0; i < count; i++) {
  if (buf.readUInt32LE(p) !== 0x02014b50) { console.error('FAIL: bad central directory header at ' + p); process.exit(1); }
  const method = buf.readUInt16LE(p + 10);
  const crc = buf.readUInt32LE(p + 16);
  const compSize = buf.readUInt32LE(p + 20);
  const rawSize = buf.readUInt32LE(p + 24);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const commentLen = buf.readUInt16LE(p + 32);
  const localOfs = buf.readUInt32LE(p + 42);
  const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
  entries.set(name, { method, crc, compSize, rawSize, localOfs });
  p += 46 + nameLen + extraLen + commentLen;
}

function readEntry(name) {
  const e = entries.get(name);
  if (!e) return null;
  const lp = e.localOfs;
  if (buf.readUInt32LE(lp) !== 0x04034b50) throw new Error('bad local header for ' + name);
  const nameLen = buf.readUInt16LE(lp + 26);
  const extraLen = buf.readUInt16LE(lp + 28);
  const start = lp + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + e.compSize);
  const data = e.method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
  const crc32 = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
    let c = -1;
    for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  })();
  if (crc32 !== e.crc) throw new Error('CRC mismatch for ' + name);
  if (data.length !== e.rawSize) throw new Error('size mismatch for ' + name);
  return data;
}

console.log('\nparts:');
for (const [name, e] of entries) console.log(`  ${name.padEnd(42)} ${String(e.rawSize).padStart(9)} B  method=${e.method}`);

const problems = [];

// ---- XML well-formedness (balanced tags) ----
function checkXml(name) {
  const xml = readEntry(name)?.toString('utf8');
  if (!xml) { problems.push(`missing part ${name}`); return null; }
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, close, tag, attrs, self] = m;
    if (tag === '?xml' || xml.slice(m.index, m.index + 2) === '<?') continue;
    if (close) {
      const open = stack.pop();
      if (open !== tag) { problems.push(`${name}: unbalanced </${tag}> (expected </${open}>)`); return xml; }
    } else if (!self) stack.push(tag);
  }
  if (stack.length) problems.push(`${name}: unclosed tags ${stack.join(',')}`);
  return xml;
}

const documentXml = checkXml('word/document.xml');
checkXml('word/styles.xml');
checkXml('word/_rels/document.xml.rels');
checkXml('[Content_Types].xml');
checkXml('_rels/.rels');

// ---- relationship integrity ----
const rels = readEntry('word/_rels/document.xml.rels')?.toString('utf8') || '';
const relIds = new Set([...rels.matchAll(/Id="([^"]+)"/g)].map((m) => m[1]));
const relTargets = new Map([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));

if (documentXml) {
  const used = new Set([...documentXml.matchAll(/r:(?:embed|id)="([^"]+)"/g)].map((m) => m[1]));
  for (const id of used) {
    if (!relIds.has(id)) problems.push(`document.xml references ${id} but document.xml.rels has no such Id`);
    else {
      const target = relTargets.get(id);
      if (target.startsWith('media/') && !entries.has('word/' + target)) {
        problems.push(`relationship ${id} -> ${target} but word/${target} is missing from the package`);
      }
    }
  }
  const drawings = (documentXml.match(/<w:drawing>/g) || []).length;
  const mediaParts = [...entries.keys()].filter((n) => n.startsWith('word/media/')).length;
  console.log(`\ndrawings=${drawings}  media parts=${mediaParts}  image relationships=${[...relTargets.values()].filter((t) => t.startsWith('media/')).length}`);
  if (drawings !== mediaParts) problems.push(`drawing count (${drawings}) != media parts (${mediaParts})`);
  const tables = (documentXml.match(/<w:tbl>/g) || []).length;
  const paras = (documentXml.match(/<w:p>/g) || []).length;
  console.log(`tables=${tables}  paragraphs=${paras}  document.xml=${documentXml.length} chars`);
}

// ---- text sanity ----
if (documentXml) {
  const texts = [...documentXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  const joined = texts.join('\n');
  const cjk = (joined.match(/[\u4e00-\u9fa5]/g) || []).length;
  console.log(`text runs=${texts.length}  CJK chars=${cjk}  first run="${texts[0] || ''}"`);
  if (cjk < 1000) problems.push(`suspiciously few CJK characters (${cjk}) - encoding may be wrong`);
  for (const needle of ['ATO Assistant', '下载与安装', '内置服务器']) {
    if (!joined.includes(needle) && !joined.includes(needle.replace(/ /g, ''))) {
      console.log(`note: text "${needle}" not found verbatim`);
    }
  }
  const types = readEntry('[Content_Types].xml')?.toString('utf8') || '';
  const exts = new Set([...entries.keys()].filter((n) => n.startsWith('word/media/')).map((n) => n.split('.').pop().toLowerCase()));
  for (const ext of exts) {
    if (!new RegExp(`Extension="${ext}"`, 'i').test(types)) problems.push(`[Content_Types].xml lacks a default for .${ext}`);
  }
}

console.log('\n' + (problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'OK: package, relationships, images and text all check out'));
process.exit(problems.length ? 1 : 0);
