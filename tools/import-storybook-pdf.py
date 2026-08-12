import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STORYBOOK_DATA_PATH = ROOT / "story" / "data" / "storybook-data.js"
STORYBOOK_PREFIX = "window.STORYBOOK_DATA = "

ONWARDS_ODYSSEY_BOOKS = [
    {
        "book_id": "c1.5",
        "title": "ATO C1.5 故事书 - 后日奥德赛：破碎的图纹",
        "chapter_title": "破碎的图纹",
        "page_start": 6,
        "page_end": 48,
        "insert_after": "c1",
        "preface_image": "./images/OO/DY1P5.png",
        "chapter_markers": [
            ("setup", "破碎的图纹 起始设置"),
            ("hub-spiral-secret", "枢纽 1：螺旋秘密"),
            ("hub-angular-truth", "枢纽 2：棱角真理"),
            ("matrix-codas", "破碎的图纹尾声"),
            ("leaving-crete", "离开克里特"),
        ],
        "standalone_chapters": {
            "leaving-crete": {"id": "leaving-crete", "title": "离开克里特"},
        },
    },
    {
        "book_id": "c2.5",
        "title": "ATO C2.5 故事书 - 后日奥德赛：破碎的锁链",
        "chapter_title": "破碎的锁链",
        "page_start": 49,
        "page_end": 90,
        "insert_after": "c2",
        "preface_image": "./images/OO/DY2P5.png",
        "chapter_markers": [
            ("setup", "破碎的锁链 起始设置"),
            ("hub-sins-of-the-past", "枢纽 1：过去的罪孽"),
            ("hub-heirs-to-the-future", "枢纽 2：未来继承者"),
            ("matrix-codas", "破碎的锁链尾声"),
            ("leaving-sparta", "离开斯巴达"),
        ],
        "standalone_chapters": {
            "leaving-sparta": {"id": "leaving-sparta", "title": "离开斯巴达"},
        },
    },
]


def workspace_path(value):
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    resolved = path.resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"PDF must be inside workspace: {ROOT}") from exc
    return resolved


def read_storybook_data(path):
    source = path.read_text(encoding="utf-8")
    if not source.startswith(STORYBOOK_PREFIX):
        raise ValueError(f"Unexpected prefix in {path}")
    return json.loads(re.sub(r";\s*$", "", source[len(STORYBOOK_PREFIX) :]))


def write_storybook_data(path, data):
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    path.write_text(f"{STORYBOOK_PREFIX}{payload};\n", encoding="utf-8")


def extract_page_texts(pdf_path, page_start=None, page_end=None):
    import pdfplumber

    page_texts = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        start_index = max((page_start or 1) - 1, 0)
        end_index = min(page_end or len(pdf.pages), len(pdf.pages))
        for page_number, page in enumerate(pdf.pages[start_index:end_index], start=start_index + 1):
            raw_text = page.extract_text(x_tolerance=1.5, y_tolerance=3) or ""
            words = page.extract_words(x_tolerance=1.5, y_tolerance=3) or []
            text = extract_page_text(page)
            page_texts.append({
                "page": page_number,
                "text": normalize_page_text(text),
                "rawText": normalize_page_text(raw_text),
                "words": [
                    {
                        "text": word["text"],
                        "x0": word["x0"],
                        "x1": word.get("x1", word["x0"]),
                        "top": word["top"],
                        "bottom": word.get("bottom", word["top"]),
                    }
                    for word in words
                ],
            })
    return page_texts


def extract_page_text(page):
    words = page.extract_words(x_tolerance=1.5, y_tolerance=3) or []
    if is_multicolumn_page(words):
        return extract_multicolumn_text(words)
    return page.extract_text(x_tolerance=1.5, y_tolerance=3) or ""


