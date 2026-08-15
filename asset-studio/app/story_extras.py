from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path


ENTITY_INDEX_KIND = "entity-index"
ENTITY_INDEX_MEMBER = "story/entity-index.json"
ENTITY_INDEX_LIBRARY_PATH = Path("sources/story/entity-index.json")
ENTITY_INDEX_JSON_TARGET = "story/data/entity-index.json"
ENTITY_INDEX_JS_TARGET = "story/data/entity-index.js"
ENTITY_INDEX_MAX_BYTES = 128 * 1024 * 1024


@dataclass(frozen=True)
class EntityIndex:
    payload: dict
    json_bytes: bytes
    source: Path

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.json_bytes).hexdigest()

    @property
    def entity_count(self) -> int:
        return len(self.payload["entities"])


def parse_entity_index(raw: bytes, source: Path) -> EntityIndex:
    if len(raw) > ENTITY_INDEX_MAX_BYTES:
        raise ValueError("人物小传索引超过 128MB，已停止处理")
    text = raw.decode("utf-8-sig")
    if source.suffix.lower() == ".js":
        match = re.search(
            r"window\.STORY_ENTITY_INDEX\s*=\s*(\{.*\})\s*;\s*\}\)\(\)\s*;?\s*$",
            text,
            re.S,
        )
        if not match:
            raise ValueError(f"无法识别人物小传索引格式：{source}")
        text = match.group(1)
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"人物小传索引 JSON 无效：{source}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("entities"), list) or not payload["entities"]:
        raise ValueError(f"人物小传索引没有实体数据：{source}")
    json_bytes = f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n".encode("utf-8")
    return EntityIndex(payload=payload, json_bytes=json_bytes, source=source)


def find_entity_index(library: Path, ato_root: Path | None = None) -> EntityIndex | None:
    candidates = [
        *((ato_root / target for target in (ENTITY_INDEX_JSON_TARGET, ENTITY_INDEX_JS_TARGET)) if ato_root else ()),
        library / ENTITY_INDEX_LIBRARY_PATH,
    ]
    for candidate in candidates:
        if candidate.is_file():
            return parse_entity_index(candidate.read_bytes(), candidate)
    return None


def entity_index_javascript(index: EntityIndex) -> bytes:
    json_text = json.dumps(index.payload, ensure_ascii=False, indent=2)
    return f"(function () {{\n  window.STORY_ENTITY_INDEX = {json_text};\n}})();\n".encode("utf-8")


def store_entity_index(library: Path, raw: bytes) -> EntityIndex:
    parsed = parse_entity_index(raw, Path(ENTITY_INDEX_MEMBER))
    destination = library / ENTITY_INDEX_LIBRARY_PATH
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    temporary.write_bytes(parsed.json_bytes)
    os.replace(temporary, destination)
    return EntityIndex(payload=parsed.payload, json_bytes=parsed.json_bytes, source=destination)


def entity_index_manifest_entry(index: EntityIndex) -> dict:
    return {
        "kind": ENTITY_INDEX_KIND,
        "member": ENTITY_INDEX_MEMBER,
        "target": ENTITY_INDEX_JSON_TARGET,
        "sha256": index.sha256,
        "bytes": len(index.json_bytes),
        "entityCount": index.entity_count,
    }
