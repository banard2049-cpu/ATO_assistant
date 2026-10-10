// English display adapter. Names and rule text are recovered from source
// catalogs; only assistant-specific controls are authored in english-ui.js.
(() => {
  const terms = new Map();
  const scopedTerms = new Map((window.ATO_ENGLISH_TERMS?.scoped || []).map(([selector, entries]) => [selector, new Map(entries)]));
  const add = (from, to) => {
    if (from && typeof to === 'string' && /[\u3400-\u9fff]/.test(from) && !/[\u3400-\u9fff]/.test(to)) terms.set(from, to);
  };
  for (const [from, to] of window.ATO_ENGLISH_TERMS?.terms || []) add(from, to);
  for (const [from, to] of window.ATO_ENGLISH_SOURCE?.pairs || []) add(from, to);
  // Connect the two Chinese spellings to the same attested English original.
  // English -> official Chinese entries in the existing terminology table are
  // also a direct source. Never translate an English title a second time.
  const chinesePairs = window.ATO_TERMS || [];
  for (const pair of chinesePairs) {
    if (!/[\u3400-\u9fff]/.test(pair.from) && /[A-Za-z]/.test(pair.from)) add(pair.to, pair.from);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const pair of chinesePairs) {
      if (terms.has(pair.from) && !terms.has(pair.to)) add(pair.to, terms.get(pair.from));
      if (terms.has(pair.to) && !terms.has(pair.from)) add(pair.from, terms.get(pair.to));
    }
  }
  for (const [from, to] of Object.entries(window.ATO_ENGLISH_UI || {})) add(from, to);
  const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const templates = (window.ATO_ENGLISH_UI_TEMPLATES || []).map(([from, to]) => {
    const fields = []; let pattern = '', at = 0;
    for (const field of from.matchAll(/\{(\d+)\}/g)) {
      pattern += escapePattern(from.slice(at, field.index)) + '([\\s\\S]*?)';
      fields.push(field[1]); at = field.index + field[0].length;
    }
    return { pattern: new RegExp('^' + pattern + escapePattern(from.slice(at)) + '$'), fields, to };
  });
  const index = new Map();
  for (const [from, to] of terms) {
    // One-character labels such as 是/否 are only valid as complete values;
    // replacing them inside prose would corrupt unrelated words.
    if (from.length < 2 && !["格", "张", "天", "枚"].includes(from)) continue;
    const bucket = index.get(from[0]) || [];
    bucket.push({ from, to });
    index.set(from[0], bucket);
  }
  for (const bucket of index.values()) bucket.sort((a, b) => b.from.length - a.from.length);
  function translate(value, scopes = []) {
    if (!value || !/[\u3400-\u9fff]/.test(value)) return value;
    const trimmed = value.trim();
    for (const template of templates) {
      const match = template.pattern.exec(trimmed);
      if (!match) continue;
      const fields = Object.fromEntries(template.fields.map((id, index) => [id, translate(match[index + 1].trim(), scopes)]));
      return value.replace(trimmed, template.to.replace(/\{(\d+)\}/g, (_, id) => fields[id]));
    }
    const overrides = new Map(scopes.flatMap(scope => [...(scopedTerms.get(scope) || [])]));
    if (overrides.has(trimmed)) return value.replace(trimmed, overrides.get(trimmed));
    if (terms.has(trimmed)) return value.replace(trimmed, terms.get(trimmed));
    let out = '', at = 0;
    while (at < value.length) {
      const bucket = index.get(value[at]) || [];
      const extra = [...overrides].filter(([from]) => from[0] === value[at]).map(([from, to]) => ({from, to}));
      const candidates = extra.length ? [...bucket.filter(entry => !overrides.has(entry.from)), ...extra].sort((a,b) => b.from.length - a.from.length) : bucket;
      const pair = candidates.find((entry) => value.startsWith(entry.from, at));
      if (pair) {
        // Separate adjacent recovered names without rewriting the English we
        // just inserted (e.g. "当前损伤" -> "Current Wounds").
        const escaped = pair.to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp('(^|\\s)' + escaped + '\\s*$', 'i').test(out)) out = out.trimEnd();
        else {
          if (/[A-Za-z0-9]$/.test(out) && /^[A-Za-z0-9]/.test(pair.to)) out += ' ';
          out += pair.to;
        }
        at += pair.from.length;
        // A Chinese name followed by its already-present English caption is
        // one bilingual label, not two separate names.
        const tail = value.slice(at);
        const caption = new RegExp('^\\s*[（(]?\\s*' + escaped + '(?=$|[\\s，。、:;!?()（）])[）)]?', 'i').exec(tail);
        if (caption) at += caption[0].length;
      } else {
        if (/[A-Za-z]$/.test(out) && /[0-9]/.test(value[at]) && at > 0 && /[\u3400-\u9fff]/.test(value[at - 1])) out += ' ';
        out += value[at++];
      }
    }
    // Single-character conjunctions are safe between two recovered English
    // operands. Keep them untouched inside an unknown Chinese word or name.
    out = out.replace(/([A-Za-z0-9)\]])\s*([或和])\s*(?=[A-Za-z0-9(\[])/g, (_, left, word) => left + (word === '或' ? ' or ' : ' and '));
    // Read commands target a paragraph number or a quoted recovered title.
    // Do not replace the character inside unrelated words such as 读取.
    out = out.replace(/读(?=\s*(?:\d|["“「]\s*[A-Za-z0-9]))/g, 'Read ');
    return /[\u3400-\u9fff]/.test(out) ? out : out.replace(/：/g, ': ').replace(/[，、]/g, ', ').replace(/；/g, '; ').replace(/（/g, '(').replace(/）/g, ')').replace(/。/g, '.');
  }
  window.ATO_ENGLISH = {
    scopes: [...scopedTerms.keys()],
    translate,
    exact: (value) => terms.get(value.trim()),
    source: (id) => window.ATO_ENGLISH_SOURCE?.labels?.[id] || '',
    count: terms.size,
  };
})();
