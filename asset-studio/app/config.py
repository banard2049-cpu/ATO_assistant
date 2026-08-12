from __future__ import annotations

import json
import os
import secrets
from dataclasses import asdict, dataclass
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[1]
LOCAL_DIR = PROJECT_DIR / ".local"
CONFIG_FILE = LOCAL_DIR / "config.json"


@dataclass
class AppConfig:
    library_path: str = ""
    ato_path: str = ""
    host: str = "0.0.0.0"
    port: int = 8765

    @property
    def library(self) -> Path | None:
        return Path(self.library_path).expanduser().resolve() if self.library_path else None

    @property
    def ato(self) -> Path | None:
        return Path(self.ato_path).expanduser().resolve() if self.ato_path else None


def load_config() -> AppConfig:
    if not CONFIG_FILE.exists():
        return AppConfig()
    try:
        raw = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return AppConfig()
    return AppConfig(
        library_path=str(raw.get("library_path") or ""),
        ato_path=str(raw.get("ato_path") or ""),
        host=str(raw.get("host") or "0.0.0.0"),
        port=int(raw.get("port") or 8765),
    )


def save_config(config: AppConfig) -> None:
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    temp = CONFIG_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(asdict(config), ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, CONFIG_FILE)


def ensure_library(config: AppConfig) -> Path:
    library = config.library
    if library is None:
        raise RuntimeError("请先设置资料库目录")
    library.mkdir(parents=True, exist_ok=True)
    for child in ("objects", "previews", "sources", "tmp", "exports", "backups"):
        (library / child).mkdir(exist_ok=True)
    return library


STARTUP_SECRET = secrets.token_urlsafe(32)
PAIRING_CODE = f"{secrets.randbelow(1_000_000):06d}"

