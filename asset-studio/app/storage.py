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


def write_upload(stream: BinaryIO, destination: Path, limit: int | None = None) -> int:
    """Copy a stream to disk and return the byte count.

    ``limit`` caps how much may be written, so an oversized (or lying) upload
    cannot fill the disk; the partial file is removed before raising.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    try:
        with destination.open("wb") as output:
            while True:
                chunk = stream.read(CHUNK_SIZE)
                if not chunk:
                    break
                written += len(chunk)
                if limit is not None and written > limit:
                    raise ValueError(f"上传内容超过允许大小（上限 {limit // (1024 * 1024)}MB）")
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return written


def clamp_crop(crop: dict) -> tuple[float, float, float, float]:
    left = max(0.0, min(0.95, float(crop.get("left", 0))))
    top = max(0.0, min(0.95, float(crop.get("top", 0))))
    right = max(left + 0.01, min(1.0, float(crop.get("right", 1))))
    bottom = max(top + 0.01, min(1.0, float(crop.get("bottom", 1))))
    return left, top, right, bottom


def normalize_crop(crop: dict | None) -> dict[str, float] | None:
    """Return the crop that really changes the frame; a full-frame crop is no edit."""
    if not crop:
        return None
    left, top, right, bottom = clamp_crop(crop)
    if left <= 0.0 and top <= 0.0 and right >= 1.0 and bottom >= 1.0:
        return None
    return {"left": left, "top": top, "right": right, "bottom": bottom}


def normalize_transform(transform: dict | None) -> tuple[int, dict[str, float] | None]:
    """Collapse a requested edit into (rotation, crop); (0, None) means no edit."""
    transform = transform or {}
    try:
        rotation = int(transform.get("rotation") or 0) % 360
    except (TypeError, ValueError) as exc:
        raise ValueError(f"旋转角度无效：{transform.get('rotation')}") from exc
    return rotation, normalize_crop(transform.get("crop"))


def dump_transform(rotation: int, crop: dict[str, float] | None) -> str:
    """Serialize the edit that produced a revision's stored object."""
    if not rotation and not crop:
        return "{}"
    return json.dumps({"rotation": rotation, "crop": crop}, ensure_ascii=False, separators=(",", ":"))


def apply_transform(image: Image.Image, rotation: int, crop: dict[str, float] | None) -> Image.Image:
    if rotation % 360:
        image = image.rotate(-rotation, expand=True)
    if crop:
        width, height = image.size
        left, top, right, bottom = clamp_crop(crop)
        image = image.crop((int(width * left), int(height * top), int(width * right), int(height * bottom)))
    return image


def image_preview(
    original: Path,
    preview: Path,
    rotation: int = 0,
    crop: dict[str, float] | None = None,
) -> tuple[int, int]:
    preview.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(original) as opened:
        image = apply_transform(ImageOps.exif_transpose(opened), rotation, crop)
        image.thumbnail((1400, 1400), Image.Resampling.LANCZOS)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")
        image.save(preview, "WEBP", quality=84, method=6)
        return image.size


def preview_relative(digest: str, item_id: str, face: str) -> Path:
    """Address a preview by entry + effective content.

    Entries that share one uploaded original still get their own preview file,
    so editing one entry can never rewrite another entry's preview; the
    content-addressed object behind it stays de-duplicated.
    """
    entry = hashlib.sha256(f"{item_id}\x00{face}".encode("utf-8")).hexdigest()[:16]
    return Path("previews") / digest[:2] / f"{digest}-{entry}.webp"