def is_multicolumn_page(words):
    body_words = [word for word in words if 60 <= word["top"] <= 810]
    if not body_words:
        return False
    columns = [
        sum(1 for word in body_words if 40 <= word["x0"] < 120),
        sum(1 for word in body_words if 205 <= word["x0"] < 285),
        sum(1 for word in body_words if 380 <= word["x0"] < 460),
    ]
    return sum(count >= 4 for count in columns) >= 2


def extract_multicolumn_text(words):
    body_words = [word for word in words if 38 <= word["x0"] <= 555 and word["top"] <= 810]
    all_lines = group_words_into_positioned_lines(body_words)
    heading_lines = [
        line for line in all_lines
        if probable_entry_heading(line["text"]) and not is_noise_line(line["text"])
    ]
    heading_tops = [line["top"] for line in heading_lines]
    starts_with_hub_header = any("枢纽" in line["text"] for line in all_lines[:4])
    boundaries = [0, *heading_tops, 830]

    output = []
    for index in range(len(boundaries) - 1):
        top = boundaries[index]
        bottom = boundaries[index + 1]
        heading = next((line for line in heading_lines if abs(line["top"] - top) <= 3), None)
        if heading:
            output.append(heading["text"])
        elif index == 0 and starts_with_hub_header:
            continue

        band_words = [
            word for word in body_words
            if top < word["top"] < bottom and not (heading and abs(word["top"] - heading["top"]) <= 3)
        ]
        output.extend(extract_band_text(band_words))
    return "\n".join(line for line in output if keep_extracted_line(line))


def group_words_into_lines(words):
    return [line["text"] for line in group_words_into_positioned_lines(words)]


def group_words_into_positioned_lines(words):
    lines = []
    for word in sorted(words, key=lambda item: (item["top"], item["x0"])):
        if lines and abs(lines[-1]["top"] - word["top"]) <= 3:
            lines[-1]["words"].append(word)
            lines[-1]["top"] = min(lines[-1]["top"], word["top"])
        else:
            lines.append({"top": word["top"], "words": [word]})
    output = []
    for line in lines:
        ordered = sorted(line["words"], key=lambda item: item["x0"])
        text = " ".join(word["text"] for word in ordered).strip()
        if text:
            output.append({"top": line["top"], "text": text, "words": ordered})
    return output


def extract_band_text(words):
    output = []
    for left, right in [(38, 211), (211, 382), (382, 555)]:
        column = [word for word in words if left <= word["x0"] < right]
        output.extend(group_words_into_lines(column))
    return output


def keep_extracted_line(line):
    text = line.strip()
    if not text:
        return False
    if is_noise_line(text):
        return False
    if re.fullmatch(r"\d{1,3}", text):
        return False
    return True


def is_noise_line(text):
    return bool(re.search(
        r"Onward_Odyssey|_Broken_|Hub \d{2}|^\w* Secret$|^\w* Truth$|^al Secret$|^ral Truth$|^Past$|^Future$",
        text,
    ))


def normalize_page_text(text):
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[\u00a0\u200b]+", " ", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"\n?Last updated on .+?BG Storybook \(by TATO\)\s*;?", "", text, flags=re.I | re.S)
    text = re.sub(r"\n\s*\d+\s*$", "", text)
    return text.strip()


ENTRY_HEADING_RE = re.compile(
    r"^(?P<id>\*?\d{3,5}|M\d{3}|[αΩ]|\d{1,2}\s*[-–—]\s*\d{1,2})(?:[ \t:：|·\-–—]+(?P<title>.+?))?$",
    re.IGNORECASE,
)


def probable_entry_heading(line):
    stripped = line.strip()
    if re.match(r"^(?:如果|否则|进行|每个|每位|投掷|检定|你可以|B\d+|C\d+|D\d+|E\d+|F\d+|G\d+|H\d+|I\d+|J\d+|K\d+|L\d+|M\d+|N\d+|O\d+|P\d+|Q\d+|R\d+|S\d+|T\d+)", stripped):
        return None
    match = ENTRY_HEADING_RE.match(stripped)
    if not match:
        return None
    entry_id = normalize_entry_id(match.group("id"))
    title = (match.group("title") or "").strip()
    if len(title) > 120:
        return None
    if is_hub_heading_id(entry_id) and "|" not in title:
        return None
    return entry_id, title


