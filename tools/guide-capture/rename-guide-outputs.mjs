// 把手册产物改成 ASCII 文件名。
//
// 原因：git 对非 ASCII 路径默认输出八进制转义并加引号
// （"docs/guide/ATO-Assistant-\345\233\276...docx"），Windows PowerShell 的
// [System.IO.Path]::GetExtension() 会因此抛 "Illegal characters in path"，
// 而 tools/audit-public-release.ps1 设了 $ErrorActionPreference='Stop'，
// 于是 Public release audit 直接失败。改名后 CI 与本地都能干净通过。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'D:\\desktop\\ATO_assistant';
const DIR = path.join(ROOT, 'docs', 'guide');

const renames = [
  ['ATO-Assistant-图文使用手册.docx', 'ATO-Assistant-user-guide.docx'],
  ['ATO-Assistant-图文使用手册.html', 'ATO-Assistant-user-guide.html'],
  ['ATO-Assistant-图文使用手册.md', 'ATO-Assistant-user-guide.md'],
];

for (const [fromName, toName] of renames) {
  const from = path.join(DIR, fromName);
  const to = path.join(DIR, toName);
  if (!fs.existsSync(from)) {
    console.log(`${fs.existsSync(to) ? 'skip  ' : 'MISS  '} ${fromName}${fs.existsSync(to) ? '（目标已存在）' : ''}`);
    continue;
  }
  fs.renameSync(from, to);
  console.log(`ok    ${fromName}\n   -> ${toName}  (${(fs.statSync(to).size / 1024).toFixed(0)} KB)`);
}
