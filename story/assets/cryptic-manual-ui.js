(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./cryptic-manual.js") : root.ATO_CRYPTIC_MANUAL);
  if (node) module.exports = api; else root.ATO_CRYPTIC_MANUAL_UI = api;
})(typeof window === "object" ? window : this, function (manual) {
  "use strict";
  let wordLoad = null, wordReady = false;
  function loadWords() {
    if (wordReady) return Promise.resolve();
    if (window.ATO_CRYPTIC_WORD_DATA) { manual.setWordData(window.ATO_CRYPTIC_WORD_DATA); wordReady = true; return Promise.resolve(); }
    if (!wordLoad) wordLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "./assets/cryptic/word-data.js?v=20261004-manual1";
      script.onload = () => { manual.setWordData(window.ATO_CRYPTIC_WORD_DATA); wordReady = true; resolve(); };
      script.onerror = () => { script.remove(); wordLoad = null; reject(Error("离线词表加载失败，请重试；仍可手动添加空格。")); };
      document.head.appendChild(script);
    });
    return wordLoad;
  }
  function mount(host, language, options) {
    const name = language === "babelian" ? "巴别语" : "塞壬语";
    const glyphs = manual.catalog[language];
    let editing = false, selected = null, range = null, rangeDone = false, lastDraft = "", formatDirty = false, removed = null;
    const id = prefix => prefix + (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
    host.innerHTML = `
      <p class="cent-help">${language === "siren" ? "按你确认的螺旋读序点选字符。对照方向只旋转键盘字形，不推断几何读序。" : "点选字形记录原文，用「编辑字符对应」记下已学会的字母、词语或含义。"}未知对应显示 [?]。已保存记录里保存时未知的字符，会随之后的字符对应自动补全。</p>
      <div class="cent-mode"><button type="button" class="secondary" data-manual="edit" aria-pressed="false">编辑字符对应</button><button type="button" class="secondary" data-manual="reference">补齐参考字符对应</button></div>
      <details class="manual-keyboard-panel" open><summary>字形键盘 · ${glyphs.length} 个字符</summary>
        ${language === "babelian" ? '<label class="manual-filter">字形分类<select data-manual="filter"><option value="all">全部字形</option><option value="upper">大写字形</option><option value="lower">小写字形</option><option value="special">词语与符号</option></select></label>' : '<label class="manual-filter">键盘对照方向<select data-manual="rotation"><option value="0">正下方 · 0°</option><option value="90">正左方 · 90°</option><option value="180">正上方 · 180°</option><option value="270">正右方 · −90°</option></select></label>'}
        <div class="cent-keyboard manual-keyboard" role="group" aria-label="${name}字形键盘"></div>
      </details>
      <form class="cent-editor manual-editor" hidden><div data-manual="selected-glyph"></div><label>字符对应（字母、词语或含义）<input data-manual="mapping" maxlength="40" autocomplete="off"></label><div class="cent-actions"><button type="submit">保存对应</button><button type="button" class="secondary" data-manual="unknown">设为未知</button><button type="button" class="secondary" data-manual="cancel">取消</button></div></form>
      <details class="manual-text-input"><summary>用键盘录入已记字符</summary><label>录入文本<input data-manual="input" maxlength="256" autocomplete="off" placeholder="须先设置唯一字符对应"></label><button type="button" data-manual="type">录入文本</button></details>
      <p class="cent-help manual-selection-help">点击输入区的首尾字符，可把连续字符记成词组。</p>
      <div class="cent-draft manual-draft" aria-label="当前${name}字符"><div data-manual="draft"></div><p data-manual="empty">从字形键盘点选字符</p></div>
      <div class="manual-reading"><span>逐字读法</span><output data-manual="reading" aria-live="polite">—</output></div>
      <div class="manual-reading"><span>词组含义</span><output data-manual="word-reading">—</output></div>
      <div class="cent-actions"><button type="button" class="secondary" data-manual="space">添加空格</button><button type="button" class="secondary" data-manual="newline">换行</button><button type="button" class="secondary" data-manual="backspace">撤销输入</button><button type="button" class="secondary" data-manual="clear">清空输入</button></div>
      <form class="manual-word-form"><p class="cent-help" data-manual="selected-range">尚未选择词组</p><label>词语 / 含义<input data-manual="meaning" maxlength="120" autocomplete="off" placeholder="例如 HELLO 或「你好」"></label><button type="submit" data-manual="word-save" disabled>保存词组</button></form>
      <details class="manual-format" open><summary>连字成词</summary><p class="cent-help">可手动调整空格和标点，或生成离线分词建议。要改字符，请修改对应或重新点选。</p><label>分词文本<textarea data-manual="formatted" rows="3" maxlength="14000" spellcheck="false"></textarea></label><p class="cent-help" data-manual="format-status"></p><div class="cent-actions"><button type="button" data-manual="format-apply">应用分词</button><button type="button" class="secondary" data-manual="suggest">离线分词建议</button><button type="button" class="secondary" data-manual="format-clear">清除分词</button></div></details>
      <div class="cent-save"><label>记录名称 / 段落（可选）<input data-manual="title" maxlength="120" placeholder="例如：主线 0046"></label><button type="button" data-manual="save">保存记录</button></div>
      <div class="cent-feedback"><span role="status" data-manual="status"></span><button type="button" class="secondary" data-manual="undo-delete" hidden>撤销删除</button></div>
      <details class="cent-history manual-words"><summary>已记词组 <span data-manual="word-count">0</span></summary><div data-manual="words"></div></details>
      <details class="cent-history" open><summary>已保存记录 <span data-manual="count">0</span></summary><div data-manual="history"></div></details>`;
    const find = key => host.querySelector(`[data-manual="${key}"]`);
    const status = message => { find("status").textContent = message; };
    const current = () => manual.normalize(options.read(), language);
    const closeEditor = () => { selected = null; host.querySelector(".manual-editor").hidden = true; };
    const commit = next => { options.change(next); render(); };
    const act = action => { try { action(); } catch (error) { status(error.message); } };
    const makeButton = (label, action) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "secondary";
      button.textContent = label; button.addEventListener("click", () => act(action)); return button;
    };
    function image(index) {
      const img = document.createElement("img"); img.src = glyphs[index].src; img.alt = ""; img.className = "manual-glyph"; img.loading = "lazy";
      return img;
    }
    function sequence(container, tokens, readings, interactive = false) {
      container.replaceChildren();
      tokens.forEach((token, index) => {
        if (token === " " || token === "\n") {
          const gap = document.createElement("span"); gap.className = token === "\n" ? "manual-newline" : "manual-space";
          gap.textContent = token === "\n" ? "↵" : "·"; gap.setAttribute("aria-label", token === "\n" ? "换行" : "空格"); container.appendChild(gap); return;
        }
        const cell = document.createElement(interactive ? "button" : "span"); cell.className = "cent-symbol manual-symbol";
        cell.setAttribute("aria-label", `第 ${index + 1} 个字符：字形 ${token + 1}，${readings[index] || "未知"}`);
        if (interactive) {
          cell.type = "button";
          cell.classList.toggle("is-selected", Boolean(range && index >= range.start && index <= range.end));
          cell.addEventListener("click", () => {
            if (!range || rangeDone) { range = { start: index, end: index }; rangeDone = false; }
            else { range = { start: Math.min(range.start, index), end: Math.max(range.start, index) }; rangeDone = true; }
            render();
          });
        }
        const label = document.createElement("span"); label.textContent = readings[index] || "?";
        cell.append(image(token), label); container.appendChild(cell);
      });
    }
    const keyboard = host.querySelector(".manual-keyboard");
    glyphs.forEach(glyph => {
      const button = document.createElement("button"); button.type = "button"; button.className = "cent-key manual-key"; button.dataset.glyph = glyph.index;
      const label = document.createElement("span"); label.className = "manual-key-reading"; button.append(image(glyph.index), label);
      button.addEventListener("click", () => act(() => {
        const next = current();
        if (editing) {
          selected = glyph.index; host.querySelector(".manual-editor").hidden = false;
          find("selected-glyph").replaceChildren(image(glyph.index)); find("mapping").value = next.mapping[glyph.index] || ""; find("mapping").focus(); return;
        }
        if (next.draft.length >= manual.MAX_INPUT) throw Error(`一次最多输入 ${manual.MAX_INPUT} 个字符。`);
        next.draft.push(glyph.index); commit(next); status("");
      }));
      keyboard.appendChild(button);
    });
    find("edit").addEventListener("click", () => { editing = !editing; closeEditor(); render(); status(editing ? "点选字形，记下字符对应。" : ""); });
    find("reference").addEventListener("click", () => act(() => { commit(manual.reference(current(), language)); status("已用仓库参考表补齐未知对应；已有手工对应保留。"); }));
    host.querySelector(".manual-editor").addEventListener("submit", event => {
      event.preventDefault(); act(() => {
        if (selected === null) return;
        const next = current(), value = find("mapping").value.trim();
        if (value) next.mapping[selected] = value; else delete next.mapping[selected];
        closeEditor(); commit(next); status("字符对应已保存。");
      });
    });
    find("unknown").addEventListener("click", () => act(() => { if (selected === null) return; const next = current(); delete next.mapping[selected]; closeEditor(); commit(next); status("已设为未知。"); }));
    find("cancel").addEventListener("click", closeEditor);
    find("filter")?.addEventListener("change", render);
    find("rotation")?.addEventListener("change", render);
    find("type").addEventListener("click", () => act(() => { commit(manual.inputText(current(), language, find("input").value)); find("input").value = ""; status(""); }));
    for (const [key, token] of [["space", " "], ["newline", "\n"]]) find(key).addEventListener("click", () => act(() => {
      const next = current(); if (next.draft.length >= manual.MAX_INPUT) throw Error(`一次最多输入 ${manual.MAX_INPUT} 个字符。`);
      next.draft.push(token); commit(next); status("");
    }));
    find("backspace").addEventListener("click", () => act(() => { const next = current(); next.draft.pop(); commit(next); status(""); }));
    find("clear").addEventListener("click", () => act(() => { const next = current(); next.draft = []; next.formatted = null; formatDirty = false; commit(next); status(""); }));
    host.querySelector(".manual-word-form").addEventListener("submit", event => {
      event.preventDefault(); act(() => {
        if (!range) throw Error("请先在输入区选择词组。");
        const next = manual.addWord(current(), language, { id: id("word-"), ...range, meaning: find("meaning").value });
        range = null; find("meaning").value = ""; commit(next); status("词组及含义已保存。");
      });
    });
    find("formatted").addEventListener("input", () => { formatDirty = true; find("format-status").textContent = "分词编辑尚未应用。"; });
    function applyFormatting() { const next = manual.formatted(current(), language, find("formatted").value); formatDirty = false; commit(next); }
    find("format-apply").addEventListener("click", () => act(() => { applyFormatting(); status("已保留原始字符并应用分词。"); }));
    find("format-clear").addEventListener("click", () => act(() => { const next = current(); next.formatted = null; formatDirty = false; commit(next); status("已清除分词，原始字符保留。"); }));
    find("suggest").addEventListener("click", async () => {
      const before = JSON.stringify(current()), context = options.context(), beforeText = find("formatted").value, beforeDirty = formatDirty;
      find("suggest").disabled = true; status("正在生成离线分词建议…");
      try {
        await loadWords();
        if (context !== options.context() || before !== JSON.stringify(current()) || beforeText !== find("formatted").value || beforeDirty !== formatDirty) throw Error("字符、分词编辑或存档已变化，请重新生成建议。");
        const next = manual.suggest(current(), language); formatDirty = false; commit(next); status("离线建议已生成，可手工调整空格；没有改动字形或字母。");
      } catch (error) { status(error.message); }
      finally { find("suggest").disabled = false; }
    });
    find("save").addEventListener("click", () => act(() => {
      if (formatDirty) applyFormatting();
      const next = manual.saveReading(current(), language, { id: id("crypt-"), title: find("title").value, cycle: options.cycle() });
      commit(next); find("title").value = ""; status("字符、词组读法和分词结果已保存。");
    }));
    find("undo-delete").addEventListener("click", () => act(() => {
      if (!removed || removed.context !== options.context()) return;
      const next = current(); next[removed.kind][removed.id] = removed.entry; removed = null; commit(next); status("已恢复。");
    }));
    function remove(kind, key) {
      const next = current(); removed = { kind, id: key, entry: next[kind][key], context: options.context() };
      delete next[kind][key]; commit(next); status("已删除，可撤销。");
    }
    function render() {
      const next = current(), source = manual.transcript(next, language), signature = JSON.stringify(next.draft);
      if (signature !== lastDraft) { range = null; rangeDone = false; lastDraft = signature; }
      find("edit").textContent = editing ? "完成编辑" : "编辑字符对应"; find("edit").setAttribute("aria-pressed", String(editing));
      keyboard.querySelectorAll(".manual-key").forEach(button => {
        const index = Number(button.dataset.glyph), value = next.mapping[index] || "?", glyph = glyphs[index];
        button.querySelector(".manual-key-reading").textContent = value;
        button.setAttribute("aria-label", `字形 ${index + 1}，${value === "?" ? "未知" : "对应 " + value}`);
        button.hidden = Boolean(find("filter") && find("filter").value !== "all" && find("filter").value !== glyph.category);
        button.querySelector("img").style.transform = `rotate(${find("rotation")?.value || 0}deg)`;
      });
      sequence(find("draft"), next.draft, source.readings, true); find("empty").hidden = Boolean(next.draft.length);
      find("reading").textContent = source.text || "—"; find("word-reading").textContent = manual.wordReading(next, language) || "—";
      find("selected-range").textContent = range ? `已选第 ${range.start + 1}–${range.end + 1} 个字符` : "尚未选择词组";
      find("word-save").disabled = !range;
      for (const key of ["backspace", "clear"]) find(key).disabled = !next.draft.length;
      for (const key of ["save", "format-apply", "suggest"]) find(key).disabled = !source.spans.length;
      if (!formatDirty) find("formatted").value = next.formatted?.text ?? source.text;
      find("format-status").textContent = next.formatted && next.formatted.source !== source.text ? "字符或对应已变化，原分词已保留；请更新分词或清除后再保存。" : formatDirty ? "分词编辑尚未应用。" : next.formatted ? "分词已应用；原始字形顺序保留。" : "尚未应用分词。";
      if (removed?.context !== options.context()) removed = null;
      find("undo-delete").hidden = !removed;
      find("word-count").textContent = String(Object.keys(next.words).length);
      const words = find("words"); words.replaceChildren();
      for (const [key, word] of Object.entries(next.words)) {
        const row = document.createElement("article"); row.className = "cent-record";
        const text = document.createElement("strong"); text.textContent = word.meaning;
        const glyphRow = document.createElement("div"); glyphRow.className = "cent-record-symbols";
        sequence(glyphRow, word.glyphs, word.glyphs.map(token => next.mapping[token] || ""));
        const actions = document.createElement("div"); actions.className = "cent-actions";
        actions.append(makeButton("填入字符", () => {
          const value = current(); if (value.draft.length + word.glyphs.length > manual.MAX_INPUT) throw Error("输入字符过多，请先清空或分段记录。");
          value.draft.push(...word.glyphs); commit(value);
        }), makeButton("删除词组", () => remove("words", key)));
        row.append(text, glyphRow, actions); words.appendChild(row);
      }
      const entries = Object.entries(next.records).sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt) || b[0].localeCompare(a[0]));
      find("count").textContent = String(entries.length); const history = find("history"); history.replaceChildren();
      for (const [key, entry] of entries) {
        const row = document.createElement("article"); row.className = "cent-record";
        const heading = document.createElement("strong"); heading.textContent = entry.title || `${name}记录`;
        const view = manual.recordView(entry, language, next);
        const glyphRow = document.createElement("div"); glyphRow.className = "cent-record-symbols"; sequence(glyphRow, entry.tokens, view.readings);
        const text = document.createElement("p"); text.className = "manual-record-text"; text.textContent = view.text; text.setAttribute("aria-label", "分词文本");
        const meaning = document.createElement("p"); meaning.className = "cent-help"; meaning.textContent = view.wordReading;
        const actions = document.createElement("div"); actions.className = "cent-actions";
        actions.append(makeButton("载入", () => {
          const value = current(); value.draft = entry.tokens.slice();
          const live = manual.recordView(entry, language, value);
          try { value.formatted = manual.formatted(value, language, live.text).formatted; }
          catch { value.formatted = null; }
          formatDirty = false; editing = false; closeEditor(); commit(value);
          status(value.formatted
            ? (live.filled ? "已载入原始字符；保存时未知的字符已按当前对应补全。" : "已载入原始字符和分词。")
            : (live.filled ? "已载入原始字符；记录中的读法与当前对应不同，分词未载入。" : "已载入原始字符；当前读法使用现有对应。"));
        }), makeButton("删除记录", () => remove("records", key)));
        row.append(heading, glyphRow, text, meaning);
        if (view.filled) {
          const note = document.createElement("p"); note.className = "cent-help";
          note.textContent = `保存时未知的 ${view.filled} 个字符已按当前对应补全。`;
          row.append(note);
        }
        row.append(actions); history.appendChild(row);
      }
      if (!entries.length) { const empty = document.createElement("p"); empty.className = "cent-help"; empty.textContent = "还没有保存的字符记录。"; history.appendChild(empty); }
    }
    render(); return { render };
  }
  return { mount };
});
