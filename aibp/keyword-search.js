(function () {
  'use strict';
  const scriptUrl = document.currentScript.src;
  const panel = document.getElementById('keywordPanel');
  const searchPanel = document.getElementById('keywordSearchPanel');
  const input = document.getElementById('keywordInput');
  const results = document.getElementById('keywordResults');
  const openButton = document.getElementById('keywordButton');
  let dictionary = null, loading = null, composing = false, loadError = false;

  function parseDefinition(html) {
    const parts = String(html || '').split(/<\s*hr\s*\/?\s*>/gi).map(part => {
      const source = part.replace(/<\s*br\s*\/?\s*>/gi, '\n').replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n');
      const parsed = new DOMParser().parseFromString(source, 'text/html');
      parsed.querySelectorAll('script,style').forEach(node => node.remove());
      const headings = Array.from(parsed.querySelectorAll('font[size="+2"]'), node => node.textContent.trim()).filter(Boolean);
      const text = (parsed.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
      const tokens = [];
      function visit(node) {
        if (node.nodeType === 3) { tokens.push({ text: node.textContent }); return; }
        if (node.nodeType !== 1) return;
        const href = node.tagName === 'A' && node.getAttribute('href');
        if (href && /^dic:\/\//i.test(href)) {
          let target = href.slice(6);
          try { target = decodeURIComponent(target); } catch (_) { /* Keep malformed names searchable. */ }
          tokens.push({ text: node.textContent, target });
        } else Array.from(node.childNodes).forEach(visit);
      }
      Array.from(parsed.body.childNodes).forEach(visit);
      return { text, headings, tokens, lang: /[\u3400-\u9fff]/.test(headings[0] || '') ? 'zh' : 'en' };
    });
    return { text: parts.map(part => part.text).join('\n\n'), headings: parts.flatMap(part => part.headings), parts };
  }
  function followReference(target, label, origin) {
    const entry = dictionary.entryFor(target) || dictionary.entryFor(label);
    const notice = origin.closest('.card-keywords-draw');
    let destination = results;
    if (notice) {
      // Keep card resolution untouched while following a reference in a zoom.
      destination = notice.querySelector('.keyword-linked-lookup');
      if (!destination) {
        destination = document.createElement('div');
        destination.className = 'keyword-linked-lookup';
        notice.append(destination);
      }
    } else {
      input.value = target;
      searchPanel.open = true;
    }
    if (entry) {
      const language = origin.closest('.keyword-entry')?.dataset.keywordLanguage;
      const detail = renderEntry(entry, { language });
      detail.open = true;
      destination.replaceChildren(detail);
      destination.scrollTop = 0;
      detail.querySelector('summary').focus({ preventScroll: true });
    } else destination.textContent = `未找到关联词条：${target}`;
    destination.scrollIntoView({ block: 'nearest' });
  }
  function appendPart(container, part) {
    const block = document.createElement('div');
    block.className = 'keyword-definition-part';
    for (const token of part.tokens) {
      if (token.target) {
        const link = document.createElement('a');
        link.href = '#keywordResults';
        link.textContent = token.text;
        link.dataset.keywordTarget = token.target;
        link.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          followReference(token.target, token.text, link);
        });
        block.append(link);
      } else block.append(document.createTextNode(token.text));
    }
    container.append(block);
  }
  function renderEntry(entry, options = {}) {
    const selected = options.language || window.ATO_LANGUAGE?.get?.() || 'fan';
    const language = selected === 'official' ? 'official' : selected === 'en' ? 'en' : options.language ? 'zh' : '';
    const detail = document.createElement('details');
    detail.className = 'keyword-entry';
    detail.dataset.keywordId = entry.id;
    detail.dataset.keywordLanguage = language;
    // Keep source definitions independent of automatic terminology replacement.
    detail.dataset.languageIgnore = '';
    const title = document.createElement('summary');
    title.textContent = language === 'official' ? (entry.officialName || entry.zh || entry.title) : language === 'en' ? (entry.en || entry.title)
      : language === 'zh' ? (entry.zh || entry.title) : entry.title;
    const definition = document.createElement('div');
    definition.className = 'keyword-definition';
    if (entry.note) {
      const note = document.createElement('small');
      note.className = 'keyword-source-note';
      note.textContent = entry.note;
      definition.append(note);
    }
    if (language === 'official') {
      const text = document.createElement('div');
      text.className = 'keyword-definition-part';
      const fanPart = (entry.parts || []).find(part => part.lang === 'zh');
      if (!entry.officialDefinition && fanPart) appendPart(definition, fanPart);
      else {
        text.textContent = entry.officialDefinition || '暂无中文释义';
        definition.append(text);
      }
      detail.append(title, definition);
      return detail;
    }
    const seen = new Set();
    const parts = (entry.parts || []).filter(part => {
      if (language && part.lang !== language) return false;
      if (!part.text || seen.has(part.text)) return false;
      seen.add(part.text);
      return true;
    });
    const languages = ['zh', 'en'].filter(lang => parts.some(part => part.lang === lang));
    if (languages.length === 2) definition.classList.add('keyword-bilingual');
    for (const lang of languages) {
      const column = document.createElement('div');
      column.className = 'keyword-language';
      column.lang = lang;
      parts.filter(part => part.lang === lang).forEach(part => appendPart(column, part));
      definition.append(column);
    }
    if (!parts.length) {
      const text = document.createElement('div');
      text.textContent = language === 'en' ? 'No English definition available.'
        : language === 'zh' ? '暂无中文释义' : entry.text || '未找到对应释义';
      definition.append(text);
    }
    detail.append(title, definition);
    return detail;
  }
  function render() {
    results.replaceChildren();
    if (loadError) { results.textContent = '关键词词典加载失败，请点击上方关键词查询重试。'; return; }
    if (!dictionary) { results.textContent = '正在加载词典…'; return; }
    if (!input.value.trim()) { results.textContent = '输入中文或英文关键词以查询释义。'; return; }
    const matches = dictionary.search(input.value);
    if (!matches.length) { results.textContent = '没有找到匹配的关键词。'; return; }
    const count = document.createElement('p');
    count.className = 'keyword-count';
    count.textContent = `找到 ${matches.length} 条结果`;
    results.append(count);
    matches.forEach(entry => results.append(renderEntry(entry)));
    if (matches.length === 1) results.querySelector('details').open = true;
  }
  async function load() {
    if (dictionary) return dictionary;
    if (!loading) {
      loadError = false;
      render();
      loading = fetch(new URL('ato-keywords.json?v=10', scriptUrl)).then(response => {
        if (!response.ok) throw new Error('Dictionary unavailable');
        return response.json();
      }).then(data => {
        if (!Array.isArray(data.entries) || !data.entries.length) throw new Error('Invalid dictionary');
        dictionary = window.AibpKeywordDictionary.build(data.entries, parseDefinition);
        render();
        return dictionary;
      }).catch(() => { loading = null; loadError = true; render(); return null; });
    }
    return loading;
  }
  openButton.addEventListener('click', () => {
    searchPanel.open = true;
    panel.scrollIntoView({ block: 'center', behavior: 'smooth' });
    input.focus({ preventScroll: true });
    void load();
  });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; render(); });
  input.addEventListener('input', () => { if (!composing) render(); });
  window.addEventListener?.('ato-language-changed', () => render());
  window.AibpKeywords = { load, renderEntry };
  void load();
})();
