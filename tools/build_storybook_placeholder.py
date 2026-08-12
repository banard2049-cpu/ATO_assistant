#!/usr/bin/env python3
"""Build the public-safe storybook placeholder from a local ATO APK.

This is a maintainer tool only. The generated WebUI does not read an APK at
runtime. The output keeps navigation metadata while excluding story prose,
scans, images, audio, OCR text, and translation notes.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import tempfile
import zipfile


APK_MEMBER = "assets/web/story/data/storybook-data.js"
PLACEHOLDER_TEXT = "请扫描故事书或看实体书"
ENTRY_FIELDS = (
    "key",
    "id",
    "title",
    "englishTitle",
    "entryType",
    "chapterKey",
    "chapter",
    "encounterKey",
    "encounter",
    "section",
    "order",
    "line",
)


def parse_storybook_assignment(source: str) -> dict:
    start = source.find("{")
    end = source.rfind("}")
    if start < 0 or end < start:
        raise ValueError("APK 中的故事书数据不是可识别的 JavaScript 对象")
    data = json.loads(source[start : end + 1])
    if not isinstance(data.get("books"), list):
        raise ValueError("APK 故事书数据缺少 books 列表")
    return data


def make_placeholder(source: dict) -> dict:
    books = []
    for source_book in source["books"]:
        chapters = [
            {key: chapter[key] for key in ("key", "title", "line") if key in chapter}
            for chapter in source_book.get("chapters", [])
        ]
        entries = []
        for source_entry in source_book.get("entries", []):
            entry = {
                key: source_entry[key]
                for key in ENTRY_FIELDS
                if key in source_entry
            }
            # The current APK has no populated explicit links. Keeping this as
            # an empty list prevents prose-derived story jumps while the WebUI's
            # dedicated battle-to-AIBP buttons continue to use the metadata above.
            entry["links"] = []
            entry["text"] = PLACEHOLDER_TEXT
            entries.append(entry)

        books.append(
            {
                "id": source_book["id"],
                "title": source_book["title"],
                "source": "public-placeholder",
                "entryCount": len(entries),
                "chapters": chapters,
                "entries": entries,
            }
        )

    return {
        "generatedAt": "公开占位版（不含正文）",
        "placeholder": True,
        "placeholderText": PLACEHOLDER_TEXT,
        "books": books,
    }


def write_javascript(destination: Path, payload: dict) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    header = (
        "// Public-safe placeholder generated from ATO-Local 0.2.11 structure.\n"
        "// Contains navigation metadata only; no story prose or media assets.\n"
        "window.STORYBOOK_DATA = "
    )
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=destination.parent,
        prefix=f".{destination.name}.",
        delete=False,
    ) as output:
        temporary_name = output.name
        output.write(header)
        output.write(body)
        output.write(";\n")
    os.replace(temporary_name, destination)
    destination.chmod(0o644)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="从本地 APK 生成不含故事正文和媒体的公开占位故事书"
    )
    parser.add_argument("apk", type=Path, help="ATO APK 文件")
    parser.add_argument("destination", type=Path, help="输出的 JavaScript 文件")
    args = parser.parse_args()

    with zipfile.ZipFile(args.apk) as archive:
        source = archive.read(APK_MEMBER).decode("utf-8-sig")
    payload = make_placeholder(parse_storybook_assignment(source))
    write_javascript(args.destination, payload)

    book_count = len(payload["books"])
    chapter_count = sum(len(book["chapters"]) for book in payload["books"])
    entry_count = sum(len(book["entries"]) for book in payload["books"])
    battle_count = sum(
        entry.get("chapterKey") == "battle"
        for book in payload["books"]
        for entry in book["entries"]
    )
    print(
        f"已生成 {args.destination}: {book_count} 本 / {chapter_count} 章 / "
        f"{entry_count} 条 / {battle_count} 个战斗入口"
    )


if __name__ == "__main__":
    main()