def write_compatible_image(
    source: Path, destination: Path, rotation: int = 0, crop: dict[str, float] | None = None,
) -> None:
    """Write a browser-compatible image whose encoding matches its target suffix."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    suffix = destination.suffix.lower()
    with Image.open(source) as opened:
        image = apply_transform(ImageOps.exif_transpose(opened), rotation, crop)
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


def store_transformed_object(
    library: Path, source: Path, suffix: str, rotation: int, crop: dict[str, float] | None,
) -> tuple[Path, str]:
    """Bake an edit into a standalone object and return (relative path, sha256).

    The edited image keeps the encoding of the upload, so a package-sourced
    object stays directly installable, and it is content-addressed like every
    other object: identical edits are de-duplicated, different edits never
    share a file.
    """
    suffix = suffix.lower() if suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} else ".png"
    temporary = new_temp_file(library, suffix)
    try:
        write_compatible_image(source, temporary, rotation, crop)
        digest = sha256_file(temporary)
        relative = Path("objects") / digest[:2] / f"{digest}{suffix}"
        target = library / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            temporary.unlink(missing_ok=True)
        else:
            os.replace(temporary, target)
    finally:
        # 失败时不留临时文件（成功时它已经被搬走）
        temporary.unlink(missing_ok=True)
    return relative, digest


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
    try:
        faces = json.loads(item["faces_json"])
    except (TypeError, json.JSONDecodeError) as exc:
        raise ValueError("清单条目的面定义已损坏，请重新导入资料包后再试") from exc
    if not isinstance(faces, dict):
        raise ValueError("清单条目的面定义已损坏，请重新导入资料包后再试")
    if face not in faces:
        raise ValueError("这个条目不需要该面")
    if expected_sha256 is not None and not re.fullmatch(r"[a-f0-9]{64}", expected_sha256):
        raise ValueError("图片哈希格式无效")
    if expected_sha256 is not None:
        # 声明的哈希就是对象身份：字节不符时必须报错，而不是把它当成库里
        # 另一张同哈希的旧图（那会静默换成别人的图）。
        actual = sha256_file(temp_file)
        if actual != expected_sha256:
            raise ValueError(f"图片内容与声明的哈希不一致：{actual[:12]} ≠ {expected_sha256[:12]}")
        digest = expected_sha256
    else:
        digest = sha256_file(temp_file)
    ext = safe_extension(original_name, mime_type)
    source_rel = Path("objects") / digest[:2] / f"{digest}{ext}"
    source_object = library / source_rel

    # Validate the upload is a decodable image BEFORE committing it into the
    # library, so failed uploads leave no orphan files and do not poison
    # chunked upload sessions (whose temp file would otherwise be consumed).
    try:
        with Image.open(temp_file) as probe:
            probe.verify()
    except Exception as exc:
        temp_file.unlink(missing_ok=True)
        raise ValueError(f"上传的文件不是可识别的图片：{exc}") from exc

    source_object.parent.mkdir(parents=True, exist_ok=True)
    if not source_object.exists():
        os.replace(temp_file, source_object)
    elif temp_file.exists():
        temp_file.unlink()
    # The pristine upload stays de-duplicated by content; an edit is baked into
    # its own object so original_path is the single effective version that
    # previews, .atopack, the compat ZIP and installation all consume.
    rotation, crop = normalize_transform(transform)
    original_rel, digest = source_rel, digest
    if rotation or crop:
        original_rel, digest = store_transformed_object(library, source_object, ext, rotation, crop)
    original = library / original_rel
    preview_rel = preview_relative(digest, item_id, face)
    preview = library / preview_rel
    width = height = None
    if not defer_preview:
        width, height = image_preview(original, preview)
    transform_json = dump_transform(rotation, crop)
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
                (item_id,face,sha256,original_path,source_path,preview_path,mime_type,original_name,width,height,source,transform_json)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (item_id, face, digest, original_rel.as_posix(), source_rel.as_posix(), preview_rel.as_posix(),
                 mime_type, original_name, width, height, source, transform_json),
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


def transform_revision(
    db: Database, library: Path, revision: dict, rotation: int = 0, crop: dict | None = None,
) -> dict:
    """Re-apply an edit to a revision from its pristine source.

    The requested rotation/crop is absolute (relative to the uploaded original),
    and the result becomes the stored object, so preview, package export, compat
    export and installation keep showing the same edited image.
    """
    rotation, crop = normalize_transform({"rotation": rotation, "crop": crop})
    source_rel = Path(revision.get("source_path") or revision["original_path"])
    source = library / source_rel
    if not source.is_file():
        raise ValueError("原图文件已丢失，无法调整")
    if rotation or crop:
        original_rel, digest = store_transformed_object(library, source, source.suffix, rotation, crop)
    else:
        original_rel, digest = source_rel, sha256_file(source)
    preview_rel = preview_relative(digest, revision["item_id"], revision["face"])
    preview = library / preview_rel
    temporary = preview.with_name(f".{preview.stem}-{uuid.uuid4().hex}.tmp.webp")
    try:
        width, height = image_preview(library / original_rel, temporary)
        preview.parent.mkdir(parents=True, exist_ok=True)
        os.replace(temporary, preview)
    finally:
        temporary.unlink(missing_ok=True)
    transform_json = dump_transform(rotation, crop)
    with db.connect() as conn:
        # Only one row per (item, face, sha256) is allowed; an older revision
        # holding this exact content would conflict, and it is the same image.
        conn.execute(
            "DELETE FROM asset_revisions WHERE item_id=? AND face=? AND sha256=? AND id<>?",
            (revision["item_id"], revision["face"], digest, revision["id"]),
        )
        conn.execute(
            """UPDATE asset_revisions
            SET sha256=?,original_path=?,preview_path=?,transform_json=?,width=?,height=? WHERE id=?""",
            (digest, original_rel.as_posix(), preview_rel.as_posix(), transform_json, width, height, revision["id"]),
        )
    return {
        **revision,
        "sha256": digest,
        "original_path": original_rel.as_posix(),
        "preview_path": preview_rel.as_posix(),
        "transform_json": transform_json,
        "width": width,
        "height": height,
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
