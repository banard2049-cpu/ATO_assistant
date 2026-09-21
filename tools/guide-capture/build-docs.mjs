// Build the guide deliverables from the Markdown master.
//
//   node build-docs.mjs            build DOCX + HTML (independent of Chrome)
//   node build-docs.mjs --pdf      additionally render a PDF with headless Chrome
//
// Chrome needs the named pipes this sandbox blocks, so --pdf requires the same
// widening the screenshot pipeline used; DOCX and HTML never do. The DOCX is
// written directly as OOXML (no pandoc in this environment), which also makes it
// editable in Word / WPS where the user can export a PDF themselves.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { parseMarkdown, parseInline } from './md.mjs';

const GUIDE = 'D:\\desktop\\ATO_assistant\\docs\\guide';
// 产物刻意用 ASCII 文件名：git 对非 ASCII 路径默认输出八进制转义并加引号，
// Windows PowerShell 的 Path::GetExtension() 会因此抛 "Illegal characters in path"，
// 而 tools/audit-public-release.ps1 设了 $ErrorActionPreference='Stop'，
// 会让 CI 的 Public release audit 整脚本失败。
const BASENAME = 'ATO-Assistant-user-guide';
const MD = path.join(GUIDE, `${BASENAME}.md`);
const wantPdf = process.argv.includes('--pdf');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (!fs.existsSync(MD)) { console.error('missing markdown: ' + MD); process.exit(2); }
const md = fs.readFileSync(MD, 'utf8');
const blocks = parseMarkdown(md);
console.log(`parsed ${blocks.length} blocks, ${md.length} chars`);

// ---------------------------------------------------------------- helpers ---
function pngSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const missingImages = [];
function imgPath(rel) {
  const p = path.resolve(GUIDE, rel);
  if (!fs.existsSync(p)) { missingImages.push(rel); return null; }
  return p;
}

// ------------------------------------------------------------------- HTML ---
function inlineHtml(text) {
  return parseInline(text).map((t) => {
    if (t.t === 'strong') return `<strong>${esc(t.text)}</strong>`;
    if (t.t === 'em') return `<em>${esc(t.text)}</em>`;
    if (t.t === 'code') return `<code>${esc(t.text)}</code>`;
    if (t.t === 'link') return `<a href="${esc(t.href)}">${esc(t.text)}</a>`;
    return esc(t.text);
  }).join('');
}