def normalize_entry_id(value):
    return re.sub(r"\s+", "", str(value or "").replace("–", "-").replace("—", "-"))


def is_hub_heading_id(value):
    return value in {"α", "Ω"} or re.fullmatch(r"\d{1,2}-\d{1,2}", value or "") is not None


def marker_chapter_for_page(page_text, markers, fallback_key, fallback_title):
    header = "\n".join(page_text.splitlines()[:6])
    compact = re.sub(r"\s+", "", header)
    for key, title in reversed(markers):
        title_compact = re.sub(r"\s+", "", title)
        if title_compact in compact:
            return key, title
    return fallback_key, fallback_title


def marker_chapter_for_record(page, markers, fallback_key, fallback_title):
    return marker_chapter_for_page(page.get("rawText") or page.get("text") or "", markers, fallback_key, fallback_title)


def strip_record_sheet_tail(text):
    markers = [
        "\n:yessydO",
        "\nOnwards Odyssey:",
        "\n:赛德奥日后",
    ]
    cut = len(text)
    for marker in markers:
        index = text.find(marker)
        if index >= 0:
            cut = min(cut, index)
    return text[:cut].strip()


def matrix_coda_markers(words):
    markers = []
    for word in words:
        text = str(word.get("text") or "").strip()
        if not re.fullmatch(r"\d{3,4}", text):
            continue
        if text in {"0001", "0002", "2024"}:
            continue
        if not (38 <= word.get("x0", 0) <= 60):
            continue
        if word.get("top", 999) > 805:
            continue
        markers.append({
            "id": normalize_entry_id(text),
            "top": word["top"],
            "bottom": word.get("bottom", word["top"]),
        })
    markers.sort(key=lambda item: item["top"])
    return markers


def extract_matrix_coda_lines(words, top, bottom, marker=None):
    band_words = []
    marker_top = marker["top"] if marker else None
    marker_id = marker["id"] if marker else None
    for word in words:
        word_top = word.get("top", 0)
        if not (top < word_top < bottom):
            continue
        text = str(word.get("text") or "").strip()
        if word_top > 810 or is_noise_line(text):
            continue
        if marker and abs(word_top - marker_top) <= 3 and text == marker_id:
            continue
        if word.get("x0", 0) < 60 and re.fullmatch(r"\d{3,4}", text):
            continue
        band_words.append(word)
    return [line for line in extract_band_text(band_words) if keep_matrix_coda_line(line)]


def keep_matrix_coda_line(line):
    text = line.strip()
    if not text:
        return False
    if is_noise_line(text):
        return False
    if re.fullmatch(r"\d{1,2}", text):
        return False
    return True


