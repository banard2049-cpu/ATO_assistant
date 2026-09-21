// Minimal Markdown reader shared by the guide exporters.
//
// The guide uses a deliberately small slice of Markdown: headings, paragraphs,
// fenced code, blockquotes, GFM tables with alignment, ordered/unordered lists
// (one nesting level) and inline strong/em/code/link. This parser covers
// exactly that slice and is exercised by build-docs.mjs's self-check.

export function parseMarkdown(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  const isBlank = (s) => /^\s*$/.test(s);
  const isTableSep = (s) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(s) && s.includes('-');

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) { i++; continue; }

    // fenced code
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const lang = fence[1];
      const body = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
      i++; // closing fence
      blocks.push({ type: 'code', lang, text: body.join('\n') });
      continue;
    }

    // heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, text: h[2].trim() });
      i++;
      continue;
    }

    // horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // table
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => {
        const left = c.startsWith(':');
        const right = c.endsWith(':');
        return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
      });
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && !isBlank(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', header, align, rows });
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && (/^>\s?/.test(lines[i]) || (!isBlank(lines[i]) && body.length))) {
        body.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', blocks: parseMarkdown(body.join('\n')) });
      continue;
    }

    // lists
    const ul = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const ol = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
    if (ul || ol) {
      const ordered = !!ol;
      const items = [];
      while (i < lines.length) {
        const l = lines[i];
        const m = ordered ? /^(\s*)(\d+)\.\s+(.*)$/.exec(l) : /^(\s*)[-*+]\s+(.*)$/.exec(l);
        if (!m) break;
        const indent = m[1].length;
        const text = ordered ? m[3] : m[2];
        if (indent >= 2 && items.length) {
          // continuation of the previous item (nested content)
          items[items.length - 1].lines.push(text);
        } else {
          items.push({ text, lines: [] });
        }
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // paragraph
    const para = [];
    while (i < lines.length && !isBlank(lines[i])
      && !/^(#{1,6})\s/.test(lines[i])
      && !/^```/.test(lines[i])
      && !/^>\s?/.test(lines[i])
      && !/^\s*[-*+]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) blocks.push({ type: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

// Inline parsing -> tokens: {t:'text'|'strong'|'em'|'code'|'link', ...}
export function parseInline(text) {
  const out = [];
  let rest = String(text).replace(/\n/g, ' ');

  const patterns = [
    { re: /^\*\*([^*]+)\*\*/, type: 'strong' },
    { re: /^__([^_]+)__/, type: 'strong' },
    { re: /^\*([^*]+)\*/, type: 'em' },
    { re: /^_([^_]+)_/, type: 'em' },
    { re: /^`([^`]+)`/, type: 'code' },
    { re: /^\[([^\]]+)\]\(([^)]+)\)/, type: 'link' },
  ];

  let guard = 0;
  while (rest.length && guard++ < 5000) {
    let matched = false;
    for (const p of patterns) {
      const m = p.re.exec(rest);
      if (!m) continue;
      if (p.type === 'link') out.push({ t: 'link', text: m[1], href: m[2] });
      else out.push({ t: p.type, text: m[1] });
      rest = rest.slice(m[0].length);
      matched = true;
      break;
    }
    if (matched) continue;
    // consume plain text up to the next special character
    const next = rest.slice(1).search(/[*_`[]/);
    if (next === -1) { out.push({ t: 'text', text: rest }); rest = ''; }
    else { out.push({ t: 'text', text: rest.slice(0, next + 1) }); rest = rest.slice(next + 1); }
  }
  return out;
}

export function plainText(tokens) {
  return tokens.map((t) => t.text || '').join('');
}
