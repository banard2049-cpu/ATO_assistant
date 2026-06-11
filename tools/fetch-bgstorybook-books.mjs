import fs from "node:fs/promises";
import path from "node:path";

const BOOK_CONFIGS = {
  c4: {
    id: "c4",
    title: "ATO C4 故事书 - 无限增长花园",
    baseUrl: "https://www.bgstorybook.com/ATO/C4hid",
    pathPart: "C4hid",
    outPath: "tools/bgstorybook-c4.json",
    slugs: [
      "main",
      "hub_01_the_salt_road",
      "hub_02_aristotles_promise",
      "hub_03_windfall",
      "hub_04_equality_for_all",
      "hub_05_beyond_the_law_of_bargains",
      "hub_06_a_land_thrice_cursed",
      "hub_07_the_crescent_and_the_full_moon",
      "inward_odyssey",
      "rr_adventures",
      "special_event",
      "ten_thousand_nights_and_days",
      "mnemos_breakthroughs",
      "battle",
    ],
  },
  c5: {
    id: "c5",
    title: "ATO C5 故事书 - 真相诉说者",
    baseUrl: "https://www.bgstorybook.com/ATO/C5new",
    pathPart: "C5new",
    outPath: "tools/bgstorybook-c5.json",
  },
};

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
    .replace(/<\/(?:p|div|li|h[1-5]|blockquote|table|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeEntryHtml(html) {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a\b[^>]*class="[^"]*subheading-anchor[^"]*"[^>]*><\/a>/gi, "")
    .replace(/<\/?div\b[^>]*>/gi, "")
    .replace(/<table\b[^>]*>/gi, '<div class="battle-table-wrap"><table class="battle-table">')
    .replace(/<\/table>/gi, "</table></div>")
    .replace(/<thead\b[^>]*>/gi, "<thead>")
    .replace(/<tbody\b[^>]*>/gi, "<tbody>")
    .replace(/<tr\b[^>]*>/gi, "<tr>")
    .replace(/<th\b[^>]*>/gi, "<th>")
    .replace(/<td\b[^>]*>/gi, "<td>")
    .replace(/<h[3-5]\b[^>]*>/gi, '<h3 class="battle-subheading">')
    .replace(/<\/h[3-5]>/gi, "</h3>")
    .replace(/<p\b[^>]*>/gi, "<p>")
    .replace(/<br\s*\/?\s*>/gi, "<br>")
    .replace(/<strong\b[^>]*>/gi, "<strong>")
    .replace(/<em\b[^>]*>/gi, "<em>")
    .replace(/<b\b[^>]*>/gi, "<strong>")
    .replace(/<\/b>/gi, "</strong>")
    .replace(/<i\b[^>]*>/gi, "<em>")
    .replace(/<\/i>/gi, "</em>")
    .replace(/<ul\b[^>]*>/gi, "<ul>")
    .replace(/<ol\b[^>]*>/gi, "<ol>")
    .replace(/<li\b[^>]*>/gi, "<li>")
    .replace(/<blockquote\b[^>]*>/gi, "<blockquote>")
    .replace(/<(?!\/?(?:div\b|p\b|br\b|strong\b|em\b|ul\b|ol\b|li\b|table\b|thead\b|tbody\b|tr\b|th\b|td\b|h3\b|blockquote\b))[^>]+>/gi, "")
    .trim();
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

function articleHtml(pageHtml) {
  const start = pageHtml.indexOf("<article");
  if (start < 0) throw new Error("No <article> found");
  const end = pageHtml.indexOf("</article>", start);
  if (end < 0) throw new Error("No </article> found");
  return pageHtml.slice(start, end + "</article>".length);
}

function headingEntries(article) {
  return [...article.matchAll(/<h([1-5])([^>]*)>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => ({
      index: match.index,
      level: Number(match[1]),
      text: stripTags(match[3]),
      rawText: stripTags(match[3]),
      html: match[0],
    }))
    .filter((heading) => heading.text);
}

function normalizeTitle(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim();
}

function entryIdFromTitle(title) {
  const text = normalizeTitle(title);
  const greek = text.match(/^([αΑΩω])(?:[\s-]|$)/);
  if (greek) return greek[1].toLowerCase() === "ω" ? "Ω" : "α";
  const match = text.match(/^(\d{1,2}\s*[-–—]\s*\d{1,2}|\d+[A-Z]|[A-Za-z]?\d{3,4}|M\d{3}|\d{1,3}|[A-Z]\d)\b/i);
  return match ? match[1].replace(/\s+/g, "") : "";
}

function splitMalformedEncounterHeading(text) {
  const title = normalizeTitle(text);
  if (!/^(?:[αΑΩω]|\d{1,2}\s*[-–—]\s*\d{1,2})/.test(title)) {
    return { title, bodyPrefix: "" };
  }
  const parts = title.split(/\s+\|\s+/);
  if (parts.length < 2) return { title, bodyPrefix: "" };

  const tail = parts.at(-1).trim();
  const looksLikeBody = tail.length > 24 || /[。！？；，]/.test(tail);
  if (!looksLikeBody) return { title, bodyPrefix: "" };

  return {
    title: parts.slice(0, -1).join(" | "),
    bodyPrefix: tail,
  };
}

function dropHeadingPrefix(body, prefixes) {
  let output = body;
  for (const prefix of prefixes.filter(Boolean)) {
    if (output.startsWith(prefix)) {
      output = output.slice(prefix.length).trim();
      break;
    }
  }
  return output;
}

function promoteLeadingTitle(slug, entryId, title, body) {
  if (slug !== "rr_adventures" || !/^\d+$/.test(String(entryId || ""))) {
    return { title, body };
  }

  const firstLine = body.split(/\n+/).find((line) => line.trim())?.trim() || "";
  const looksLikeTitle = firstLine.length <= 90 && /[（(][^)）]+[)）]/.test(firstLine);
  if (!looksLikeTitle) return { title, body };

  return {
    title: `${entryId} ${firstLine}`,
    body: body.slice(body.indexOf(firstLine) + firstLine.length).trim(),
  };
}

function slugifyTitle(title) {
  return normalizeTitle(title)
    .toLowerCase()
    .replace(/[()?:!,.，。！；：、]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitEntryTitle(title) {
  const text = normalizeTitle(title);
  return {
    id: entryIdFromTitle(text) || slugifyTitle(text),
    title: text,
  };
}

function chapterKeyFromSlug(slug) {
  return slug.replaceAll("_", "-").replace(/-+/g, "-");
}

function fallbackChapterTitle(slug, label) {
  const cleanLabel = normalizeTitle(label || "");
  if (cleanLabel && !/^next$/i.test(cleanLabel)) return cleanLabel;
  if (slug === "battle") return "战斗 Battle";
  return slug.replaceAll("_", " ");
}

function extractPage(url, slug, label, pageHtml) {
  const article = removeHiddenControls(articleHtml(pageHtml));
  const allHeadings = headingEntries(article);
  if (!allHeadings.length) {
    return {
      slug,
      key: chapterKeyFromSlug(slug),
      url,
      title: fallbackChapterTitle(slug, label),
      entryCount: 0,
      entries: [],
    };
  }

  const firstHeadingIsEntry = Boolean(entryIdFromTitle(allHeadings[0].text));
  const hasChapterHeading = slug !== "battle" && !firstHeadingIsEntry;
  const chapterTitle = hasChapterHeading ? allHeadings[0].text : fallbackChapterTitle(slug, label);
  const chapterLevel = hasChapterHeading ? allHeadings[0].level : 1;
  const entryHeadings = allHeadings.filter((heading, index) => {
    if (slug === "battle") return heading.level === 2;
    if (hasChapterHeading && index === 0) return false;
    if (heading.level <= chapterLevel && !entryIdFromTitle(heading.text)) return false;
    return heading.level >= 2 && heading.level <= 4;
  });

  const entries = entryHeadings.map((heading, index) => {
    const next = entryHeadings[index + 1]?.index ?? article.length;
    const sectionHtml = article.slice(heading.index, next);
    const contentHtml = sectionHtml.replace(heading.html, "");
    const originalHeadingText = normalizeTitle(heading.text);
    const { title: headingText, bodyPrefix } = splitMalformedEncounterHeading(originalHeadingText);
    let body = stripTags(sectionHtml);
    body = dropHeadingPrefix(body, [heading.rawText, originalHeadingText, headingText]);
    if (bodyPrefix) body = `${bodyPrefix}${body ? `\n\n${body}` : ""}`;
    const { id, title } = splitEntryTitle(headingText);
    const promoted = promoteLeadingTitle(slug, id, title, body);
    return {
      id,
      title: promoted.title,
      headingLevel: heading.level,
      text: promoted.body,
      html: /<table\b/i.test(contentHtml) ? sanitizeEntryHtml(contentHtml) : "",
    };
  });

  return {
    slug,
    key: chapterKeyFromSlug(slug),
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
        headers: { "User-Agent": "ATO-storybook-import/1.0" },
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

function storyLinks(mainHtml, config) {
  if (config.slugs?.length) {
    return config.slugs.map((slug) => ({
      slug,
      url: new URL(`${config.baseUrl.replace(/\/$/, "")}/${slug}`).href,
      label: "",
    }));
  }
  const pathPart = config.pathPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expectedHost = new URL(config.baseUrl).host;
  const pattern = new RegExp(`<a[^>]+href="([^"]*/ATO/${pathPart}/([^"#?]+)[^"]*)"[^>]*>([\\s\\S]*?)<\\/a>`, "gi");
  const links = [...mainHtml.matchAll(pattern)]
    .map(([, href, slug, label]) => ({
      slug,
      url: new URL(href, config.baseUrl).href,
      label: stripTags(label),
    }))
    .filter((link) => new URL(link.url).host === expectedHost)
    .filter((link) => link.slug !== "index.mdx")
    .filter((link) => !/^#/.test(link.slug));
  const seen = new Map();
  links.forEach((link) => {
    if (!seen.has(link.url)) seen.set(link.url, link);
  });
  return [...seen.values()];
}

async function fetchBook(bookId) {
  const config = BOOK_CONFIGS[bookId];
  if (!config) throw new Error(`Unknown book id: ${bookId}`);
  const mainHtml = await fetchText(config.baseUrl);
  const links = storyLinks(mainHtml, config);
  if (!links.length) throw new Error(`No links found for ${bookId}`);

  const chapters = [];
  for (const link of links) {
    console.error(`fetch ${bookId} ${link.slug}`);
    const pageHtml = await fetchText(link.url);
    chapters.push(extractPage(link.url, link.slug, link.label, pageHtml));
  }

  const book = {
    id: bookId,
    title: config.title,
    source: config.baseUrl,
    fetchedAt: new Date().toISOString(),
    chapterCount: chapters.length,
    entryCount: chapters.reduce((sum, chapter) => sum + chapter.entryCount, 0),
    chapters,
  };

  const outPath = path.resolve(config.outPath);
  await fs.writeFile(outPath, `${JSON.stringify(book, null, 2)}\n`, "utf8");
  console.log(`wrote ${outPath}`);
  console.log(`${book.chapterCount} chapters, ${book.entryCount} entries`);
  return book;
}

async function main() {
  const requested = process.argv.slice(2);
  const bookIds = requested.length ? requested : ["c4", "c5"];
  for (const bookId of bookIds) await fetchBook(bookId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