function blocksHtml(list, out = []) {
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.type === 'heading') out.push(`<h${b.level} id="${slug(b.text)}">${inlineHtml(b.text)}</h${b.level}>`);
    else if (b.type === 'paragraph') {
      // A paragraph that is only an image becomes a figure with its caption.
      const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(b.text.trim());
      if (m) {
        out.push(`<figure><img src="${esc(m[2])}" alt="${esc(m[1])}"><figcaption>${inlineHtml(m[1])}</figcaption></figure>`);
      } else if (/^\*图[^*]*\*$/.test(b.text.trim())) {
        out.push(`<p class="caption">${inlineHtml(b.text.trim().replace(/^\*|\*$/g, ''))}</p>`);
      } else {
        out.push(`<p>${inlineHtml(b.text)}</p>`);
      }
    } else if (b.type === 'code') out.push(`<pre><code>${esc(b.text)}</code></pre>`);
    else if (b.type === 'hr') out.push('<hr>');
    else if (b.type === 'quote') {
      out.push(`<blockquote>${blocksHtml(b.blocks, []).join('')}</blockquote>`);
    } else if (b.type === 'list') {
      const tag = b.ordered ? 'ol' : 'ul';
      const items = b.items.map((it) => {
        const sub = it.lines.length ? `<p>${inlineHtml(it.lines.join(' '))}</p>` : '';
        return `<li>${inlineHtml(it.text)}${sub}</li>`;
      }).join('');
      out.push(`<${tag}>${items}</${tag}>`);
    } else if (b.type === 'table') {
      const head = b.header.map((c, ci) => {
        const a = b.align[ci] ? ` style="text-align:${b.align[ci]}"` : '';
        return `<th${a}>${inlineHtml(c)}</th>`;
      }).join('');
      const rows = b.rows.map((r) => '<tr>' + b.header.map((_, ci) => {
        const a = b.align[ci] ? ` style="text-align:${b.align[ci]}"` : '';
        return `<td${a}>${inlineHtml(r[ci] ?? '')}</td>`;
      }).join('') + '</tr>').join('');
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`);
    }
  }
  return out;
}

function slug(text) {
  return String(text).toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>ATO Assistant 图文使用手册</title>
<style>
  :root { color-scheme: light; }
  body {
    max-width: 900px; margin: 0 auto; padding: 48px 32px 96px;
    font: 16px/1.75 -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
    color: #1f2328;
  }
  h1 { font-size: 2.1rem; border-bottom: 3px solid #1a6b5a; padding-bottom: .4rem; }
  h2 { font-size: 1.55rem; margin-top: 2.6rem; border-bottom: 1px solid #d8dee4; padding-bottom: .3rem; color: #14503f; }
  h3 { font-size: 1.22rem; margin-top: 2rem; color: #1a6b5a; }
  h4 { font-size: 1.05rem; margin-top: 1.5rem; }
  p { margin: .8rem 0; }
  code { background: #f2f4f6; padding: .12em .38em; border-radius: 4px; font-size: .9em;
         font-family: Consolas, "Cascadia Mono", monospace; }
  pre { background: #f6f8fa; border: 1px solid #d8dee4; border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 1rem 0; padding: .7rem 1rem; background: #f4f8f6; border-left: 4px solid #1a6b5a; border-radius: 0 6px 6px 0; }
  blockquote p { margin: .3rem 0; }
  table { border-collapse: collapse; width: 100%; margin: 1.1rem 0; font-size: .94rem; }
  th, td { border: 1px solid #d8dee4; padding: 7px 10px; vertical-align: top; }
  th { background: #eef4f1; text-align: left; }
  figure { margin: 1.4rem 0; text-align: center; }
  figure img { max-width: 100%; border: 1px solid #d8dee4; border-radius: 8px; }
  figcaption, .caption { font-size: .88rem; color: #57606a; margin-top: .5rem; text-align: center; }
  hr { border: 0; border-top: 1px solid #d8dee4; margin: 2.4rem 0; }
  a { color: #14503f; }
  @media print {
    body { max-width: none; padding: 0; font-size: 11pt; }
    h2 { page-break-after: avoid; }
    figure, table, pre, blockquote { page-break-inside: avoid; }
    figure img { max-height: 92vh; }
  }
</style>
</head>
<body>
${blocksHtml(blocks).join('\n')}
</body>
</html>
`;

const htmlOut = path.join(GUIDE, `${BASENAME}.html`);
fs.writeFileSync(htmlOut, html, 'utf8');
console.log('html  -> ' + htmlOut + `  (${(html.length / 1024).toFixed(0)} KB)`);

// ------------------------------------------------------------------- DOCX ---
const CONTENT_W_TWIPS = 9360;   // A4 (11906) - 2 * 1273 margins, in twentieths of a point
const CONTENT_W_EMU = CONTENT_W_TWIPS * 635; // 1 twip = 635 EMU

function runPropsFor(tokens) {
  // DOCX runs carry one style each, so mixed inline content becomes several runs.
  return tokens.map((t) => {
    const rPr = [];
    if (t.t === 'strong') rPr.push('<w:b/>');
    if (t.t === 'em') rPr.push('<w:i/>');
    if (t.t === 'code') rPr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/>');
    if (t.t === 'link') rPr.push('<w:color w:val="14503F"/><w:u w:val="single"/>');
    return {
      text: t.text,
      rPr: rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : '',
    };
  });
}

function runs(tokens) {
  return runPropsFor(tokens).map((r) =>
    `<w:r>${r.rPr}<w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`).join('');
}

function para(tokens, { style, jc, spacing, keepNext } = {}) {
  const pPr = [];
  if (style) pPr.push(`<w:pStyle w:val="${style}"/>`);
  if (keepNext) pPr.push('<w:keepNext/>');
  if (jc) pPr.push(`<w:jc w:val="${jc}"/>`);
  if (spacing) pPr.push(spacing);
  return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${runs(tokens)}</w:p>`;
}

function headPara(level, tokens) {
  const style = `Heading${Math.min(level, 4)}`;
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/><w:keepNext/></w:pPr>${runs(tokens)}</w:p>`;
}

function tableXml(b) {
  const total = CONTENT_W_TWIPS;
  const cols = b.header.length;
  const base = Math.floor(total / cols);
  const grid = b.header.map((_, i) => `<w:gridCol w:w="${i === cols - 1 ? total - base * (cols - 1) : base}"/>`).join('');
  const cell = (textTokens, isHeader, align) => {
    const tcPr = `<w:tcPr><w:tcW w:w="${base}" w:type="dxa"/>${isHeader ? '<w:shd w:val="clear" w:fill="EEF4F1"/>' : ''}<w:vAlign w:val="top"/></w:tcPr>`;
    const style = isHeader ? '<w:rPr><w:b/></w:rPr>' : '';
    const body = runs(textTokens).replace('<w:r>', `<w:r>${style}`);
    const p = `<w:p><w:pPr>${align ? `<w:jc w:val="${align}"/>` : ''}<w:spacing w:before="20" w:after="20"/></w:pPr>${body}</w:p>`;
    return `<w:tc>${tcPr}${p}</w:tc>`;
  };
  const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.header.map((c, i) => cell(parseInline(c), true, b.align[i])).join('')}</w:tr>`;
  const rows = b.rows.map((r) => '<w:tr>' + b.header.map((_, i) => cell(parseInline(r[i] ?? ''), false, b.align[i])).join('') + '</w:tr>').join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>` +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="D8DEE4"/>`).join('') +
    `</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${headerRow}${rows}</w:tbl>` +
    para([{ t: 'text', text: '' }], { spacing: '<w:spacing w:after="0" w:line="120" w:lineRule="auto"/>' });
}

function imageXml(relPath, alt) {
  const abs = imgPath(relPath);
  if (!abs) return para(parseInline(`[缺图：${relPath}]`));
  const size = pngSize(abs) || { w: 1600, h: 1000 };
  const dispW = Math.min(CONTENT_W_EMU, Math.round(CONTENT_W_EMU * 0.98));
  const dispH = Math.round(dispW * size.h / size.w);
  const cx = dispW, cy = dispH;
  const id = imageXml.next = (imageXml.next || 1) + 1;
  const name = path.basename(relPath);
  return `<w:p><w:pPr><w:jc w:val="center"/><w:keepNext/><w:spacing w:before="160" w:after="40"/></w:pPr>` +
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(name)}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing></w:r></w:p>`;
}