def split_entries_from_pages(page_texts, default_chapter_key, default_chapter_title, chapter_markers, standalone_chapters=None):
    entries = []
    preface_parts = []
    current = None
    matrix_current = None
    active_chapter_key = default_chapter_key
    active_chapter_title = default_chapter_title
    standalone_chapters = standalone_chapters or {}

    def flush():
        nonlocal current
        if not current:
            return
        body = normalize_entry_body(current["body"])
        if body:
            entries.append(
                {
                    "id": current["id"],
                    "title": current["title"] or current["id"],
                    "text": body,
                    "chapterKey": current["chapterKey"],
                    "chapter": current["chapter"],
                    "page": current["page"],
                    "encounterKey": encounter_key_for(current["id"], current["title"]),
                    "encounter": encounter_title_for(current["id"], current["title"]),
                }
            )
        current = None

    def flush_matrix():
        nonlocal matrix_current
        if not matrix_current:
            return
        body = normalize_entry_body(matrix_current["body"])
        if body:
            entries.append(
                {
                    "id": matrix_current["id"],
                    "title": matrix_current["title"],
                    "text": body,
                    "chapterKey": matrix_current["chapterKey"],
                    "chapter": matrix_current["chapter"],
                    "page": matrix_current["page"],
                    "encounterKey": None,
                    "encounter": None,
                }
            )
        matrix_current = None

    for page in page_texts:
        active_chapter_key, active_chapter_title = marker_chapter_for_record(
            page, chapter_markers, active_chapter_key, active_chapter_title
        )
        if active_chapter_key != "matrix-codas":
            flush_matrix()
        if active_chapter_key in standalone_chapters:
            flush()
            standalone = standalone_chapters[active_chapter_key]
            lines = strip_record_sheet_tail(page["text"]).splitlines()
            if lines and re.sub(r"\s+", "", lines[0]) == re.sub(r"\s+", "", active_chapter_title):
                body = normalize_entry_body(lines[1:])
            else:
                body = normalize_entry_body(lines)
                body = remove_spaced_heading_prefix(body, active_chapter_title)
            entries.append(
                {
                    "id": standalone["id"],
                    "title": standalone["title"],
                    "text": body,
                    "chapterKey": active_chapter_key,
                    "chapter": active_chapter_title,
                    "page": page["page"],
                    "encounterKey": None,
                    "encounter": None,
                }
            )
            continue
        if active_chapter_key == "matrix-codas":
            flush()
            words = page.get("words") or []
            markers = matrix_coda_markers(words)
            if markers:
                continuation_lines = extract_matrix_coda_lines(words, 55, markers[0]["top"])
                if matrix_current and continuation_lines:
                    matrix_current["body"].extend(continuation_lines)
                    matrix_current["body"].append("")
                for index, marker in enumerate(markers):
                    if matrix_current:
                        flush_matrix()
                    bottom = markers[index + 1]["top"] if index + 1 < len(markers) else 810
                    matrix_current = {
                        "id": marker["id"],
                        "title": marker["id"],
                        "body": [],
                        "chapterKey": active_chapter_key,
                        "chapter": active_chapter_title,
                        "page": page["page"],
                    }
                    lines = extract_matrix_coda_lines(words, marker["top"] - 1, bottom, marker)
                    matrix_current["body"].extend(lines)
                    matrix_current["body"].append("")
            else:
                lines = extract_matrix_coda_lines(words, 55, 810)
                if matrix_current and lines:
                    matrix_current["body"].extend(lines)
                    matrix_current["body"].append("")
            continue
        for raw_line in page["text"].split("\n"):
            line = raw_line.strip()
            if not line:
                if current:
                    current["body"].append("")
                continue
            heading = probable_entry_heading(line)
            if heading:
                flush()
                entry_id, title = heading
                current = {
                    "id": entry_id,
                    "title": title,
                    "body": [],
                    "chapterKey": active_chapter_key,
                    "chapter": active_chapter_title,
                    "page": page["page"],
                }
                continue
            if current:
                current["body"].append(raw_line.rstrip())
            else:
                preface_parts.append(raw_line.rstrip())

    flush()
    flush_matrix()
    preface = "\n".join(part for part in preface_parts if part.strip()).strip()
    if preface:
        entries.insert(
            0,
            {
                "id": "preface",
                "title": "导言",
                "text": normalize_entry_body(preface.splitlines()),
                "chapterKey": default_chapter_key,
                "chapter": default_chapter_title,
                "page": page_texts[0]["page"] if page_texts else 0,
                "encounterKey": None,
                "encounter": None,
            },
        )
    return entries


def normalize_entry_body(lines):
    paragraphs = []
    current = []
    for raw_line in lines:
        line = str(raw_line or "").strip()
        if not line:
            if current:
                paragraphs.append(join_wrapped_lines(current))
                current = []
            continue
        current.append(line)
    if current:
        paragraphs.append(join_wrapped_lines(current))
    return "\n\n".join(paragraph for paragraph in paragraphs if paragraph).strip()


