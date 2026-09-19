from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  cycle TEXT NOT NULL,
  module TEXT NOT NULL,
  subgroup TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  number TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  faces_json TEXT NOT NULL,
  capture_required INTEGER NOT NULL DEFAULT 1,
  source_version TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS catalog_group_idx
  ON catalog_items(cycle, module, subgroup, sort_order);

CREATE TABLE IF NOT EXISTS asset_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  face TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  -- original_path is the effective (already edited) object: previews, package
  -- export, compat export and installation all read this one file.
  original_path TEXT NOT NULL,
  -- source_path is the pristine upload the edit was baked from; it is shared
  -- between entries and revisions that uploaded identical bytes.
  source_path TEXT NOT NULL DEFAULT '',
  preview_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  source TEXT NOT NULL DEFAULT 'upload',
  -- Edit that produced original_path, as {"rotation": n, "crop": {...}|null}.
  transform_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_current INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS asset_current_idx
  ON asset_revisions(item_id, face, is_current);
CREATE INDEX IF NOT EXISTS asset_preview_idx
  ON asset_revisions(preview_path, is_current);
CREATE UNIQUE INDEX IF NOT EXISTS asset_dedupe_idx
  ON asset_revisions(item_id, face, sha256);

CREATE TABLE IF NOT EXISTS skipped_faces (
  item_id TEXT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  face TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(item_id, face)
);

CREATE TABLE IF NOT EXISTS story_books (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'review',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS story_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id TEXT NOT NULL REFERENCES story_books(id) ON DELETE CASCADE,
  chapter_key TEXT NOT NULL DEFAULT 'main',
  chapter_title TEXT NOT NULL DEFAULT '正文',
  entry_number TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS story_order_idx
  ON story_segments(book_id, chapter_key, sort_order);

CREATE TABLE IF NOT EXISTS pending_files (
  id TEXT PRIMARY KEY,
  stored_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  suggested_item_id TEXT,
  suggested_face TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  -- Monotonic import order: created_at only has second precision, so photos
  -- imported in the same second must not fall back to random-UUID ordering.
  import_seq INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- pending_status_idx 不写在这里：老库的 pending_files 没有 import_seq 列，而
-- executescript(SCHEMA) 跑在下面的加列迁移之前，索引一旦引用它就会让整个 Database()
-- 打不开老素材库（no such column: import_seq）。索引改到迁移之后建。

CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  face TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  total_size INTEGER NOT NULL,
  received_size INTEGER NOT NULL DEFAULT 0,
  stored_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


class Database:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.executescript(SCHEMA)
            story_columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(story_segments)")
            }
            if "metadata_json" not in story_columns:
                conn.execute(
                    "ALTER TABLE story_segments ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'"
                )
            revision_columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(asset_revisions)")
            }
            if "source_path" not in revision_columns:
                conn.execute("ALTER TABLE asset_revisions ADD COLUMN source_path TEXT NOT NULL DEFAULT ''")
                # Libraries written before edits were baked: the stored object
                # was the pristine upload, so it is its own source.
                conn.execute("UPDATE asset_revisions SET source_path=original_path")
            if "transform_json" not in revision_columns:
                conn.execute("ALTER TABLE asset_revisions ADD COLUMN transform_json TEXT NOT NULL DEFAULT '{}'")
            pending_columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(pending_files)")
            }
            if "import_seq" not in pending_columns:
                conn.execute("ALTER TABLE pending_files ADD COLUMN import_seq INTEGER NOT NULL DEFAULT 0")
                # Physical insertion order is the closest available record of
                # the real import order for rows already in the table.
                conn.execute("UPDATE pending_files SET import_seq=rowid")
            # 索引在这之后建：老库要先补上 import_seq 列（见 SCHEMA 里的说明）。
            conn.execute(
                "CREATE INDEX IF NOT EXISTS pending_status_idx "
                "ON pending_files(status, created_at, import_seq)"
            )

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self.connect() as conn:
            return [dict(row) for row in conn.execute(sql, params).fetchall()]

    def one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(sql, params).fetchone()
            return dict(row) if row else None

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> int:
        with self.connect() as conn:
            cursor = conn.execute(sql, params)
            return int(cursor.lastrowid or 0)

    def set_meta(self, key: str, value: Any) -> None:
        payload = json.dumps(value, ensure_ascii=False)
        self.execute(
            "INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, payload),
        )

    def get_meta(self, key: str, default: Any = None) -> Any:
        row = self.one("SELECT value FROM meta WHERE key=?", (key,))
        if not row:
            return default
        try:
            return json.loads(row["value"])
        except json.JSONDecodeError:
            return default


def json_faces(row: dict[str, Any]) -> dict[str, str]:
    value = row.get("faces_json", "{}")
    return json.loads(value) if isinstance(value, str) else value
