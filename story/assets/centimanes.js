/* Centimanes: the sixteen quadrant glyphs shown in the user's reference video.
 * Digit meanings are learned by the player, never inferred from the glyph mask.
 * A saved record keeps the digits it was saved with; symbols still unknown at
 * that moment follow the current mapping, so old notes fill in as it is solved.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ATO_CENTIMANES = api;
})(typeof window === "object" ? window : this, function () {
  "use strict";
  const MAX_INPUT = 256;
  const validGlyph = n => Number.isInteger(n) && n >= 0 && n < 16;
  const digit = value => /^[0-9]$/.test(String(value ?? "")) ? String(value) : "";
  const plain = value => value && typeof value === "object" && !Array.isArray(value);
  const glyphs = value => Array.isArray(value) ? value.filter(validGlyph) : [];

  function normalize(value) {
    const result = { version: 1, mapping: {}, draft: glyphs(value?.draft), records: {} };
    if (plain(value?.mapping)) {
      for (let index = 0; index < 16; index++) {
        const number = digit(value.mapping[index]);
        if (number !== "") result.mapping[index] = number;
      }
    }
    if (plain(value?.records)) {
      for (const [id, entry] of Object.entries(value.records)) {
        if (!/^cent-[A-Za-z0-9_-]{1,95}$/.test(id) || !plain(entry)) continue;
        const symbols = glyphs(entry.glyphs);
        if (!symbols.length || symbols.length !== entry.glyphs.length) continue;
        result.records[id] = {
          glyphs: symbols,
          digits: symbols.map((_, i) => digit(entry.digits?.[i])),
          title: typeof entry.title === "string" ? entry.title.slice(0, 120) : "",
          createdAt: typeof entry.createdAt === "string" ? entry.createdAt : "",
          cycle: /^c[1-5]$/.test(entry.cycle) ? entry.cycle : "",
        };
      }
    }
    return result;
  }

  function translate(symbols, mapping) {
    return symbols.map(index => digit(mapping?.[index]));
  }

  // Display view of a saved record. Recorded digits are history and never
  // change; symbols that had no digit when the record was saved are read with
  // the current mapping, so a solved cipher makes old records readable.
  function recordView(entry, mapping) {
    const symbols = glyphs(entry?.glyphs);
    const saved = symbols.map((_, index) => digit(entry?.digits?.[index]));
    const digits = symbols.map((symbol, index) => saved[index] || digit(mapping?.[symbol]));
    return { digits, filled: digits.filter((number, index) => number && !saved[index]).length };
  }

  function saveReading(value, { id, title = "", cycle = "", createdAt = new Date().toISOString() }) {
    const next = normalize(value);
    if (!next.draft.length) throw Error("请先输入符号。");
    if (!/^cent-[A-Za-z0-9_-]{1,95}$/.test(id) || Object.hasOwn(next.records, id)) throw Error("记录编号无效或重复。");
    next.records[id] = {
      glyphs: next.draft.slice(), digits: translate(next.draft, next.mapping),
      title: String(title).trim().slice(0, 120), cycle, createdAt,
    };
    return next;
  }

  // Bits follow the video keyboard: top-left, top-right, bottom-right, bottom-left.
  // Each corner is either a small square or a filled quadrant; no image assets.
  function glyphSvg(index) {
    if (!validGlyph(index)) return "";
    const positions = [[4, 4], [36, 4], [36, 36], [4, 36]];
    const rects = positions.map(([x, y], bit) => {
      const size = index & (1 << bit) ? 20 : 7;
      return `<rect x="${x === 36 ? x - size : x}" y="${y === 36 ? y - size : y}" width="${size}" height="${size}" fill="#111"/>`;
    }).join("");
    return `<svg viewBox="0 0 40 40" class="cent-glyph" aria-hidden="true"><rect width="40" height="40" fill="#fff"/>${rects}</svg>`;
  }

  function mount(host, options) {
    if (!host) return { render() {} };
    let editing = false;
    let selected = null;
    let removed = null;
    host.innerHTML = `
      <p class="cent-help">点选符号输入密文；用「编辑数字对应」记下已学会的数字。未知符号显示 ?。已保存记录里保存时未知的符号，会随之后的数字对应自动补全。</p>
      <div class="cent-mode"><button type="button" class="secondary" data-cent="edit" aria-pressed="false">编辑数字对应</button><span data-cent="mode-hint">输入模式</span></div>
      <div class="cent-keyboard" role="group" aria-label="百臂巨人语符号键盘"></div>
      <form class="cent-editor" hidden>
        <div data-cent="selected-glyph"></div>
        <label>对应数字<input data-cent="digit" type="text" inputmode="numeric" pattern="[0-9]" maxlength="1" autocomplete="off" placeholder="0–9" aria-label="符号对应数字"></label>
        <div class="cent-actions"><button type="submit">保存对应</button><button type="button" class="secondary" data-cent="unknown">设为未知</button><button type="button" class="secondary" data-cent="cancel">取消</button></div>
      </form>
      <div class="cent-draft" aria-label="当前百臂巨人语密文"><div data-cent="draft"></div><p data-cent="empty">从上面的键盘点选符号</p></div>
      <div class="cent-reading"><span>当前译文</span><output data-cent="reading" aria-live="polite">—</output></div>
      <div class="cent-actions"><button type="button" class="secondary" data-cent="backspace">撤销输入</button><button type="button" class="secondary" data-cent="clear">清空输入</button></div>
      <div class="cent-save"><label>记录名称 / 段落（可选）<input data-cent="title" type="text" maxlength="120" placeholder="例如：主线 0046"></label><button type="button" data-cent="save">保存记录</button></div>
      <div class="cent-feedback"><span role="status" data-cent="status"></span><button type="button" class="secondary" data-cent="undo-delete" hidden>撤销删除</button></div>
      <details class="cent-history" open><summary>已保存记录 <span data-cent="count">0</span></summary><div data-cent="history"></div></details>`;
    const find = name => host.querySelector(`[data-cent="${name}"]`);
    const keyboard = host.querySelector(".cent-keyboard");
    const editor = host.querySelector(".cent-editor");
    const status = message => { find("status").textContent = message; };
    const commit = next => { options.change(next); render(); };
    const closeEditor = () => { selected = null; editor.hidden = true; };
    const makeButton = (label, action) => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "secondary";
      button.textContent = label; button.addEventListener("click", action);
      return button;
    };
    function sequence(container, symbols, numbers) {
      container.replaceChildren();
      symbols.forEach((index, position) => {
        const cell = document.createElement("span");
        cell.className = "cent-symbol";
        cell.setAttribute("aria-label", `符号 ${index + 1}：${numbers[position] || "未知"}`);
        cell.innerHTML = glyphSvg(index);
        const number = document.createElement("span");
        number.textContent = numbers[position] || "?";
        cell.appendChild(number); container.appendChild(cell);
      });
    }
    for (let index = 0; index < 16; index++) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "cent-key"; button.dataset.centGlyph = index;
      button.innerHTML = glyphSvg(index) + '<span class="cent-digit"></span>';
      button.addEventListener("click", () => {
        const current = normalize(options.read());
        if (editing) {
          selected = index; editor.hidden = false;
          find("selected-glyph").innerHTML = glyphSvg(index);
          find("digit").value = current.mapping[index] || "";
          find("digit").focus();
          return;
        }
        if (current.draft.length >= MAX_INPUT) { status(`一次最多输入 ${MAX_INPUT} 个符号。`); return; }
        current.draft.push(index); commit(current); status("");
      });
      keyboard.appendChild(button);
    }
    find("edit").addEventListener("click", () => {
      editing = !editing; closeEditor(); render();
      status(editing ? "点选要修改数字对应的符号。" : "");
    });
    editor.addEventListener("submit", event => {
      event.preventDefault();
      if (selected === null) return;
      const number = digit(find("digit").value);
      if (number === "") { status("请输入一个 0–9 的数字，或选择「设为未知」。"); return; }
      const next = normalize(options.read());
      next.mapping[selected] = number; closeEditor(); commit(next); status("数字对应已保存。");
    });
    find("unknown").addEventListener("click", () => {
      if (selected === null) return;
      const next = normalize(options.read());
      delete next.mapping[selected]; closeEditor(); commit(next); status("该符号已设为未知。");
    });
    find("cancel").addEventListener("click", closeEditor);
    find("backspace").addEventListener("click", () => {
      const next = normalize(options.read()); next.draft.pop(); commit(next); status("");
    });
    find("clear").addEventListener("click", () => {
      const next = normalize(options.read()); next.draft = []; commit(next); status("");
    });
    find("save").addEventListener("click", () => {
      try {
        const id = "cent-" + (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
        const next = saveReading(options.read(), { id, title: find("title").value, cycle: options.cycle() });
        commit(next); find("title").value = ""; status("记录已添加。");
      } catch (error) { status(error.message); }
    });
    find("undo-delete").addEventListener("click", () => {
      if (!removed || removed.context !== options.context()) { removed = null; render(); return; }
      const next = normalize(options.read()); next.records[removed.id] = removed.entry;
      removed = null; commit(next); status("记录已恢复。");
    });
    function render() {
      const current = normalize(options.read());
      find("edit").setAttribute("aria-pressed", String(editing));
      find("edit").textContent = editing ? "完成编辑" : "编辑数字对应";
      find("mode-hint").textContent = editing ? "编辑模式 · 点选符号修改数字" : "输入模式";
      keyboard.querySelectorAll(".cent-key").forEach(button => {
        const index = Number(button.dataset.centGlyph), number = current.mapping[index] || "?";
        button.querySelector(".cent-digit").textContent = number;
        button.setAttribute("aria-label", `符号 ${index + 1}，${number === "?" ? "未知" : "数字 " + number}`);
        button.classList.toggle("is-known", number !== "?");
      });
      const numbers = translate(current.draft, current.mapping);
      sequence(find("draft"), current.draft, numbers);
      find("empty").hidden = current.draft.length > 0;
      find("reading").textContent = numbers.length ? numbers.map(n => n || "?").join("") : "—";
      ["save", "clear", "backspace"].forEach(name => { find(name).disabled = current.draft.length === 0; });
      if (removed && removed.context !== options.context()) removed = null;
      find("undo-delete").hidden = !removed;
      const entries = Object.entries(current.records).sort((a, b) => b[1].createdAt.localeCompare(a[1].createdAt) || b[0].localeCompare(a[0]));
      find("count").textContent = String(entries.length);
      const history = find("history"); history.replaceChildren();
      if (!entries.length) { const empty = document.createElement("p"); empty.className = "cent-help"; empty.textContent = "还没有保存的密文记录。"; history.appendChild(empty); }
      entries.forEach(([id, entry]) => {
        const row = document.createElement("article"); row.className = "cent-record";
        const heading = document.createElement("strong"); heading.textContent = entry.title || "密文记录";
        const view = recordView(entry, current.mapping);
        const symbols = document.createElement("div"); symbols.className = "cent-record-symbols";
        sequence(symbols, entry.glyphs, view.digits);
        const reading = document.createElement("p"); reading.className = "cent-record-reading";
        reading.textContent = view.digits.map(n => n || "?").join("");
        reading.setAttribute("aria-label", "译文");
        const actions = document.createElement("div"); actions.className = "cent-actions";
        actions.appendChild(makeButton("载入", () => {
          const next = normalize(options.read()); next.draft = entry.glyphs.slice();
          editing = false; closeEditor(); commit(next); status("已载入符号，当前译文使用现有数字对应。");
        }));
        actions.appendChild(makeButton("删除", () => {
          const next = normalize(options.read());
          removed = { id, entry: next.records[id], context: options.context() };
          delete next.records[id]; commit(next); status("记录已删除，可撤销。");
        }));
        row.append(heading, symbols, reading);
        if (view.filled) {
          const note = document.createElement("p"); note.className = "cent-help";
          note.textContent = `保存时未知的 ${view.filled} 个符号已按当前对应补全。`;
          row.append(note);
        }
        row.append(actions); history.appendChild(row);
      });
    }
    render();
    return { render };
  }
  return { normalize, translate, saveReading, recordView, glyphSvg, mount, MAX_INPUT };
});
