from __future__ import annotations

import io
import json
import mimetypes
import os
import re
import shutil
import socket
import tempfile
import time
import urllib.request
import uuid
import webbrowser
import zipfile
from pathlib import Path, PurePosixPath
from typing import Annotated, Any

import qrcode
from fastapi import BackgroundTasks, Cookie, Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .catalog import catalog_stats
from .config import AppConfig, PAIRING_CODE, PROJECT_DIR, ensure_library, load_config, save_config
from .db import Database
from .fixed_catalog import ensure_fixed_catalog
from .installer import apply_install, install_plan, validate_target
from .packages import export_compat, export_package, import_package, inspect_package
from .security import make_token, valid_token
from .storage import ensure_preview, image_preview, new_temp_file, store_image, write_upload
from .stories import import_story, merge_next_segment, split_segment, story_books, story_segments, update_segment


STATIC_DIR = PROJECT_DIR / "static"
config = load_config()
app = FastAPI(title="ATO 素材库", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def local_request(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in {"127.0.0.1", "::1", "localhost", "testclient"}


def require_auth(request: Request, ato_session: str | None = Cookie(default=None)) -> None:
    if local_request(request) or valid_token(ato_session):
        return
    raise HTTPException(status_code=401, detail="请先用配对码连接")


def library_and_db() -> tuple[Path, Database]:
    try:
        library = ensure_library(config)
    except RuntimeError as exc:
        raise HTTPException(status_code=428, detail=str(exc)) from exc
    db = Database(library / "library.sqlite3")
    ensure_fixed_catalog(db)
    return library, db


def safe_error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


class SetupPayload(BaseModel):
    library_path: str
    ato_path: str = ""


class PairPayload(BaseModel):
    code: str


class SkipPayload(BaseModel):
    item_id: str
    face: str


class AssignPayload(BaseModel):
    pending_id: str
    item_id: str
    face: str


class SequencePayload(BaseModel):
    pending_ids: list[str]
    targets: list[dict[str, str]]


class TransformPayload(BaseModel):
    item_id: str
    face: str
    rotation: int = 0
    crop: dict[str, float] | None = None


class UploadStartPayload(BaseModel):
    item_id: str
    face: str
    original_name: str
    mime_type: str = "application/octet-stream"
    total_size: int


class UploadFinishPayload(BaseModel):
    rotation: int = 0
    crop: dict[str, float] | None = None


class SegmentPayload(BaseModel):
    entry_number: str | None = None
    title: str | None = None
    body: str | None = None
    chapter_key: str | None = None
    chapter_title: str | None = None
    sort_order: int | None = None
    reviewed: bool | None = None


class SegmentSplitPayload(BaseModel):
    offset: int


class ExportPayload(BaseModel):
    cycles: list[str] = []
    modules: list[str] = []
    complete_only: bool = False
    include_stories: bool = True
    kind: str = "atopack"


class PackageImportPayload(BaseModel):
    pending_id: str
    replace: bool = False


class InstallPayload(BaseModel):
    ato_path: str | None = None
    replacements: list[str] = []
    apply: bool = False


def new_job(db: Database, kind: str) -> str:
    job_id = uuid.uuid4().hex
    db.execute("INSERT INTO jobs(id,kind,status,message) VALUES(?,?,'queued',?)", (job_id, kind, "等待开始"))
    return job_id


def job_update(db: Database, job_id: str, *, status: str | None = None, progress: int | None = None,
               message: str | None = None, result: dict | None = None, error: str | None = None) -> None:
    fields = ["updated_at=CURRENT_TIMESTAMP"]
    params: list[Any] = []
    for column, value in (("status", status), ("progress", progress), ("message", message),
                          ("result_json", json.dumps(result, ensure_ascii=False) if result is not None else None),
                          ("error", error)):
        if value is not None:
            fields.append(f"{column}=?")
            params.append(value)
    params.append(job_id)
    db.execute(f"UPDATE jobs SET {','.join(fields)} WHERE id=?", tuple(params))


def run_export_job(
    db_path: Path, library: Path, destination: Path, payload: dict, job_id: str,
    ato_path: str = "",
) -> None:
    db = Database(db_path)
    job_update(db, job_id, status="running", progress=1, message="正在准备文件")
    callback = lambda done, total, message: job_update(
        db, job_id, progress=min(95, max(1, int(done / max(total, 1) * 95))), message=message
    )
    try:
        ato_root = Path(ato_path) if ato_path else None
        result = (
            export_compat(db, library, destination, payload, callback, ato_root)
            if payload["kind"] == "compat"
            else export_package(db, library, destination, payload, callback, ato_root)
        )
        result["filename"] = destination.name
        job_update(db, job_id, status="complete", progress=100, message="生成完成", result=result)
    except Exception as exc:
        destination.unlink(missing_ok=True)
        job_update(db, job_id, status="failed", message="生成失败", error=str(exc))


def run_import_job(db_path: Path, library: Path, package: Path, replace: bool, job_id: str) -> None:
    db = Database(db_path)
    job_update(db, job_id, status="running", progress=1, message="正在恢复原图（预览稍后按需生成）")
    callback = lambda done, total, message: job_update(
        db, job_id, progress=min(95, max(1, int(done / max(total, 1) * 95))), message=message
    )
    try:
        result = import_package(db, library, package, replace, callback)
        job_update(db, job_id, status="complete", progress=100, message="导入完成", result=result)
        package.unlink(missing_ok=True)
    except Exception as exc:
        job_update(db, job_id, status="failed", message="导入失败，可重新确认后再试", error=str(exc))


def run_inspect_job(db_path: Path, package: Path, pending_id: str, job_id: str) -> None:
    db = Database(db_path)
    job_update(db, job_id, status="running", progress=1, message="正在读取资料包清单")
    callback = lambda done, total, message: job_update(
        db, job_id, progress=min(98, max(1, int(done / max(total, 1) * 98))), message=message
    )
    try:
        result = inspect_package(db, package, verify_hashes=True, progress=callback)
        result.pop("manifest", None)
        result["pending_id"] = pending_id
        job_update(db, job_id, status="complete", progress=100, message="校验完成", result=result)
    except Exception as exc:
        package.unlink(missing_ok=True)
        job_update(db, job_id, status="failed", message="资料包校验失败", error=str(exc))


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/status")
def status(request: Request, ato_session: str | None = Cookie(default=None)) -> dict:
    ready = bool(config.library_path)
    authenticated = local_request(request) or valid_token(ato_session)
    return {
        "ready": ready, "authenticated": authenticated, "local": local_request(request),
        "library_path": config.library_path if local_request(request) else "",
        "ato_path": config.ato_path if local_request(request) else "",
        "pairing_required": not local_request(request), "pairing_code": PAIRING_CODE if local_request(request) else "",
        "lan_urls": lan_urls(config.port) if local_request(request) else [],
    }


@app.post("/api/setup")
def setup(payload: SetupPayload, request: Request) -> dict:
    if not local_request(request):
        raise HTTPException(status_code=403, detail="只能在电脑本机设置资料库")
    library = Path(payload.library_path).expanduser().resolve()
    library.mkdir(parents=True, exist_ok=True)
    if payload.ato_path:
        validate_target(Path(payload.ato_path))
    config.library_path = str(library)
    config.ato_path = str(Path(payload.ato_path).expanduser().resolve()) if payload.ato_path else ""
    save_config(config)
    ensure_library(config)
    ensure_fixed_catalog(Database(library / "library.sqlite3"))
    return {"ok": True, "library_path": config.library_path, "ato_path": config.ato_path}


# In-memory pairing throttle (single-process uvicorn is fine): after several
# consecutive failures the endpoint is locked for a short window, so a LAN
# attacker cannot brute-force the pairing code.
_pair_failures = 0
_pair_lock_until = 0.0
_MAX_PAIR_FAILURES = 5
_PAIR_LOCK_SECONDS = 30


@app.post("/api/pair")
def pair(payload: PairPayload, response: Response) -> dict:
    global _pair_failures, _pair_lock_until
    now = time.monotonic()
    if now < _pair_lock_until:
        raise HTTPException(status_code=429, detail="配对尝试过于频繁，请稍后再试")
    if payload.code.strip() != PAIRING_CODE:
        _pair_failures += 1
        if _pair_failures >= _MAX_PAIR_FAILURES:
            _pair_lock_until = now + _PAIR_LOCK_SECONDS
            _pair_failures = 0
        raise HTTPException(status_code=401, detail="配对码不正确")
    _pair_failures = 0
    response.set_cookie("ato_session", make_token(), httponly=True, samesite="strict", max_age=60 * 60 * 24 * 30)
    return {"ok": True}


@app.get("/api/qr")
def qr(request: Request) -> StreamingResponse:
    if not local_request(request):
        raise HTTPException(status_code=403, detail="二维码仅在电脑显示")
    urls = lan_urls(config.port)
    value = urls[0] if urls else f"http://127.0.0.1:{config.port}"
    image = qrcode.make(value)
    stream = io.BytesIO()
    image.save(stream, format="PNG")
    stream.seek(0)
    return StreamingResponse(stream, media_type="image/png")


@app.get("/api/catalog", dependencies=[Depends(require_auth)])
def get_catalog(cycle: str = "", module: str = "") -> dict:
    _, db = library_and_db()
    result = catalog_stats(db)
    if cycle:
        result["items"] = [item for item in result["items"] if item["cycle"] == cycle]
        result["groups"] = [group for group in result["groups"] if group["cycle"] == cycle]
    if module:
        result["items"] = [item for item in result["items"] if item["module"] == module]
        result["groups"] = [group for group in result["groups"] if group["module"] == module]
    return result


@app.post("/api/assets/upload", dependencies=[Depends(require_auth)])
def upload_asset(
    file: UploadFile = File(...), item_id: str = Form(...), face: str = Form(...),
    rotation: int = Form(0), crop: str = Form(""),
) -> dict:
    library, db = library_and_db()
    temp = new_temp_file(library, Path(file.filename or "upload").suffix)
    try:
        write_upload(file.file, temp)
        transform = {"rotation": rotation, "crop": json.loads(crop) if crop else None}
        return store_image(db, library, temp, item_id, face, file.filename or "upload", file.content_type or "application/octet-stream", "camera", transform)
    except Exception:
        temp.unlink(missing_ok=True)
        raise


@app.post("/api/uploads/start", dependencies=[Depends(require_auth)])
def upload_start(payload: UploadStartPayload) -> dict:
    library, db = library_and_db()
    if payload.total_size <= 0 or payload.total_size > 512 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="单个文件大小必须在 512MB 以内")
    existing = db.one(
        "SELECT * FROM upload_sessions WHERE item_id=? AND face=? AND original_name=? AND total_size=? AND status='uploading' ORDER BY updated_at DESC LIMIT 1",
        (payload.item_id, payload.face, payload.original_name, payload.total_size),
    )
    if existing and (library / existing["stored_path"]).exists():
        return {"upload_id": existing["id"], "offset": existing["received_size"]}
    upload_id = uuid.uuid4().hex
    temp = new_temp_file(library, Path(payload.original_name).suffix or ".upload")
    temp.touch()
    db.execute(
        "INSERT INTO upload_sessions(id,item_id,face,original_name,mime_type,total_size,stored_path) VALUES(?,?,?,?,?,?,?)",
        (upload_id, payload.item_id, payload.face, payload.original_name, payload.mime_type, payload.total_size, temp.relative_to(library).as_posix()),
    )
    return {"upload_id": upload_id, "offset": 0}


@app.put("/api/uploads/{upload_id}", dependencies=[Depends(require_auth)])
async def upload_chunk(upload_id: str, request: Request, offset: int) -> dict:
    library, db = library_and_db()
    session = db.one("SELECT * FROM upload_sessions WHERE id=? AND status='uploading'", (upload_id,))
    if not session:
        raise HTTPException(status_code=404, detail="上传任务不存在")
    if offset != session["received_size"]:
        raise HTTPException(status_code=409, detail={"expected_offset": session["received_size"]})
    chunk = await request.body()
    if not chunk or len(chunk) > 4 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="分块必须在 1B 到 4MB 之间")
    if offset + len(chunk) > session["total_size"]:
        raise HTTPException(status_code=400, detail="上传内容超过声明大小")
    target = library / session["stored_path"]
    with target.open("ab") as output:
        output.write(chunk)
    received = offset + len(chunk)
    db.execute("UPDATE upload_sessions SET received_size=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (received, upload_id))
    return {"offset": received, "complete": received == session["total_size"]}


@app.post("/api/uploads/{upload_id}/finish", dependencies=[Depends(require_auth)])
def upload_finish(upload_id: str, payload: UploadFinishPayload) -> dict:
    library, db = library_and_db()
    session = db.one("SELECT * FROM upload_sessions WHERE id=? AND status='uploading'", (upload_id,))
    if not session:
        raise HTTPException(status_code=404, detail="上传任务不存在")
    if session["received_size"] != session["total_size"]:
        raise HTTPException(status_code=409, detail=f"文件尚未传完：{session['received_size']}/{session['total_size']}")
    result = store_image(
        db, library, library / session["stored_path"], session["item_id"], session["face"],
        session["original_name"], session["mime_type"], "chunked", payload.model_dump(),
    )
    db.execute("UPDATE upload_sessions SET status='complete',updated_at=CURRENT_TIMESTAMP WHERE id=?", (upload_id,))
    return result


@app.post("/api/assets/skip", dependencies=[Depends(require_auth)])
def skip_asset(payload: SkipPayload) -> dict:
    _, db = library_and_db()
    db.execute("INSERT INTO skipped_faces(item_id,face) VALUES(?,?) ON CONFLICT(item_id,face) DO UPDATE SET updated_at=CURRENT_TIMESTAMP", (payload.item_id, payload.face))
    return {"ok": True}


@app.post("/api/assets/transform", dependencies=[Depends(require_auth)])
def transform_asset(payload: TransformPayload) -> dict:
    library, db = library_and_db()
    revision = db.one("SELECT * FROM asset_revisions WHERE item_id=? AND face=? AND is_current=1", (payload.item_id, payload.face))
    if not revision:
        raise HTTPException(status_code=404, detail="还没有可调整的图片")
    preview = library / revision["preview_path"]
    width, height = image_preview(library / revision["original_path"], preview, payload.rotation, payload.crop)
    db.execute("UPDATE asset_revisions SET width=?,height=? WHERE id=?", (width, height, revision["id"]))
    return {"ok": True, "width": width, "height": height, "preview": f"/media/{revision['preview_path']}?v={uuid.uuid4().hex[:8]}"}


@app.get("/media/{relative:path}", dependencies=[Depends(require_auth)])
def media(relative: str) -> FileResponse:
    library, db = library_and_db()
    target = (library / relative).resolve()
    if library not in target.parents or not relative.startswith(("previews/", "objects/")):
        raise HTTPException(status_code=404)
    if not target.is_file() and relative.startswith("previews/"):
        target = ensure_preview(db, library, relative) or target
    if not target.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(target)


@app.post("/api/batch/upload", dependencies=[Depends(require_auth)])
def batch_upload(files: list[UploadFile] = File(...)) -> dict:
    library, db = library_and_db()
    if len(files) > 5000:
        raise HTTPException(status_code=400, detail="单次最多导入 5000 个文件")
    candidates = catalog_candidates(db)
    pending = []
    expanded_size = 0
    for upload in files:
        filename = upload.filename or "upload"
        if filename.lower().endswith(".zip"):
            archive_temp = new_temp_file(library, ".zip")
            write_upload(upload.file, archive_temp)
            with zipfile.ZipFile(archive_temp) as archive:
                image_infos = [info for info in archive.infolist() if not info.is_dir() and Path(info.filename).suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
                if len(image_infos) > 5000 or sum(info.file_size for info in image_infos) > 8 * 1024 * 1024 * 1024:
                    archive_temp.unlink(missing_ok=True)
                    raise HTTPException(status_code=400, detail="ZIP 超过 5000 张图片或解压后超过 8GB")
                for info in image_infos:
                    if PurePosixPath(info.filename).is_absolute() or ".." in PurePosixPath(info.filename).parts:
                        continue
                    temp = new_temp_file(library, Path(info.filename).suffix)
                    with archive.open(info) as source, temp.open("wb") as output:
                        shutil.copyfileobj(source, output, 1024 * 1024)
                    pending.append(register_pending(db, library, temp, Path(info.filename).name, mimetypes.guess_type(info.filename)[0] or "image/jpeg", candidates))
            archive_temp.unlink(missing_ok=True)
        else:
            temp = new_temp_file(library, Path(filename).suffix)
            write_upload(upload.file, temp)
            expanded_size += temp.stat().st_size
            if expanded_size > 8 * 1024 * 1024 * 1024:
                temp.unlink(missing_ok=True)
                raise HTTPException(status_code=400, detail="单次批量导入总量不能超过 8GB")
            pending.append(register_pending(db, library, temp, filename, upload.content_type or "application/octet-stream", candidates))
    return {"files": pending, "auto_matches": sum(bool(p["suggested_item_id"]) for p in pending), "unmatched": sum(not p["suggested_item_id"] for p in pending)}


@app.get("/api/batch/pending", dependencies=[Depends(require_auth)])
def batch_pending() -> list[dict]:
    _, db = library_and_db()
    return db.all("SELECT * FROM pending_files WHERE status='pending' ORDER BY created_at,id")


@app.post("/api/batch/assign", dependencies=[Depends(require_auth)])
def batch_assign(payload: AssignPayload) -> dict:
    library, db = library_and_db()
    pending = db.one("SELECT * FROM pending_files WHERE id=? AND status='pending'", (payload.pending_id,))
    if not pending:
        raise HTTPException(status_code=404, detail="待分配图片不存在")
    result = store_image(db, library, library / pending["stored_path"], payload.item_id, payload.face, pending["original_name"], pending["mime_type"], "batch")
    db.execute("UPDATE pending_files SET status='assigned',suggested_item_id=?,suggested_face=? WHERE id=?", (payload.item_id, payload.face, payload.pending_id))
    return result


@app.post("/api/batch/sequence", dependencies=[Depends(require_auth)])
def batch_sequence(payload: SequencePayload) -> dict:
    library, db = library_and_db()
    if not payload.pending_ids or len(payload.pending_ids) > len(payload.targets):
        raise HTTPException(status_code=400, detail="待分配照片多于当前清单中的缺失卡面")
    assigned = []
    for pending_id, target in zip(payload.pending_ids, payload.targets):
        pending = db.one("SELECT * FROM pending_files WHERE id=? AND status='pending'", (pending_id,))
        if not pending:
            continue
        item_id, face = target.get("item_id", ""), target.get("face", "")
        result = store_image(db, library, library / pending["stored_path"], item_id, face, pending["original_name"], pending["mime_type"], "batch-sequence")
        db.execute("UPDATE pending_files SET status='assigned',suggested_item_id=?,suggested_face=? WHERE id=?", (item_id, face, pending_id))
        assigned.append({"pending_id": pending_id, "item_id": item_id, "face": face, "sha256": result["sha256"]})
    return {"assigned": assigned, "count": len(assigned)}


@app.post("/api/stories/import", dependencies=[Depends(require_auth)])
def stories_import(
    file: UploadFile = File(...), book_id: str = Form(...), title: str = Form(...),
    chapter_key: str = Form("main"), chapter_title: str = Form("正文"),
    page_start: int | None = Form(None), page_end: int | None = Form(None),
) -> dict:
    library, db = library_and_db()
    suffix = Path(file.filename or "story").suffix.lower()
    temp = new_temp_file(library, suffix)
    write_upload(file.file, temp)
    try:
        return import_story(db, library, temp, book_id.strip(), title.strip(), chapter_key.strip(), chapter_title.strip(), page_start, page_end, file.filename or "story")
    finally:
        temp.unlink(missing_ok=True)


@app.get("/api/stories", dependencies=[Depends(require_auth)])
def stories_list() -> list[dict]:
    _, db = library_and_db()
    return story_books(db)


@app.get("/api/stories/{book_id}", dependencies=[Depends(require_auth)])
def stories_get(book_id: str) -> list[dict]:
    _, db = library_and_db()
    return story_segments(db, book_id)


@app.put("/api/stories/segments/{segment_id}", dependencies=[Depends(require_auth)])
def stories_update(segment_id: int, payload: SegmentPayload) -> dict:
    _, db = library_and_db()
    update_segment(db, segment_id, payload.model_dump(exclude_none=True))
    return {"ok": True}


@app.post("/api/stories/segments/{segment_id}/split", dependencies=[Depends(require_auth)])
def stories_split(segment_id: int, payload: SegmentSplitPayload) -> dict:
    _, db = library_and_db()
    return {"new_id": split_segment(db, segment_id, payload.offset)}


@app.post("/api/stories/segments/{segment_id}/merge-next", dependencies=[Depends(require_auth)])
def stories_merge(segment_id: int) -> dict:
    _, db = library_and_db()
    return {"removed_id": merge_next_segment(db, segment_id)}


@app.post("/api/packages/export", dependencies=[Depends(require_auth)])
def packages_export(payload: ExportPayload, background_tasks: BackgroundTasks) -> dict:
    library, db = library_and_db()
    stem = f"ato-assets-{uuid.uuid4().hex[:8]}"
    if payload.kind not in {"atopack", "compat"}:
        raise HTTPException(status_code=400, detail="不支持的导出格式")
    suffix = "-compat.zip" if payload.kind == "compat" else ".atopack"
    destination = library / "exports" / f"{stem}{suffix}"
    job_id = new_job(db, f"export-{payload.kind}")
    background_tasks.add_task(
        run_export_job, db.path, library, destination, payload.model_dump(), job_id, config.ato_path
    )
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}", dependencies=[Depends(require_auth)])
def get_job(job_id: str) -> dict:
    _, db = library_and_db()
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        raise HTTPException(status_code=404, detail="任务不存在")
    row = db.one("SELECT * FROM jobs WHERE id=?", (job_id,))
    if not row:
        raise HTTPException(status_code=404, detail="任务不存在")
    row["result"] = json.loads(row.pop("result_json")) if row.get("result_json") else None
    return row


@app.get("/api/exports/{filename}", dependencies=[Depends(require_auth)])
def download_export(filename: str) -> FileResponse:
    library, _ = library_and_db()
    if Path(filename).name != filename:
        raise HTTPException(status_code=404)
    target = library / "exports" / filename
    if not target.is_file():
        raise HTTPException(status_code=404)
    return FileResponse(target, filename=filename)


@app.post("/api/packages/inspect", dependencies=[Depends(require_auth)])
def packages_inspect(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> dict:
    library, db = library_and_db()
    pending_id = uuid.uuid4().hex
    destination = library / "tmp" / f"package-{pending_id}.atopack"
    write_upload(file.file, destination)
    job_id = new_job(db, "inspect-atopack")
    background_tasks.add_task(run_inspect_job, db.path, destination, pending_id, job_id)
    return {"job_id": job_id}


@app.post("/api/packages/import", dependencies=[Depends(require_auth)])
def packages_import(payload: PackageImportPayload, background_tasks: BackgroundTasks) -> dict:
    library, db = library_and_db()
    if not re.fullmatch(r"[a-f0-9]{32}", payload.pending_id):
        raise HTTPException(status_code=400, detail="无效的资料包")
    package = library / "tmp" / f"package-{payload.pending_id}.atopack"
    if not package.exists():
        raise HTTPException(status_code=404, detail="资料包预览已失效")
    job_id = new_job(db, "import-atopack")
    background_tasks.add_task(run_import_job, db.path, library, package, payload.replace, job_id)
    return {"job_id": job_id}


@app.post("/api/install", dependencies=[Depends(require_auth)])
def install(payload: InstallPayload, request: Request) -> dict:
    if not local_request(request):
        raise HTTPException(status_code=403, detail="只能在电脑本机安装到原项目")
    library, db = library_and_db()
    root_text = payload.ato_path or config.ato_path
    if not root_text:
        raise HTTPException(status_code=400, detail="请先选择 ATO_assistant 目录")
    root = Path(root_text)
    if payload.apply:
        return apply_install(db, library, root, payload.replacements)
    return install_plan(db, library, root)


def normalize_filename(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", Path(value).stem.lower())


def catalog_candidates(db: Database) -> dict[str, list[tuple[str, str]]]:
    result: dict[str, list[tuple[str, str]]] = {}
    for row in db.all("SELECT id,number,name,faces_json FROM catalog_items"):
        faces = json.loads(row["faces_json"])
        for face, target in faces.items():
            keys = {normalize_filename(Path(target).name), normalize_filename(row["number"]), normalize_filename(row["name"])}
            for key in filter(None, keys):
                result.setdefault(key, []).append((row["id"], face))
    return result


def register_pending(db: Database, library: Path, temp: Path, filename: str, mime_type: str, candidates: dict) -> dict:
    key = normalize_filename(filename)
    matches = candidates.get(key, [])
    if not matches:
        matches = [candidate for candidate_key, values in candidates.items() if len(candidate_key) >= 4 and candidate_key in key for candidate in values]
    matches = list(dict.fromkeys(matches))
    item_id, face = matches[0] if len(matches) == 1 else (None, None)
    pending_id = uuid.uuid4().hex
    stored_rel = temp.relative_to(library).as_posix()
    db.execute(
        "INSERT INTO pending_files(id,stored_path,original_name,mime_type,size,suggested_item_id,suggested_face) VALUES(?,?,?,?,?,?,?)",
        (pending_id, stored_rel, filename, mime_type, temp.stat().st_size, item_id, face),
    )
    return {"id": pending_id, "original_name": filename, "size": temp.stat().st_size, "suggested_item_id": item_id, "suggested_face": face, "ambiguous": len(matches) > 1}


def lan_urls(port: int) -> list[str]:
    addresses = set()
    try:
        host = socket.gethostname()
        for result in socket.getaddrinfo(host, None, socket.AF_INET):
            address = result[4][0]
            if not address.startswith("127."):
                addresses.add(address)
    except OSError:
        pass
    return [f"http://{address}:{port}" for address in sorted(addresses)]


def existing_studio_status(port: int) -> dict[str, Any] | None:
    """Return status when this port already belongs to an ATO Asset Studio."""
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(f"http://127.0.0.1:{port}/api/status", timeout=1) as response:
            if response.status != 200:
                return None
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    required = {"ready", "authenticated", "local", "pairing_required", "lan_urls"}
    return payload if isinstance(payload, dict) and required.issubset(payload) and payload.get("local") else None


def port_is_available(host: str, port: int) -> bool:
    probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        probe.bind((host, port))
    except OSError:
        return False
    finally:
        probe.close()
    return True


def run() -> None:
    import uvicorn
    local_url = f"http://127.0.0.1:{config.port}"
    existing = existing_studio_status(config.port)
    if existing:
        print(f"ATO 素材库已经在运行：{local_url}")
        if existing.get("pairing_code"):
            print(f"本次手机配对码：{existing['pairing_code']}")
        for url in existing.get("lan_urls") or []:
            print(f"手机访问：{url}")
        if os.environ.get("ATO_STUDIO_NO_BROWSER") != "1":
            webbrowser.open(local_url)
        return
    if not port_is_available(config.host, config.port):
        print(f"端口 {config.port} 已被其他程序占用，ATO 素材库无法启动。")
        print("请关闭占用该端口的程序，或修改 .local/config.json 中的 port 后重试。")
        raise SystemExit(1)
    print(f"ATO 素材库已启动：http://127.0.0.1:{config.port}")
    print(f"本次手机配对码：{PAIRING_CODE}")
    for url in lan_urls(config.port):
        print(f"手机访问：{url}")
    if os.environ.get("ATO_STUDIO_NO_BROWSER") != "1":
        import threading
        threading.Timer(1.0, lambda: webbrowser.open(local_url)).start()
    uvicorn.run(app, host=config.host, port=config.port, log_level="info")


if __name__ == "__main__":
    run()