def join_wrapped_lines(lines):
    output = ""
    for line in lines:
        if not output:
            output = line
            continue
        if should_start_new_line(output, line):
            output += "\n" + line
        elif needs_space_between(output[-1], line[0]):
            output += " " + line
        else:
            output += line
    return output


def remove_spaced_heading_prefix(text, heading):
    compact_heading = re.sub(r"\s+", "", heading)
    compact_text = re.sub(r"\s+", "", text)
    if compact_text.startswith(compact_heading):
        pattern = r"\s*".join(map(re.escape, compact_heading))
        return re.sub(rf"^{pattern}\s*", "", text, count=1).strip()
    return text


def should_start_new_line(previous, line):
    if re.match(r"^(?:选择|失败|成功|奖励|重要提示|如果|否则|然后|前往|返回|获得|失去|减去|播撒|消耗|耗尽|标记|移除|每个|每位|小队队长|队长|0-1|2-3|4\+|\d{1,2}-\d{1,2}|[12]:)", line):
        return True
    if re.search(r"[。！？：:]$", previous) and re.match(r"^(?:\d+\.|[12]:|α|Ω|\d{1,2}-\d{1,2})", line):
        return True
    return False


def needs_space_between(left, right):
    return bool(re.match(r"[A-Za-z0-9)]", left) and re.match(r"[A-Za-z0-9(]", right))


def slugify(value):
    text = str(value or "").lower()
    text = text.replace("α", "alpha").replace("Ω".lower(), "omega").replace("ω", "omega")
    text = re.sub(r"[^\w\u3400-\u9fff]+", "-", text, flags=re.UNICODE)
    return re.sub(r"-+", "-", text).strip("-")


def encounter_key_for(entry_id, title):
    if not is_hub_heading_id(entry_id):
        return None
    return slugify(f"{entry_id}-{title}")


def encounter_title_for(entry_id, title):
    if not is_hub_heading_id(entry_id):
        return None
    return f"{entry_id} {title}".strip()


def chapter_list(entries, chapter_markers):
    seen = []
    titles = {key: title for key, title in chapter_markers}
    for entry in entries:
        key = entry["chapterKey"]
        if key not in seen:
            seen.append(key)
            titles.setdefault(key, entry["chapter"])
    return [{"key": key, "title": titles[key], "line": index + 1} for index, key in enumerate(seen)]


def apply_preface_image(entries, image_path):
    if not image_path:
        return
    preface = next((entry for entry in entries if entry.get("id") == "preface"), None)
    if not preface:
        return
    preface["text"] = ""
    preface["image"] = image_path


def build_book(book_id, title, source, entries, chapter_markers):
    local_entries = []
    for index, entry in enumerate(entries):
        entry_id = str(entry["id"])
        entry_type = "number" if re.match(r"^\*?\d{3,5}$", entry_id) else "heading"
        local_entry = {
            "key": f"{book_id}-{entry['chapterKey']}-{index}",
            "id": entry_id,
            "title": entry["title"],
            "entryType": entry_type,
            "chapterKey": entry["chapterKey"],
            "chapter": entry["chapter"],
            "encounterKey": entry.get("encounterKey"),
            "encounter": entry.get("encounter"),
            "section": entry.get("encounter") or entry["chapter"],
            "order": index,
            "line": entry.get("page") or index + 1,
            "text": entry["text"],
            "links": {},
        }
        for key in ("image", "images", "imageList", "html"):
            if entry.get(key):
                local_entry[key] = entry[key]
        local_entries.append(local_entry)

    return {
        "id": book_id,
        "title": title,
        "source": source,
        "entryCount": len(local_entries),
        "chapters": chapter_list(entries, chapter_markers),
        "entries": local_entries,
    }


