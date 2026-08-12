/**
 * 多线程并发调用 DeepSeek API，为抉择矩阵每个格子生成剧情总结。
 *
 * 改进：
 * - 并发请求（CONCURRENCY 控制）
 * - 每条 note 独立按正确索引（book + chapterKey + entryId）定位段落
 * - 段落太短时自动找同 chapter 内引用它的上游段落作为上下文
 * - 一个格子有多个来源段落时全部总结
 *
 * 用法: node tools/run-summarize.js
 */

const fs = require("fs");
const vm = require("vm");

// ==================== 配置 ====================
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "YOUR_KEY_HERE";
const MODEL = "deepseek-chat";
const API_URL = "https://api.deepseek.com/chat/completions";
const OUTPUT_FILE = "tools/matrix-summaries.json";
const CONCURRENCY = 8;
const SHORT_THRESHOLD = 200;
// ================================================

// --- 加载数据 ---
const html = fs.readFileSync("record/index.html", "utf-8");
const sbRaw = fs.readFileSync("story/data/storybook-data.js", "utf-8");

// 解析 choiceMatrixNotes
const notesStart = html.indexOf("const choiceMatrixNotes = {");
const notesEnd = html.indexOf("\n    };", notesStart);
const notesBlock = html.slice(notesStart + "const choiceMatrixNotes = ".length, notesEnd + 6);
const choiceMatrixNotes = new Function("return " + notesBlock)();

// 解析 storybook
const sbCtx = { window: {} };
vm.createContext(sbCtx);
vm.runInContext(sbRaw, sbCtx);
const storybook = sbCtx.window.STORYBOOK_DATA;

// --- 建立索引 ---
// bookId -> Map<entryId, entry>
const bookEntryMap = {};
// bookId -> chapterKey -> entry[]
const bookChapterEntries = {};

for (const book of storybook.books) {
  const entryMap = new Map();
  const chapterMap = {};
  for (const entry of book.entries) {
    entryMap.set(entry.id, entry);
    if (!chapterMap[entry.chapterKey]) chapterMap[entry.chapterKey] = [];
    chapterMap[entry.chapterKey].push(entry);
  }
  bookEntryMap[book.id] = entryMap;
  bookChapterEntries[book.id] = chapterMap;
}

// --- 工具函数 ---

/**
 * 从 note 字符串解析出 bookId, chapterKey, entryId
 * 格式: "C1 | 主线故事 - 迷宫真相 > 0101 line 98: ..."
 *        "C3 | 冒险枢纽 04 - 蜡与承诺 > 0006 line 13: ..."
 *        "C1 | 内蕴奥德赛 > 12 阿尔戈尼特人 (The Argonites) > 12-the-argonites line 13: ..."
 */
function parseNote(note) {
  // 匹配 C{num}（可能不在开头，如 "后文检查于 C3 | ..."）
  const bookMatch = note.match(/C(\d)\s*\|/);
  if (!bookMatch) return null;
  const bookId = "c" + bookMatch[1];

  // 匹配 entry id: "> {id} line" 或 "> {slug} line"
  // 最后一个 > ... line 模式就是 entry 标识
  const segments = note.split(">");
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].trim();
    const m = seg.match(/^(\S+)\s+line\s+(\d+)/);
    if (m) {
      const entryId = m[1];
      return { bookId, entryId };
    }
  }
  return null;
}

/**
 * 获取 entry 的文本，如果太短则找引用它的上游 entry
 * 搜索策略：先同 chapter + 同 encounter，再同 chapter，再全书同类型章节
 */
function getEntryWithContext(bookId, entryId) {
  const entryMap = bookEntryMap[bookId];
  if (!entryMap) return null;
  const entry = entryMap.get(entryId);
  if (!entry) return null;

  let text = entry.text;
  if (text.length >= SHORT_THRESHOLD) {
    return { entryId, text: truncate(text) };
  }

  // 段落太短，找引用此 entry 的上游段落
  const refPattern = new RegExp("(?:请参阅|参阅|参见|返回|前往|查看|见|See|Go to|Return to)[^0-9M]{0,16}" + escapeRegex(entryId) + "\\b");

  // 第一优先：同 chapter（正确区分主线和 hub）
  const chapterEntries = bookChapterEntries[bookId]?.[entry.chapterKey] || [];
  let parentEntry = findParent(chapterEntries, entryId, refPattern);

  // 第二优先：全书所有 entry（跨 hub 跳转的情况）
  if (!parentEntry) {
    const allEntries = [];
    for (const arr of Object.values(bookChapterEntries[bookId] || {})) {
      allEntries.push(...arr);
    }
    parentEntry = findParent(allEntries, entryId, refPattern);
  }

  if (parentEntry) {
    return {
      entryId,
      text: truncate(parentEntry.text) + "\n\n---\n[接续] 段落 " + entryId + ":\n" + truncate(text),
    };
  }

  return { entryId, text: truncate(text) };
}

