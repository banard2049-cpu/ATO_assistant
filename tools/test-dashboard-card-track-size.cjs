// 灾祸卡 / 故事卡弹窗的尺寸约束。
// 这两张卡都在 .card-track-dialog 里，卡片宽度被若干层 min() 夹住：
//   弹窗宽度 → 正文栏宽 → .card-track-item 宽度 → .card-track-face 宽度
// 任何一层变窄，卡就跟着变小，所以这几层之间的关系要一起守住。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "index.html"), "utf8");
const styleStart = source.indexOf("<style");
const css = source.slice(styleStart, source.indexOf("</style>", styleStart));

// 去掉 @media 块：那些是窄屏覆盖，不该参与桌面尺寸的断言。
function stripMediaBlocks(text) {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const at = text.indexOf("@media", index);
    if (at < 0) {
      out += text.slice(index);
      break;
    }
    out += text.slice(index, at);
    const open = text.indexOf("{", at);
    if (open < 0) break;
    let depth = 0;
    let cursor = open;
    for (; cursor < text.length; cursor += 1) {
      if (text[cursor] === "{") depth += 1;
      else if (text[cursor] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    index = cursor + 1;
  }
  return out;
}

const desktopCss = stripMediaBlocks(css.replace(/\/\*[\s\S]*?\*\//g, ""));

// 收成 selector -> 声明 的映射，同一选择器按源码顺序后者覆盖前者（近似级联）。
const rules = new Map();
for (const match of desktopCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const declarations = match[2]
    .split(";")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const selector of match[1].split(",")) {
    const key = selector.trim().replace(/\s+/g, " ");
    if (!key || key.startsWith("@")) continue;
    rules.set(key, [...(rules.get(key) || []), ...declarations]);
  }
}

function declared(selector, property) {
  const list = rules.get(selector);
  assert.ok(list, `找不到选择器：${selector}`);
  const hit = list.filter((line) => line.startsWith(`${property}:`)).pop();
  assert.ok(hit, `${selector} 没有声明 ${property}`);
  return hit.slice(property.length + 1).trim();
}

// 从 "min(100%, 880px)" / "min(1440px, calc(100vw - 28px))" 这类值里取出像素上限。
function pxCap(value, selector) {
  const minCall = value.match(/min\(([^)]*(?:\([^)]*\))?[^)]*)\)/);
  assert.ok(minCall, `${selector} 的宽度不是 min(...) 形式：${value}`);
  const firstPx = minCall[1].match(/(\d+)px/);
  assert.ok(firstPx, `${selector} 的 min(...) 里没有像素上限：${value}`);
  return Number(firstPx[1]);
}

const dialogWidth = pxCap(declared(".card-track-dialog", "width"), ".card-track-dialog");
const faceCap = pxCap(declared(".card-track-face", "width"), ".card-track-face");
const emptyCap = pxCap(declared(".card-track-empty", "width"), ".card-track-empty");
const doomFaceCap = pxCap(
  declared('.card-track-dialog[data-group="doom"] .card-track-face', "width"),
  "doom .card-track-face",
);
const doomEmptyCap = pxCap(
  declared('.card-track-dialog[data-group="doom"] .card-track-empty', "width"),
  "doom .card-track-empty",
);
const doomItemCap = pxCap(
  declared('.card-track-dialog[data-group="doom"] .card-track-item', "width"),
  "doom .card-track-item",
);

// 故事卡列宽 = 弹窗宽 - 正文左右内边距 - 栏间距 - 右侧控制栏。
const bodyPadding = 14 * 2;
const columnGap = 14;
const storyColumns = declared('.card-track-dialog[data-group="story"] .card-track-body', "grid-template-columns");
const sideMatch = storyColumns.match(/minmax\(\s*\d+px\s*,\s*(\d+)px\s*\)\s*$/);
assert.ok(sideMatch, `故事栏布局的右栏不是 minmax(Npx, Mpx) 形式：${storyColumns}`);
const storySideMax = Number(sideMatch[1]);
const storyCardColumn = dialogWidth - bodyPadding - columnGap - storySideMax;

const ratio = Number(declared(".card-track-face", "aspect-ratio"));
assert.ok(ratio > 1, `.card-track-face 的 aspect-ratio 异常：${ratio}`);

// .card-track-item 是 border-box：1px 边框 + 10px 内边距两边都要扣掉，
// 剩下的才是卡面真正能用的宽度。
const ITEM_CHROME = (1 + 10) * 2;
const storyCardWidth = Math.min(faceCap, storyCardColumn);
const doomCardWidth = Math.min(doomFaceCap, doomItemCap - ITEM_CHROME);
console.log(`弹窗宽度上限        ${dialogWidth}px`);
console.log(`故事卡可用列宽      ${storyCardColumn}px（卡面上限 ${faceCap}px）`);
console.log(`故事卡实际宽度      ${storyCardWidth}px，卡面高约 ${Math.round(storyCardWidth / ratio)}px`);
console.log(`灾祸卡容器可用宽度  ${doomItemCap - ITEM_CHROME}px（卡面上限 ${doomFaceCap}px）`);
console.log(`灾祸卡实际宽度      ${doomCardWidth}px，卡面高约 ${Math.round(doomCardWidth / ratio)}px`);
console.log(`弹窗高度上限        ${pxCap(declared(".card-track-dialog", "max-height"), ".card-track-dialog")}px（卡面加上标题和控件后可能会滚动）`);

// 两张卡要一样大，这是明确要求，别再拉开差距。
assert.equal(
  doomCardWidth,
  storyCardWidth,
  `灾祸卡 ${doomCardWidth}px 和故事卡 ${storyCardWidth}px 不一样大`,
);

// 卡片要足够大：别再被调小回去。
assert.ok(dialogWidth >= 1440, `弹窗宽度上限被调小了：${dialogWidth}px`);
assert.ok(faceCap >= 1040, `故事卡宽度上限被调小了：${faceCap}px`);
assert.ok(storyCardColumn >= 1000, `故事卡可用列宽被挤窄了：${storyCardColumn}px`);

// 空卡占位要和真卡一样大，否则有无卡面时弹窗会跳一下。
assert.equal(emptyCap, faceCap, "空卡占位和故事卡宽度上限不一致");
assert.equal(doomEmptyCap, doomFaceCap, "空卡占位和灾祸卡宽度上限不一致");

// 外层不能比内层还窄，否则内层的上限根本够不着。
assert.ok(
  doomItemCap - ITEM_CHROME >= doomFaceCap,
  `灾祸卡的容器上限 ${doomItemCap}px 扣掉边框内边距后装不下 ${doomFaceCap}px 的卡面`,
);
assert.ok(
  faceCap <= dialogWidth - bodyPadding,
  "故事卡宽度上限超过了弹窗正文可用宽度，上限是虚的",
);
assert.ok(
  doomFaceCap <= dialogWidth - bodyPadding,
  "灾祸卡宽度上限超过了弹窗正文可用宽度，上限是虚的",
);

console.log("OK: 灾祸卡 / 故事卡尺寸约束全部通过");
