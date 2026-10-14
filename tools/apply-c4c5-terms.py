"""Apply the reviewed, occurrence-specific C4/C5 terminology patch to local data.

No JavaScript is executed. No input is overwritten. See c4c5-terms/README.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
from collections import defaultdict
from contextlib import suppress
from pathlib import Path

HERE = Path(__file__).resolve().parent
DISPLAY_FIELDS = {"title", "encounter", "section", "text", "officialTitle", "officialText", "html"}
MAP_FIELDS = {"anchor", "replaceText", "contextBefore", "contextAfter", "retainedNameText",
              "textLength", "textFingerprint", "sourceTextSha256", "anchorCount", "anchorOccurrence",
              "retainedNameStart", "retainedNameEnd"}
MAP_LEDGERS = {"rows", "resourceRows", "battleRows", "requestedRows"}
HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U000323af]*\Z")
HAN_CHAR = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\U00020000-\U000323af]")


def sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def canonical_sha(value) -> str:
    return sha(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


def at(value, path):
    for key in path:
        value = value[key]
    return value


class JsonAssignment:
    """Strict JSON assignment reader retaining the position of every scalar token."""

    def __init__(self, raw: str, name: str):
        prefix = re.match(r"\A\s*(?:/\*.*?\*/\s*)?window\." + re.escape(name) + r"\s*=\s*", raw, re.S)
        if not prefix:
            raise ValueError("Expected a plain window.%s JSON assignment" % name)
        self.raw, self.spans = raw, {}
        decoder = json.JSONDecoder(parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON")))

        def space(i):
            while i < len(raw) and raw[i] in " \t\r\n":
                i += 1
            return i

        def parse(i, path):
            i = space(i)
            if i >= len(raw):
                raise ValueError("Truncated JSON")
            if raw[i] in "{[":
                obj = raw[i] == "{"
                result, closing = ({}, "}") if obj else ([], "]")
                i = space(i + 1)
                if raw[i:i+1] == closing:
                    return result, i + 1
                while True:
                    if obj:
                        key, i = decoder.raw_decode(raw, i)
                        if not isinstance(key, str) or key in result:
                            raise ValueError("Invalid or duplicate JSON key")
                        i = space(i)
                        if raw[i:i+1] != ":":
                            raise ValueError("Missing JSON colon")
                        child, i = parse(i + 1, path + (key,))
                        result[key] = child
                    else:
                        child, i = parse(i, path + (len(result),))
                        result.append(child)
                    i = space(i)
                    if raw[i:i+1] == closing:
                        return result, i + 1
                    if raw[i:i+1] != ",":
                        raise ValueError("Missing JSON delimiter")
                    i = space(i + 1)
            value, end = decoder.raw_decode(raw, i)
            self.spans[path] = (i, end)
            return value, end

        self.value, end = parse(prefix.end(), ())
        if not isinstance(self.value, dict) or not re.fullmatch(r"\s*;?\s*", raw[end:]):
            raise ValueError("Unexpected JavaScript outside JSON assignment")

    def replace(self, tokens):
        edits = [(self.spans[path][0], self.spans[path][1], token) for path, token in tokens.items()]
        chunks, previous = [], 0
        for start, end, token in sorted(edits):
            chunks.extend((self.raw[previous:start], token))
            previous = end
        chunks.append(self.raw[previous:])
        return "".join(chunks)


def string_boundaries(token):
    """Map decoded Unicode offsets to source JSON, without normalizing escapes."""
    boundaries, i = [], 1
    while i < len(token) - 1:
        boundaries.append(i)
        if token[i] != "\\":
            i += 1
        elif token[i+1] != "u":
            i += 2
        else:
            unit = int(token[i+2:i+6], 16)
            i += 6
            if 0xD800 <= unit <= 0xDBFF and token[i:i+2] == "\\u" and 0xDC00 <= int(token[i+2:i+6], 16) <= 0xDFFF:
                i += 6
    boundaries.append(i)
    if len(boundaries) != len(json.loads(token)) + 1:
        raise ValueError("Unsupported JSON string encoding")
    return boundaries


def apply_edits(token, record, legacy=False):
    text = json.loads(token)
    if sha(text) != record["source_field_sha256"]:
        raise ValueError("Source field differs from the reviewed text")
    bounds, previous_end = string_boundaries(token), 0
    for start, end, old, new in record["edits"]:
        exception = legacy and (old, new) == ("乌尔-弗里斯", "始源羊毛")
        if not (isinstance(start, int) and isinstance(end, int) and previous_end <= start <= end <= len(text)):
            raise ValueError("Invalid or overlapping edit range")
        if text[start:end] != old or old == new or not (HAN_CHAR.sub("", old) == HAN_CHAR.sub("", new) or exception):
            raise ValueError("Edit is not a reviewed Chinese term substitution")
        previous_end = end
    for start, end, old, new in reversed(record["edits"]):
        token = token[:bounds[start]] + json.dumps(new, ensure_ascii=False)[1:-1] + token[bounds[end]:]
    if sha(json.loads(token)) != record["output_field_sha256"]:
        raise ValueError("Unexpected patched field digest")
    return token


def patch_story(source, manifest):
    doc = JsonAssignment(source, "STORYBOOK_OFFICIAL_DATA")
    groups, tokens = defaultdict(list), {}
    for stage in manifest["stages"]:
        for field in stage["fields"]:
            groups[tuple(field["path"])].append((stage["name"], field))
    for path, phases in groups.items():
        valid = (len(path) == 3 and path[2] == "title") or (len(path) == 5 and path[2] in {"entries", "chapters"})
        if not valid or path[0] != "books" or path[1] not in (3, 4) or path[-1] not in DISPLAY_FIELDS:
            raise ValueError("Patch outside C4/C5 display fields")
        book = doc.value["books"][path[1]]
        if book["id"] != "c%d" % (path[1] + 1):
            raise ValueError("Book identity changed")
        if len(path) == 5 and path[2] == "entries" and book["entries"][path[3]]["key"] != phases[0][1]["entry_key"]:
            raise ValueError("Entry identity changed at %s" % (path,))
        value = at(doc.value, path)
        if not isinstance(value, str):
            raise ValueError("Expected a display string")
        digest = sha(value)
        if digest == phases[-1][1]["output_field_sha256"]:
            continue  # Fully applied. Never run an earlier stage over it.
        begin = next((i for i, (_, p) in enumerate(phases) if p["source_field_sha256"] == digest), None)
        if begin is None:
            raise ValueError("Unreviewed text at %s; no files written" % (path,))
        start, end = doc.spans[path]
        token = source[start:end]
        for name, field in phases[begin:]:
            token = apply_edits(token, field, legacy=name == "inherited")
        tokens[path] = token
    result = doc.replace(tokens)
    return result, len(tokens)


def patch_mapping(source, story, manifest):
    doc = JsonAssignment(source, "ATO_MIXED_MEDIA_MAP")
    entries = {e["key"]: e for b in story["books"] if b["id"] in {"c4", "c5"} for e in b["entries"]}
    tokens, changed_rows = {}, 0
    for spec in manifest["rows"]:
        path = tuple(spec["path"])
        if len(path) != 2 or path[0] not in MAP_LEDGERS:
            raise ValueError("Unexpected mapping ledger")
        row = at(doc.value, path)
        if row.get("book") != spec["book"] or row.get("key") != spec["key"] or row.get("variant") != "official" or spec["book"] not in {"c4", "c5"}:
            raise ValueError("Mapping row identity changed")
        text = entries[spec["key"]]["officialText"]
        if sha(text) != spec["final_story_sha256"]:
            raise ValueError("Mapping does not match the patched story")
        digest = canonical_sha(row)
        if digest == spec["output_row_sha256"]:
            continue
        if digest != spec["source_row_sha256"]:
            raise ValueError("Unreviewed mapping row at %s; no files written" % (path,))
        changed = dict(row)
        for field, value in spec["changes"].items():
            if field not in MAP_FIELDS:
                raise ValueError("Patch outside mapping text anchors")
            if isinstance(value, dict):
                start, end = value["slice"]
                if not 0 <= start <= end <= len(text):
                    raise ValueError("Invalid local text slice")
                value = text[start:end]
            changed[field] = value
            tokens[path + (field,)] = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        if canonical_sha(changed) != spec["output_row_sha256"]:
            raise ValueError("Unexpected patched mapping digest")
        changed_rows += 1
    return doc.replace(tokens), changed_rows


def prepare(story_path, mapping_path, manifests=HERE / "c4c5-terms"):
    story_source = story_path.read_bytes().decode("utf-8")
    mapping_source = mapping_path.read_bytes().decode("utf-8")
    terms = json.loads((manifests / "terms-manifest.json").read_text(encoding="utf-8"))
    maps = json.loads((manifests / "mapping-manifest.json").read_text(encoding="utf-8"))
    story, fields = patch_story(story_source, terms)
    mapping, rows = patch_mapping(mapping_source, JsonAssignment(story, "STORYBOOK_OFFICIAL_DATA").value, maps)
    return story, mapping, {"changed_story_fields": fields, "changed_mapping_rows": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--story", type=Path, required=True)
    parser.add_argument("--mapping", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, help="New, nonexistent directory; neither input is overwritten")
    parser.add_argument("--check", action="store_true", help="Validate both files without writing")
    args = parser.parse_args()
    if args.check == bool(args.output_dir):
        parser.error("Choose exactly one of --check or --output-dir")
    temporary = reserved = None
    try:
        if args.output_dir and (args.output_dir.exists() or args.output_dir.is_symlink()):
            raise ValueError("Output directory already exists; choose a new directory")
        story, mapping, result = prepare(args.story, args.mapping)
        if args.output_dir:
            # Validate and stage the entire pair first, on the destination volume.
            parent = args.output_dir.resolve().parent
            if not parent.is_dir():
                raise ValueError("Output parent directory must exist")
            temporary = Path(tempfile.mkdtemp(prefix=".c4c5-terms-", dir=parent))
            for relative, contents in [("story/data/storybook-official-data.js", story),
                                       ("story/assets/mixed-media/mapping.js", mapping)]:
                target = temporary / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(contents.encode("utf-8"))
            # mkdir is exclusive even if another process creates the destination
            # after our initial check. Never rename over a pre-existing directory.
            args.output_dir.mkdir(mode=0o700)
            reserved = args.output_dir
            (temporary / "story").rename(reserved / "story")
            reserved = None  # Both files became visible in one subtree rename.
        print(json.dumps({"ok": True, **result, "mode": "check" if args.check else "output"}))
        return 0
    except (ValueError, KeyError, IndexError, TypeError, OSError) as error:
        print("Patch refused: %s" % error)
        return 1
    finally:
        if reserved is not None:
            with suppress(OSError):
                reserved.rmdir()  # Only our empty reservation, never user content.
        if temporary is not None:
            shutil.rmtree(temporary)


if __name__ == "__main__":
    raise SystemExit(main())