function docxBlocks(list, out = []) {
  for (const b of list) {
    if (b.type === 'heading') out.push(headPara(b.level, parseInline(b.text)));
    else if (b.type === 'paragraph') {
      const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(b.text.trim());
      if (m) {
        out.push(imageXml(m[2], m[1]));
      } else if (/^\*图[^*]*\*$/.test(b.text.trim())) {
        out.push(para(parseInline(b.text.trim()), { jc: 'center', style: 'Caption' }));
      } else {
        // soft line breaks inside a paragraph
        const parts = b.text.split('\n');
        out.push(para(parseInline(parts.join(' ')), { spacing: '<w:spacing w:before="60" w:after="60"/>' }));
      }
    } else if (b.type === 'code') {
      out.push(`<w:p><w:pPr><w:pStyle w:val="CodeBlock"/><w:shd w:val="clear" w:fill="F6F8FA"/><w:spacing w:before="80" w:after="80"/></w:pPr>` +
        b.text.split('\n').map((l, idx) => `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr><w:t xml:space="preserve">${esc(l)}</w:t></w:r>${idx < b.text.split('\n').length - 1 ? '<w:r><w:br/></w:r>' : ''}`).join('') +
        `</w:p>`);
    } else if (b.type === 'hr') {
      out.push(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D8DEE4"/></w:pBdr></w:pPr></w:p>`);
    } else if (b.type === 'quote') {
      const inner = docxBlocks(b.blocks, []).join('')
        .replace(/<w:pPr>/g, '<w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="1A6B5A"/></w:pBdr><w:shd w:val="clear" w:fill="F4F8F6"/><w:ind w:left="180"/>');
      out.push(inner);
    } else if (b.type === 'list') {
      b.items.forEach((it, idx) => {
        const bullet = b.ordered ? `${idx + 1}. ` : '• ';
        out.push(para([{ t: 'text', text: bullet }, ...parseInline(it.text)],
          { spacing: '<w:spacing w:before="20" w:after="20"/><w:ind w:left="360" w:hanging="240"/>' }));
        for (const extra of it.lines) {
          out.push(para(parseInline(extra), { spacing: '<w:spacing w:before="0" w:after="20"/><w:ind w:left="600"/>' }));
        }
      });
    } else if (b.type === 'table') out.push(tableXml(b));
  }
  return out;
}

const bodyXml = docxBlocks(blocks).join('');

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="240"/><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="4" w:color="1A6B5A"/></w:pBdr></w:pPr><w:rPr><w:b/><w:sz w:val="52"/><w:color w:val="14503F"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:color w:val="14503F"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="140"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="D8DEE4"/></w:pBdr></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="14503F"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1A6B5A"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:sz w:val="18"/><w:color w:val="57606A"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style>
</w:styles>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
<w:body>
${bodyXml}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1273" w:right="1273" w:bottom="1273" w:left="1273" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>ATO Assistant 图文使用手册</dc:title>
<dc:subject>从下载安装到使用细节</dc:subject>
<dc:creator>ATO Assistant 文档</dc:creator>
<cp:lastModifiedBy>ATO Assistant 文档</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:modified>
</cp:coreProperties>`;

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>ATO Assistant guide builder</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>
<Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged>
<AppVersion>1.0</AppVersion></Properties>`;

// images + relationships from the generated body
const relEntries = [...bodyXml.matchAll(/rIdImg(\d+)"[^>]*>[\s\S]*?<pic:cNvPr id="\d+" name="([^"]*)"/g)];
const usedImages = [];
{
  const seen = new Set();
  for (const m of bodyXml.matchAll(/rIdImg(\d+)/g)) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    usedImages.push(id);
  }
}

// Map each rId back to its source path by re-walking the image paragraphs.
const imageOrder = [];
for (const b of blocks) {
  if (b.type !== 'paragraph') continue;
  const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(b.text.trim());
  if (m) imageOrder.push(m[2]);
}

const docRels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'];
const media = [];
usedImages.forEach((id, idx) => {
  const rel = imageOrder[idx];
  const abs = rel ? imgPath(rel) : null;
  if (!abs) return;
  const ext = path.extname(abs).slice(1).toLowerCase() || 'png';
  const target = `media/image${idx + 1}.${ext}`;
  media.push({ target, abs });
  docRels.push(`<Relationship Id="rIdImg${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>`);
});
docRels.push('</Relationships>');

// ------------------------------------------------------- zip (store/deflate) --
function zipStore(entries) {
  // entries: [{name, data:Buffer}]
  const chunks = [];
  const central = [];
  let offset = 0;
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const zlibRef = zlib;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const deflated = zlibRef.deflateRawSync(e.data, { level: 9 });
    const useDeflate = deflated.length < e.data.length;
    const payload = useDeflate ? deflated : e.data;
    const method = useDeflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);   // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);       // time
    local.writeUInt16LE(0x21, 12);    // date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, payload);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

const docxEntries = [
  { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
  { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
  { name: 'docProps/core.xml', data: Buffer.from(coreXml, 'utf8') },
  { name: 'docProps/app.xml', data: Buffer.from(appXml, 'utf8') },
  { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') },
  { name: 'word/styles.xml', data: Buffer.from(styles, 'utf8') },
  { name: 'word/_rels/document.xml.rels', data: Buffer.from(docRels.join(''), 'utf8') },
  ...media.map((m) => ({ name: 'word/' + m.target, data: fs.readFileSync(m.abs) })),
];

const docxOut = path.join(GUIDE, `${BASENAME}.docx`);
fs.writeFileSync(docxOut, zipStore(docxEntries));
console.log('docx  -> ' + docxOut + `  (${(fs.statSync(docxOut).size / 1024 / 1024).toFixed(1)} MB, ${media.length} images)`);

// -------------------------------------------------------------------- PDF ---
if (wantPdf) {
  const pdfOut = path.join(GUIDE, `${BASENAME}.pdf`);
  const res = spawnSync(CHROME, [
    '--headless=new', '--single-process', '--no-zygote', '--no-sandbox', '--disable-gpu',
    '--disable-crash-reporter', '--disable-breakpad',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfOut}`,
    'file:///' + htmlOut.replace(/\\/g, '/'),
  ], { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
  if (fs.existsSync(pdfOut)) console.log('pdf   -> ' + pdfOut + `  (${(fs.statSync(pdfOut).size / 1024).toFixed(0)} KB)`);
  else console.log('pdf   FAILED (chrome exit ' + res.status + ')');
}

if (missingImages.length) {
  console.log('\nMISSING IMAGES (' + missingImages.length + '):');
  for (const m of [...new Set(missingImages)]) console.log('  ' + m);
  process.exitCode = 1;
}
