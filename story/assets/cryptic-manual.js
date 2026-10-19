/* Manual cryptic-language records. Glyph identities are independent of learned
 * readings; word notes and saved transcripts never change the original tokens.
 */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./cryptic/glyph-catalog.js") : root.ATO_CRYPTIC_CATALOG,
    node ? require("./cryptic/vendor/text-format.js") : root.BabelianTextFormat);
  if (node) module.exports = api; else root.ATO_CRYPTIC_MANUAL = api;
})(typeof window === "object" ? window : this, function (catalog, textFormat) {
  "use strict";
  const MAX_INPUT = 256, MAX_TEXT = 14000;
  let formatter = null;
  const plain = value => value && typeof value === "object" && !Array.isArray(value);
  const valid = (token, language) => Number.isInteger(token) && token >= 0 && token < catalog[language].length;
  const separator = token => token === " " || token === "\n";
  const clean = (value, length) => typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, length) : "";
  const reading = value => clean(value, 40).replace(/[\r\n\t]/g, " ").trim();
  const tokens = (value, language) => Array.isArray(value) ? value.filter(token => valid(token, language) || separator(token)).slice(0, MAX_INPUT) : [];
  const recordId = id => /^crypt-[A-Za-z0-9_-]{1,95}$/.test(id);
  const wordId = id => /^word-[A-Za-z0-9_-]{1,95}$/.test(id);

  function normalize(value, language) {
    if (!catalog[language]) throw Error("未知语言。");
    const result = { version: 1, mapping: {}, draft: tokens(value?.draft, language), words: {}, records: {}, formatted: null };
    for (const glyph of catalog[language]) {
      const text = reading(value?.mapping?.[glyph.index]);
      if (text) result.mapping[glyph.index] = text;
    }
    if (plain(value?.words)) for (const [id, word] of Object.entries(value.words)) {
      if (!wordId(id) || !Array.isArray(word?.glyphs) || !word.glyphs.length || word.glyphs.length > MAX_INPUT || !word.glyphs.every(token => valid(token, language))) continue;
      const meaning = clean(word.meaning, 120).trim();
      if (meaning) result.words[id] = { glyphs: word.glyphs.slice(), meaning };
    }
    if (plain(value?.formatted) && typeof value.formatted.source === "string" && typeof value.formatted.text === "string") {
      result.formatted = { source: clean(value.formatted.source, MAX_TEXT), text: clean(value.formatted.text, MAX_TEXT) };
    }
    if (plain(value?.records)) for (const [id, entry] of Object.entries(value.records)) {
      if (!recordId(id) || !Array.isArray(entry?.tokens) || !entry.tokens.length || entry.tokens.length > MAX_INPUT || !entry.tokens.every(token => valid(token, language) || separator(token))) continue;
      result.records[id] = {
        tokens: entry.tokens.slice(), readings: entry.tokens.map((token, index) => separator(token) ? token : reading(entry.readings?.[index])),
        text: clean(entry.text, MAX_TEXT), wordReading: clean(entry.wordReading, MAX_TEXT),
        title: clean(entry.title, 120), cycle: /^c[1-5]$/.test(entry.cycle) ? entry.cycle : "", createdAt: clean(entry.createdAt, 80),
      };
    }
    return result;
  }
  function transcript(value, language) {
    const current = normalize(value, language), spans = [];
    let text = "";
    const readings = current.draft.map(token => separator(token) ? token : current.mapping[token] || "");
    current.draft.forEach((token, index) => {
      const start = text.length;
      text += separator(token) ? token : readings[index] || "[?]";
      if (!separator(token)) spans.push({ start, end: text.length, glyph: token, text: text.slice(start) });
    });
    return { text, spans, readings };
  }
  function wordReadingFrom(tokens, readings, words) {
    const groups = [];
    if (plain(words)) for (const word of Object.values(words)) {
      if (Array.isArray(word?.glyphs) && word.glyphs.length && typeof word.meaning === "string" && word.meaning.trim()) groups.push(word);
    }
    groups.sort((a, b) => b.glyphs.length - a.glyphs.length);
    const parts = [];
    for (let index = 0; index < tokens.length;) {
      const token = tokens[index];
      if (separator(token)) { parts.push(token); index++; continue; }
      const word = groups.find(word => word.glyphs.every((glyph, offset) => tokens[index + offset] === glyph));
      if (word) { parts.push(`【${word.meaning}】`); index += word.glyphs.length; }
      else { parts.push(readings[index] || "[?]"); index++; }
    }
    return parts.join("");
  }
  function wordReading(value, language) {
    const current = normalize(value, language), source = transcript(current, language);
    return wordReadingFrom(current.draft, source.readings, current.words);
  }
  // Saved records keep their original glyphs and the readings that were already
  // known when they were saved. Unknown markers follow the current mapping, so a
  // record made before the cipher was solved becomes readable as it is solved.
  // The saved segmentation (spaces and punctuation) stays as it was; phrase
  // meanings follow the current word notes.
  function recordText(entry, tokens, saved, readings) {
    const fallback = tokens.map((token, index) => separator(token) ? token : readings[index] || "[?]").join("");
    const text = typeof entry?.text === "string" ? entry.text : "";
    const source = tokens.map((token, index) => separator(token) ? token : saved[index] || "[?]").join("");
    if (!text || source === fallback) return text || fallback;
    const spans = [];
    let at = 0;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (separator(token)) { at += token.length; continue; }
      const value = saved[index] || "[?]";
      spans.push({ start: at, end: at + value.length, glyph: token, index });
      at += value.length;
    }
    try {
      const aligned = textFormat.reflow({ text: source, spans }, text), parts = [];
      let cursor = 0;
      for (const span of aligned.spans) {
        parts.push(text.slice(cursor, span.start));
        parts.push(saved[span.index] ? text.slice(span.start, span.end) : readings[span.index] || text.slice(span.start, span.end));
        cursor = span.end;
      }
      parts.push(text.slice(cursor));
      return parts.join("");
    } catch { return fallback; }
  }
  function recordView(entry, language, current) {
    if (!catalog[language]) throw Error("未知语言。");
    const state = plain(current) ? current : {}, mapping = plain(state.mapping) ? state.mapping : {};
    const tokens = Array.isArray(entry?.tokens)
      ? entry.tokens.filter(token => separator(token) || valid(token, language)).slice(0, MAX_INPUT) : [];
    const saved = tokens.map((token, index) => separator(token) ? token : reading(entry?.readings?.[index]));
    const readings = tokens.map((token, index) => separator(token) ? token : saved[index] || reading(mapping[token]));
    const filled = tokens.reduce((count, token, index) => count + (!separator(token) && !saved[index] && readings[index] ? 1 : 0), 0);
    return { readings, text: recordText(entry, tokens, saved, readings), wordReading: wordReadingFrom(tokens, readings, state.words), filled };
  }
  function addWord(value, language, { id, start, end, meaning }) {
    const next = normalize(value, language);
    if (!wordId(id) || Object.hasOwn(next.words, id)) throw Error("词组编号无效或重复。");
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= next.draft.length) throw Error("请在输入区点击词组的首尾字符。");
    const glyphs = next.draft.slice(start, end + 1);
    if (!glyphs.every(token => valid(token, language))) throw Error("词组不能跨过空格或换行；请分别选择。");
    const text = clean(meaning, 120).trim();
    if (!text) throw Error("请填写词语或含义。");
    const duplicate = Object.entries(next.words).find(([, word]) => word.glyphs.length === glyphs.length && word.glyphs.every((token, index) => token === glyphs[index]));
    if (duplicate) next.words[duplicate[0]].meaning = text;
    else next.words[id] = { glyphs, meaning: text };
    return next;
  }
  function formatted(value, language, text) {
    const next = normalize(value, language), source = transcript(next, language);
    if (!source.spans.length) throw Error("请先输入字符。");
    if (typeof text !== "string" || text.length > MAX_TEXT) throw Error("分词文本过长。");
    const aligned = textFormat.reflow(source, text);
    next.formatted = { source: source.text, text: aligned.text };
    return next;
  }
  function saveReading(value, language, { id, title = "", cycle = "", createdAt = new Date().toISOString() }) {
    const next = normalize(value, language), source = transcript(next, language);
    if (!source.spans.length) throw Error("请先输入字符。");
    if (!recordId(id) || Object.hasOwn(next.records, id)) throw Error("记录编号无效或重复。");
    let text = source.text;
    if (next.formatted) {
      if (next.formatted.source !== source.text) throw Error("字符或对应已变化，请更新分词或清除整理结果后再保存。");
      text = textFormat.reflow(source, next.formatted.text).text;
    }
    next.records[id] = { tokens: next.draft.slice(), readings: source.readings, text, wordReading: wordReading(next, language),
      title: clean(title, 120).trim(), cycle, createdAt };
    return next;
  }
  function inputText(value, language, text) {
    const next = normalize(value, language), added = [];
    for (const char of String(text)) {
      if (/\s/.test(char)) { added.push(char === "\n" ? "\n" : " "); continue; }
      const matches = catalog[language].filter(glyph => next.mapping[glyph.index] === char);
      const letterMatches = matches.filter(glyph => glyph.category !== "special");
      const choice = letterMatches.length ? letterMatches : matches;
      if (choice.length !== 1) throw Error(`“${char}”没有唯一字符对应，请先设置对应或从字形键盘点选。`);
      added.push(choice[0].index);
    }
    if (next.draft.length + added.length > MAX_INPUT) throw Error(`一次最多输入 ${MAX_INPUT} 个字符。`);
    next.draft.push(...added);
    return next;
  }
  function reference(value, language) {
    const next = normalize(value, language);
    for (const glyph of catalog[language]) if (!next.mapping[glyph.index]) next.mapping[glyph.index] = glyph.reference;
    return next;
  }
  function setWordData(words) { formatter = textFormat.create(words); }
  function suggest(value, language) {
    if (!formatter) throw Error("离线词表尚未加载。");
    const next = normalize(value, language), source = transcript(next, language);
    const words = Object.values(next.words).map(word => word.meaning).filter(text => /^[A-Za-z]{2,40}$/.test(text));
    return formatted(next, language, formatter.suggest(source, { punctuate: false, extraWords: words }).text);
  }
  return { normalize, transcript, wordReading, addWord, formatted, saveReading, recordView, inputText, reference, setWordData, suggest,
    catalog, MAX_INPUT };
});