def insert_book(data, book, insert_after=None):
    existing_index = next((index for index, item in enumerate(data["books"]) if item.get("id") == book["id"]), -1)
    if existing_index >= 0:
        data["books"][existing_index] = book
        return
    if insert_after:
        after_index = next((index for index, item in enumerate(data["books"]) if item.get("id") == insert_after), -1)
        if after_index >= 0:
            data["books"].insert(after_index + 1, book)
            return
    data["books"].append(book)


def import_book_from_pdf(pdf_path, config):
    pages = extract_page_texts(pdf_path, config["page_start"], config["page_end"])
    entries = split_entries_from_pages(
        pages,
        config["chapter_markers"][0][0],
        config["chapter_markers"][0][1],
        config["chapter_markers"],
        config.get("standalone_chapters"),
    )
    apply_preface_image(entries, config.get("preface_image"))
    if not entries:
        raise ValueError(f"No importable text was extracted for {config['book_id']}")
    source = f"{pdf_path.relative_to(ROOT).as_posix()}#page={config['page_start']}-{config['page_end']}"
    return build_book(config["book_id"], config["title"], source, entries, config["chapter_markers"])


def import_onwards_odyssey(pdf_path, dry_run=False):
    data = read_storybook_data(STORYBOOK_DATA_PATH)
    books = []
    for config in ONWARDS_ODYSSEY_BOOKS:
        book = import_book_from_pdf(pdf_path, config)
        insert_book(data, book, config["insert_after"])
        books.append(book)
    data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    for book in books:
        chapter_names = ", ".join(chapter["title"] for chapter in book["chapters"])
        print(f"{book['id']}: {len(book['chapters'])} chapters, {book['entryCount']} entries")
        print(f"  chapters: {chapter_names}")
    if dry_run:
        print("dry run: no files written")
    else:
        write_storybook_data(STORYBOOK_DATA_PATH, data)
        print(f"updated {STORYBOOK_DATA_PATH}")


def import_single(pdf_path, args):
    config = {
        "book_id": args.book_id,
        "title": args.title,
        "chapter_title": args.chapter_title,
        "page_start": args.page_start,
        "page_end": args.page_end,
        "chapter_markers": [("main", args.chapter_title)],
    }
    data = read_storybook_data(STORYBOOK_DATA_PATH)
    book = import_book_from_pdf(pdf_path, config)
    insert_book(data, book)
    data["generatedAt"] = datetime.now(timezone.utc).isoformat()
    print(f"{book['id']}: {len(book['chapters'])} chapters, {book['entryCount']} entries")
    if args.dry_run:
        print("dry run: no files written")
    else:
        write_storybook_data(STORYBOOK_DATA_PATH, data)
        print(f"updated {STORYBOOK_DATA_PATH}")


def main():
    parser = argparse.ArgumentParser(description="Import a local PDF into story/data/storybook-data.js.")
    parser.add_argument("pdf", type=workspace_path, help="PDF path inside this workspace")
    parser.add_argument("--onwards-odyssey", action="store_true", help="Import A14 Onwards Odyssey as C1.5 and C2.5 books")
    parser.add_argument("--book-id", default="oo", help="Storybook book id for single-book import")
    parser.add_argument("--title", default="ATO 故事书 PDF 导入", help="Book title for single-book import")
    parser.add_argument("--chapter-title", default="正文", help="Chapter title for single-book import")
    parser.add_argument("--page-start", type=int, default=None, help="First PDF page to import, 1-based")
    parser.add_argument("--page-end", type=int, default=None, help="Last PDF page to import, 1-based")
    parser.add_argument("--dry-run", action="store_true", help="Print import counts without writing")
    args = parser.parse_args()

    if not args.pdf.exists():
        raise FileNotFoundError(args.pdf)
    if args.pdf.suffix.lower() != ".pdf":
        raise ValueError(f"Expected a PDF file: {args.pdf}")

    if args.onwards_odyssey:
        import_onwards_odyssey(args.pdf, args.dry_run)
    else:
        import_single(args.pdf, args)


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
        main()
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        sys.exit(1)
