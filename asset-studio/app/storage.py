from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import shutil
import uuid
from pathlib import Path
from typing import BinaryIO

from PIL import Image, ImageOps

from .db import Database


CHUNK_SIZE = 1024 * 1024


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_extension(filename: str, mime_type: str = "") -> str:
    ext = Path(filename).suffix.lower()
    # .heic/.heif are intentionally absent: the default runtime has no
    # pillow-heif, so those files cannot be decoded. store_image validates the
    # upload and rejects them with a clear error. To support iPhone uploads,
    # add pillow-heif to requirements.txt and re-allow these extensions.
    allowed = {".jpg", ".jpeg", ".png", ".webp"}
    if ext in allowed:
        return ".jpg" if ext == ".jpeg" else ext
    guessed = mimetypes.guess_extension(mime_type or "") or ".bin"
    return guessed if guessed in allowed else ".bin"


def write_upload(stream: BinaryIO, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as output:
        shutil.copyfileobj(stream, output, length=CHUNK_SIZE)


def image_preview(
    original: Path,
    preview: Path,
    rotation: int = 0,
    crop: dict[str, float] | None = None,
) -> tuple[int, int]:
    preview.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(original) as opened:
        image = ImageOps.exif_transpose(opened)
        if rotation % 360:
            image = image.rotate(-rotation, expand=True)
        if crop:
            width, height = image.size
            left = max(0.0, min(0.95, float(crop.get("left", 0))))
            top = max(0.0, min(0.95, float(crop.get("top", 0))))
            right = max(left + 0.01, min(1.0, float(crop.get("right", 1))))
            bottom = max(top + 0.01, min(1.0, float(crop.get("bottom", 1))))
            image = image.crop((int(width * left), int(height * top), int(width * right), int(height * bottom)))
        image.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")
        image.save(preview, "WEBP", quality=84, method=6)
        return image.size


def write_compatible_image(source: Path, destination: Path) -> None:
    """Write a browser-compatible image whose encoding matches its target suffix."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    suffix = destination.suffix.lower()
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        if suffix in {".jpg", ".jpeg"}:
            if image.mode != "RGB":
                background = Image.new("RGB", image.size, "white")
                if image.mode == "RGBA":
                    background.paste(image, mask=image.getchannel("A"))
                else:
                    background.paste(image.convert("RGB"))
                image = background
            image.save(destination, "JPEG", quality=92, optimize=True)
        elif suffix == ".png":
            image.save(destination, "PNG", optimize=True)
        elif suffix == ".webp":
            image.save(destination, "WEBP", quality=90, method=6)
        else:
            shutil.copy2(source, destination)


def store_image(
    db: Database,
    library: Path,
    temp_file: Path,
    item_id: str,
    face: str,
    original_name: str,
    mime_type: str,
    source: str = "upload",
    transform: dict | None = None,
    expected_sha256: str | None = None,
    defer_preview: bool = False,
) -> dict:
    item = db.one("SELECT id,faces_json FROM catalog_items WHERE id=?", (item_id,))
    if not item:
        raise ValueError("清单中没有这个条目")
    faces = json.loads(item["faces_json"])
    if face not in faces:
        raise ValueError("这个条目不需要该面")
    if expected_sha256 is not None and not re.fullmatch(r"[a-f0-9]{64}", expected_sha256):
        raise ValueError("图片哈希格式无效")
    digest = expected_sha256 or sha256_file(temp_file)
    ext = safe_extension(original_name, mime_type)
    original_rel = Path("objects") / digest[:2] / f"{digest}{ext}"
    preview_rel = Path("previews") / digest[:2] / f"{digest}.webp"
    original = library / original_rel
    preview = library / preview_rel

    # Validate the upload is a decodable image BEFORE committing it into the
    # library, so failed uploads leave no orphan files and do not poison
    # chunked upload sessions (whose temp file would otherwise be consumed).
    try:
        with Image.open(temp_file) as probe:
            probe.verify()
    except Exception as exc:
        temp_file.unlink(missing_ok=True)
        raise ValueError(f"上传的文件不是可识别的图片：{exc}") from exc

    original.parent.mkdir(parents=True, exist_ok=True)
    if not original.exists():
        os.replace(temp_file, original)
    elif temp_file.exists():
        temp_file.unlink()
    transform = transform or {}
    width = height = None
    if not defer_preview:
        width, height = image_preview(
            original,
            preview,
            int(transform.get("rotation", 0)),
            transform.get("crop"),
        )
    with db.connect() as conn:
        existing = conn.execute(
            "SELECT id FROM asset_revisions WHERE item_id=? AND face=? AND sha256=?",
            (item_id, face, digest),
        ).fetchone()
        conn.execute("UPDATE asset_revisions SET is_current=0 WHERE item_id=? AND face=?", (item_id, face))
        if existing:
            revision_id = existing["id"]
            conn.execute("UPDATE asset_revisions SET is_current=1, preview_path=? WHERE id=?", (preview_rel.as_posix(), revision_id))
        else:
            cursor = conn.execute(
                """INSERT INTO asset_revisions
                (item_id,face,sha256,original_path,preview_path,mime_type,original_name,width,height,source)
                VALUES(?,?,?,?,?,?,?,?,?,?)""",
                (item_id, face, digest, original_rel.as_posix(), preview_rel.as_posix(), mime_type,
                 original_name, width, height, source),
            )
            revision_id = cursor.lastrowid
        conn.execute("DELETE FROM skipped_faces WHERE item_id=? AND face=?", (item_id, face))
    return {
        "id": revision_id,
        "sha256": digest,
        "width": width,
        "height": height,
        "preview": f"/media/{preview_rel.as_posix()}",
    }


def ensure_preview(db: Database, library: Path, relative: str) -> Path | None:
    """Create a deferred preview on first access and persist its dimensions."""
    revision = db.one(
        "SELECT id,original_path,preview_path FROM asset_revisions WHERE preview_path=? AND is_current=1 LIMIT 1",
        (relative,),
    )
    if not revision:
        return None
    preview = library / revision["preview_path"]
    if preview.is_file():
        return preview
    original = library / revision["original_path"]
    if not original.is_file():
        return None
    temporary = preview.with_name(f".{preview.stem}-{uuid.uuid4().hex}.tmp.webp")
    try:
        width, height = image_preview(original, temporary)
        preview.parent.mkdir(parents=True, exist_ok=True)
        os.replace(temporary, preview)
    finally:
        temporary.unlink(missing_ok=True)
    db.execute("UPDATE asset_revisions SET width=?,height=? WHERE id=?", (width, height, revision["id"]))
    return preview


def new_temp_file(library: Path, suffix: str = ".upload") -> Path:
    return library / "tmp" / f"{uuid.uuid4().hex}{suffix}"
