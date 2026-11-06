/**
 * 调用 DeepSeek API 为抉择矩阵的每个格子生成一句话摘要
 * 用法: node tools/summarize-matrix.mjs
 * 输出为待审核草稿；审核后更新 record/matrix-data.js 中对应格子的 summary。
 */

// ==================== 配置 ====================
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const MODEL = "deepseek-chat";
const API_URL = "https://api.deepseek.com/chat/completions";
const OUTPUT_FILE = "tools/matrix-summaries.json";
const DELAY_MS = 500; // 每次请求间隔
// ================================================

import { readFileSync, writeFileSync, existsSync } from "fs";
import vm from "node:vm";

if (!DEEPSEEK_API_KEY) {
  throw new Error("请先设置 DEEPSEEK_API_KEY 环境变量");
}

function extractNotes() {
  const context = { window: {} };
  vm.runInNewContext(readFileSync("record/matrix-data.js", "utf-8"), context);
  return Object.fromEntries(
    Object.entries(context.window.ATO_MATRIX_DATA).map(([code, cell]) => [code, cell.sources]),
  );
}

async function callDeepSeek(code, notes) {
  const notesText = notes.join("\n");
  const prompt = [
    `你是桌游"Aeon Trespass: Odyssey"的规则助手。以下是抉择矩阵格子 ${code} 的所有标记来源：`,
    "---",
    notesText,
    "---",
    "用一句简短的中文总结：标记此格代表玩家做了什么关键抉择或发生了什么事件？只回答总结，不要解释。",
  ].join("\n");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const notes = extractNotes();
  const codes = Object.keys(notes);
  console.log(`共 ${codes.length} 个格子需要处理`);

  // 断点续传：读取已有结果
  let results = {};
  if (existsSync(OUTPUT_FILE)) {
    try {
      results = JSON.parse(readFileSync(OUTPUT_FILE, "utf-8"));
      console.log(`已有 ${Object.keys(results).length} 个结果，跳过已完成的`);
    } catch {
      results = {};
    }
  }

  let done = 0;
  let skipped = 0;
  let errors = 0;

  for (const code of codes) {
    if (results[code]) {
      skipped++;
      continue;
    }

    try {
      const summary = await callDeepSeek(code, notes[code]);
      results[code] = summary;
      done++;
      console.log(`[${done + skipped}/${codes.length}] ${code}: ${summary}`);
    } catch (err) {
      errors++;
      console.error(`[ERROR] ${code}: ${err.message}`);
      results[code] = `[ERROR] ${err.message}`;
    }

    // 每次写入，防止中断丢失
    writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");
    await sleep(DELAY_MS);
  }

  console.log(`\n完成！成功 ${done}，跳过 ${skipped}，失败 ${errors}`);
  console.log(`结果已写入 ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