function findParent(entries, entryId, refPattern) {
  let best = null;
  for (const candidate of entries) {
    if (candidate.id === entryId) continue;
    if (refPattern.test(candidate.text)) {
      if (!best || candidate.text.length > best.text.length) {
        best = candidate;
      }
    }
  }
  return best;
}

function truncate(text, max = 3000) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...（截断）";
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 为一个格子构建所有来源段落的上下文
 * 返回 { contexts: [{noteDesc, text}], hasMultiple }
 */
function buildCellContexts(code, notesList) {
  const contexts = [];
  const seenEntries = new Set();

  for (const note of notesList) {
    const parsed = parseNote(note);
    if (!parsed) {
      // 无法解析（如"后文检查于"、"疑似来源"等特殊格式），用原始 note 作为描述
      contexts.push({ noteDesc: note, text: null });
      continue;
    }

    const key = parsed.bookId + ":" + parsed.entryId;
    if (seenEntries.has(key)) continue;
    seenEntries.add(key);

    const result = getEntryWithContext(parsed.bookId, parsed.entryId);
    if (result) {
      // 从 note 中提取冒号后的简短描述
      const descMatch = note.match(/line\s+\d+:\s*(.+)/);
      const desc = descMatch ? descMatch[1].trim() : note;
      contexts.push({ noteDesc: desc, text: result.text });
    } else {
      contexts.push({ noteDesc: note, text: null });
    }
  }

  return contexts;
}

// --- API 调用 ---
async function callAPI(code, contexts) {
  const parts = [];
  parts.push("你是桌游 Aeon Trespass: Odyssey 的剧情记录员。");
  parts.push("以下是抉择矩阵格子 " + code + " 对应的故事书原文段落：");
  parts.push("");

  if (contexts.length === 1) {
    const ctx = contexts[0];
    if (ctx.text) {
      parts.push("【来源】" + ctx.noteDesc);
      parts.push(ctx.text);
    } else {
      parts.push("【来源说明】" + ctx.noteDesc);
    }
  } else {
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];
      parts.push("━━━ 来源 " + (i + 1) + " ━━━");
      parts.push("【" + ctx.noteDesc + "】");
      if (ctx.text) parts.push(ctx.text);
      else parts.push("（无原文，仅有标注说明）");
      parts.push("");
    }
  }

  parts.push("");
  if (contexts.length > 1) {
    parts.push('这个格子有多个标记来源。请分别为每个来源写一段总结（每段2-4句），说明在什么情境下会标记此格：发生了什么、面临什么选择、选了什么导致标记。用中文写，像给朋友复述剧情。不要出现格子编号。用"来源1："、"来源2："等分段。');
  } else {
    parts.push('请用一段话（3-5句）总结导致此格被标记的剧情：发生了什么情况、玩家面临什么选择、选了什么（结果/代价）。用中文写，像给朋友复述剧情。不要出现格子编号。');
  }

  const prompt = parts.join("\n");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + DEEPSEEK_API_KEY },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: prompt }], temperature: 0.4, max_tokens: 600 }),
  });
  if (!res.ok) throw new Error("API " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// --- 主流程：并发控制 ---
async function main() {
  const codes = Object.keys(choiceMatrixNotes);

  // 加载已有结果
  let results = {};
  try { results = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8")); } catch {}

  const todo = codes.filter(c => !results[c] || String(results[c]).startsWith("[ERROR]"));
  console.log("总计: " + codes.length + " | 已完成: " + (codes.length - todo.length) + " | 待处理: " + todo.length);
  if (todo.length === 0) { console.log("全部完成！"); return; }

  let done = 0;
  let errors = 0;
  let running = 0;
  let idx = 0;

  await new Promise((resolve) => {
    function next() {
      if (idx >= todo.length && running === 0) { resolve(); return; }

      while (running < CONCURRENCY && idx < todo.length) {
        const code = todo[idx++];
        running++;
        processOne(code).then(() => { running--; next(); });
      }
    }

    async function processOne(code) {
      const contexts = buildCellContexts(code, choiceMatrixNotes[code]);
      // 如果所有来源都没有找到原文，跳过
      const hasText = contexts.some(c => c.text);
      if (!hasText) {
        results[code] = contexts.map(c => c.noteDesc).join(" / ");
        done++;
        console.log("[" + (codes.length - todo.length + done) + "/" + codes.length + "] " + code + ": (无原文) " + results[code].slice(0, 60));
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");
        return;
      }

      try {
        const summary = await callAPI(code, contexts);
        results[code] = summary;
        done++;
        console.log("[" + (codes.length - todo.length + done) + "/" + codes.length + "] " + code + ": " + summary.slice(0, 80) + "...");
      } catch (err) {
        errors++;
        results[code] = "[ERROR] " + err.message;
        console.error("[ERR] " + code + ": " + err.message);
      }
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");
    }

    next();
  });

  console.log("\n完成！成功: " + done + " 失败: " + errors + " 总计: " + Object.keys(results).length);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
