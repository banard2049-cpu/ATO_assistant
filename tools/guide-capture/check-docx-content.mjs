// Confirm the rebuilt DOCX reflects the Android removal and the renumbered
// chapter 2, by reading word/document.xml back out of the package.
import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const buf = fs.readFileSync(file);
const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
const count = buf.readUInt16LE(eocd + 10);
const cdOfs = buf.readUInt32LE(eocd + 16);

let p = cdOfs;
let doc = null;
for (let i = 0; i < count; i++) {
  const method = buf.readUInt16LE(p + 10);
  const comp = buf.readUInt32LE(p + 20);
  const nl = buf.readUInt16LE(p + 28);
  const el = buf.readUInt16LE(p + 30);
  const cl = buf.readUInt16LE(p + 32);
  const ofs = buf.readUInt32LE(p + 42);
  const name = buf.toString('utf8', p + 46, p + 46 + nl);
  if (name === 'word/document.xml') {
    const lnl = buf.readUInt16LE(ofs + 26);
    const lel = buf.readUInt16LE(ofs + 28);
    const s = ofs + 30 + lnl + lel;
    const raw = buf.subarray(s, s + comp);
    doc = (method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw)).toString('utf8');
  }
  p += 46 + nl + el + cl;
}

if (!doc) { console.error('FAIL: word/document.xml not found'); process.exit(1); }

const text = [...doc.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');

const checks = [
  ['no 安卓/Android/APK anywhere', !/安卓|Android|APK/.test(doc)],
  ['heading "2.5 服务器 / NAS 部署（Docker）" present', text.includes('2.5 服务器 / NAS 部署（Docker）')],
  ['heading "2.6 从源码运行（开发 / 折腾用）" present', text.includes('2.6 从源码运行（开发 / 折腾用）')],
  ['old heading "Android 安装" gone', !text.includes('Android 安装')],
  ['old heading "2.7 从源码运行" gone', !text.includes('2.7 从源码运行')],
  ['cross-ref "（见 2.5）" present', text.includes('（见 2.5）')],
  ['cross-ref "2.6 指定" present', text.includes('2.6 指定')],
  // "（2.6）" is legitimate when it points at 从源码运行; only a Docker
  // reference that still says 2.6 would be stale.
  ['Docker cross-ref points at 2.5, not 2.6', !text.includes('Docker 方式（2.6）')],
  ['no stale "（2.7）"', !text.includes('（2.7）')],
  ['Android resource-pack warning gone', !text.includes('安卓版本要求')],
  ['chapter 7.1 rewritten (no APK install bullet)', !text.includes('装 APK')],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
