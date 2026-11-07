/* 故事书段首的 (拇指) / (圈) 标记：源文本保留原样的括号标记（混排映射的
   textLength / textFingerprint / 字符偏移全部按原文计算），只在显示层把这几个字
   换成原书的圆形图标。改这里不会影响搜索、存档、朗读（朗读本来就会剥掉括号内容）。
   两个页面共用：故事页 #storyText 与第二屏 ss 的 storyBody。 */
(function (root) {
  "use strict";

  // 图标是两张真实图片文件，放在 story/assets/mixed-media/images/c5/ 下（从 C5 原版扫描
  // 书页里抠的：第 42 页拇指 + 同一页 2043 段首的星芒圆盘，600 dpi 渲染后按圆裁切、
  // 圆外透明、缩到 128 px），不在 JS 里内嵌 base64。放在 c5 子目录是因为资料包的
  // 混排素材通道只收 images/c1..c5/ 下的图（见 asset-studio/app/mixed_media_resources.py）。
  // 故事页在 story/ 下、第二屏在 ss/ 下，相对路径的基准不同，所以按本脚本自身的
  // URL 推 assets 目录；推不出来时退回相对路径（单测环境没有 document 就是这条）。
  const ASSET_BASE = (function () {
    try {
      const doc = root && root.document;
      if (!doc) return "";
      const script = doc.currentScript ||
        (typeof doc.querySelector === "function" &&
          doc.querySelector('script[src*="story-marks"]'));
      if (script && script.src) return new URL(".", script.src).href;
      if (doc.baseURI) return new URL("assets/", doc.baseURI).href;
    } catch (error) { /* 没有 URL/document：走相对路径 */ }
    return "";
  })();

  // 两种标记各一张图，文件名带来源书号，方便回查。
  const ICON_FILES = {
    "拇": "mixed-media/images/c5/mark-thumb-c5.png",
    "圈": "mixed-media/images/c5/mark-circle-c5.png",
  };

  function iconHTML(kind) {
    return '<img class="ato-mark-bitmap" alt="" draggable="false" decoding="async" src="' +
      ASSET_BASE + ICON_FILES[kind] + '">';
  }

  const ICONS = { "拇": iconHTML("拇"), "圈": iconHTML("圈") };

  // (拇指) / （圈）……，连同后面的空白一起吃掉；只认这两个词，正文里的其它括号词不动。
  const PREFIX = /^[（(][ \t\u00a0\u3000]*([拇圈])(?:指)?[ \t\u00a0\u3000]*[)）][ \t\u00a0\u3000]*/;

  function visible(text) {
    return /[^\s\u00a0\u3000]/.test(text);
  }

  // 该文本节点前面（同一条渲染流里）是否已经有可见文字；有就不是段首，不处理。
  function leadingNode(node, root) {
    for (let current = node; current && current !== root; current = current.parentNode) {
      const parent = current.parentNode;
      if (!parent) break;
      const siblings = parent.childNodes || [];
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i] === current) break;
        if (visible(siblings[i].textContent || "")) return false;
      }
    }
    return true;
  }

  function markFor(kind, doc) {
    const span = doc.createElement("span");
    span.className = "ato-story-mark ato-story-mark-" + (kind === "拇" ? "thumb" : "circle");
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = ICONS[kind];
    return span;
  }

  // 只在混排渲染 mount 之后调用：那时 prepareHTML 已经按原文做过字符定位，
  // 再改 DOM 不会影响图片插入。
  function decorate(root) {
    const doc = root && (root.ownerDocument || root.document);
    if (!root || !doc) return 0;
    // 4 = NodeFilter.SHOW_TEXT；直接写常量，避免依赖某些环境没有 NodeFilter。
    const walker = typeof root.createTreeWalker === "function"
      ? root.createTreeWalker(root, 4, null)
      : doc.createTreeWalker(root, 4, null);
    const hits = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue || "";
      if (!text || text.charCodeAt(0) < 0x28) continue;
      const match = PREFIX.exec(text);
      if (match) hits.push([node, match]);
    }
    let count = 0;
    for (const [textNode, match] of hits) {
      if (!root.contains(textNode) || !leadingNode(textNode, root)) continue;
      const parent = textNode.parentNode;
      if (!parent) continue;
      textNode.nodeValue = textNode.nodeValue.slice(match[0].length);
      parent.insertBefore(markFor(match[1], doc), textNode);
      count++;
    }
    return count;
  }

  const api = Object.freeze({
    schema: 1,
    decorate,
    // 纯文本场景（搜索结果预览、第二屏退回纯文本）用：去掉段首标记，正文不动。
    strip(text) {
      return String(text == null ? "" : text).replace(PREFIX, "");
    },
  });
  root.ATO_STORY_MARKS = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
