#!/usr/bin/env python3
"""Render the dashboard navigation row in headless Chrome for visual checking.

Extracts the real ``.dashboard-navigation`` markup out of ``index.html`` and
re-loads the real stylesheets, so the screenshot shows exactly what the page
renders -- no mock-up involved.  Requires Chrome or Edge on PATH-adjacent
default install locations.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "index.html"
OUT_DIR = Path(__file__).resolve().parent / "nav-preview"

BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

NAV_RE = re.compile(r'(<div class="dashboard-navigation">.*?\n    </div>)', re.S)

HARNESS = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="../../api/dashboard.css">
<link rel="stylesheet" href="../../assets/theme.css">
<style>
  body {{ margin: 0; padding: 26px 40px; background: var(--page-bg, #faf6ec); }}
</style>
</head>
<body data-theme-dashboard>
{nav}
</body>
</html>
"""


def find_browser() -> str:
    for b in BROWSERS:
        if Path(b).exists():
            return b
    raise SystemExit("no Chrome/Edge found")


def main() -> int:
    html = INDEX.read_text(encoding="utf-8")
    m = NAV_RE.search(html)
    if not m:
        raise SystemExit("cannot find .dashboard-navigation in index.html")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    page = OUT_DIR / "nav.html"
    page.write_text(HARNESS.format(nav=m.group(1)), encoding="utf-8")

    shot = OUT_DIR / "nav.png"
    if shot.exists():
        shot.unlink()
    profile = OUT_DIR / "chrome-profile"
    profile.mkdir(exist_ok=True)
    cmd = [find_browser(), "--headless=new", "--disable-gpu", "--hide-scrollbars",
           "--no-sandbox", f"--user-data-dir={profile}",
           "--force-device-scale-factor=2",
           "--virtual-time-budget=1500",
           f"--screenshot={shot}", "--window-size=1400,180",
           page.as_uri()]
    print(f"rendering {page.name} -> {shot.name}")
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                       encoding="utf-8", errors="replace")
    if not shot.exists():
        print(f"chrome exit {r.returncode}", file=sys.stderr)
        print((r.stdout or "")[-2000:], (r.stderr or "")[-2000:], file=sys.stderr)
        return 1
    print(f"wrote {shot} ({shot.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
