import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://www.bgstorybook.com/ATO/mainnew";
const OUT_PATH = path.resolve("tools/bgstorybook-c2.json");

const CHAPTER_KEY_BY_SLUG = {
  main: "main",
  story_card: "story-card",
  hub_01_consider_the_ant: "hub-01-consider-the-ant",
  hub_02_the_other_thermopylae: "hub-02-the-other-thermopylae",
  hub_03_from_the_ashes: "hub-03-from-the-ashes",
  hub_04_intended_purpose: "hub-04-intended-purpose",
  hub_05_misery_industry: "hub-05-misery-industry",
  hub_06_parable_of_the_butterfly: "hub-06-parable-of-the-butterfly",
  hub_07_truth_to_weakness: "hub-07-truth-to-weakness",
  hub_08_when_the_land_meets_the_sea: "hub-08-when-the-land-meets-the-sea",
  special_events: "special-events",
  rr_adventures: "rr-adventures",
  dreams_of_pharos: "dreams-of-pharos",
  inward_odyssey: "inward-odyssey",
  mnemos_breakthrough: "mnemos-breakthrough",
  battle: "battle",
};

const CHAPTER_TITLE_BY_SLUG = {
  rr_adventures: "休憩冒险 (R&R Adventures)",
  battle: "战斗 Battle",
};

const ENTRY_PAGES_WITHOUT_CHAPTER_HEADING = new Set([
  "rr_adventures",
]);

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

function stripTags(html) {
  return decodeHtml(String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-4])>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeHiddenControls(html) {
  let output = "";
  let cursor = 0;
  const markers = ["print:hidden", "print:nx-hidden"];
  while (true) {
    const matches = markers
      .map((marker) => ({ marker, index: html.indexOf(marker, cursor) }))
      .filter((match) => match.index >= 0)
      .sort((a, b) => a.index - b.index);
    if (!matches.length) {
      output += html.slice(cursor);
      return output;
    }
    const { marker, index: markerIndex } = matches[0];

    const openStart = html.lastIndexOf("<div", markerIndex);
    if (openStart < cursor) {
      output += html.slice(cursor, markerIndex);
      cursor = markerIndex + marker.length;
      continue;
    }

    output += html.slice(cursor, openStart);
    const end = findBalancedDivEnd(html, openStart);
    cursor = end > openStart ? end : markerIndex + marker.length;
  }
}

function findBalancedDivEnd(html, start) {
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tagRe.exec(html))) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) return tagRe.lastIndex;
    } else {
      depth += 1;
    }
  }
  return -1;
}

function articleHtml(pageHtml) {
  const start = pageHtml.indexOf("<article");
  if (start < 0) throw new Error("No <article> found");
  const end = pageHtml.indexOf("</article>", start);
  if (end < 0) throw new Error("No </article> found");
  return pageHtml.slice(start, end + "</article>".length);
}

function headingEntries(article) {
  return [...article.matchAll(/<h([1-4])([^>]*)>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({
      index: match.index,
      level: Number(match[1]),
      text: stripTags(match[3]),
      html: match[0],
    }))
    .filter((heading) => heading.text);
}

function normalizeTitle(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[—–]/g, "-")
    .trim();
}

function entryIdFromTitle(title) {
  const text = normalizeTitle(title);
  const greek = text.match(/^([αΑΩ])(?:\s|$)/);
  if (greek) return greek[1] === "Α" ? "α" : greek[1];
  const match = text.match(/^(\d{1,2}\s*[-—]\s*\d{1,2}|\d+[A-Z]|[A-Za-z]?\d{3,4}|M\d{3}|\d{1,3}|[A-Z]\d)\b/i);
  return match ? match[1].replace(/\s+/g, "") : "";
}

function slugifyTitle(title) {
  return normalizeTitle(title)
    .toLowerCase()
    .replace(/[()?:!,.，。！？：；、□]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[—–]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitEntryTitle(title) {
  const text = normalizeTitle(title);
  const id = entryIdFromTitle(text) || slugifyTitle(text);
  return {
    id,
    title: text,
  };
}

function extractPage(url, slug, pageHtml) {
  const article = removeHiddenControls(articleHtml(pageHtml));
  const allHeadings = headingEntries(article);
  const hasChapterHeading = !ENTRY_PAGES_WITHOUT_CHAPTER_HEADING.has(slug) && slug !== "battle";
  const chapterTitle = CHAPTER_TITLE_BY_SLUG[slug] || (hasChapterHeading ? allHeadings[0]?.text : "") || slug;
  const entryLevels = new Set(slug === "story_card" || slug === "battle" ? [2] : [2, 3]);
  const headings = allHeadings.filter((heading, index) => !(hasChapterHeading && index === 0) && entryLevels.has(heading.level));
  const entries = [];

  headings.forEach((heading, index) => {
    const next = headings[index + 1]?.index ?? article.length;
    const sectionHtml = article.slice(heading.index, next);
    const body = stripTags(sectionHtml).replace(normalizeTitle(heading.text), "").trim();
    const { id, title } = splitEntryTitle(heading.text);
    entries.push({
      id,
      title,
      headingLevel: heading.level,
      text: body,
    });
  });

  return {
    slug,
    key: CHAPTER_KEY_BY_SLUG[slug] || slug.replaceAll("_", "-"),
    url,
    title: chapterTitle,
    entryCount: entries.length,
    entries,
  };
}

async function fetchText(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "ATO-C2-audit/1.0" },
      });
      if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw lastError;
}

function c2Links(mainHtml) {
  const links = [...mainHtml.matchAll(/<a[^>]+href="([^"]*\/ATO\/C2hid\/([^"#?]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map(([, href, slug, label]) => ({
      slug,
      url: new URL(href, BASE_URL).href,
      label: stripTags(label),
    }));
  const seen = new Map();
  links.forEach((link) => {
    if (!seen.has(link.url)) seen.set(link.url, link);
  });
  return [...seen.values()];
}

async function main() {
  const mainHtml = await fetchText(BASE_URL);
  const links = c2Links(mainHtml);
  if (!links.length) throw new Error("No C2 links found");

  const chapters = [];
  for (const link of links) {
    console.error(`fetch ${link.slug}`);
    const pageHtml = await fetchText(link.url);
    chapters.push(extractPage(link.url, link.slug, pageHtml));
  }

  const book = {
    id: "c2",
    title: "ATO C2 Storybook v2.0",
    source: BASE_URL,
    fetchedAt: new Date().toISOString(),
    chapterCount: chapters.length,
    entryCount: chapters.reduce((sum, chapter) => sum + chapter.entryCount, 0),
    chapters,
  };

  await fs.writeFile(OUT_PATH, `${JSON.stringify(book, null, 2)}\n`, "utf8");
  console.log(`wrote ${OUT_PATH}`);
  console.log(`${book.chapterCount} chapters, ${book.entryCount} entries`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
