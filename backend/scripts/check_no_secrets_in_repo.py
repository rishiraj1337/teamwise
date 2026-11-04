#!/usr/bin/env python3
"""Check that obvious secrets are not committed. Run from repo root before QA release."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PATTERNS = [
    re.compile(r"Zoho-enczapikey\s+[A-Za-z0-9+/=]{20,}", re.I),
    re.compile(r"^ZEPTOMAIL_API_KEY=(?!$|Zoho-enczapikey\s*<)", re.M),
]

SKIP_DIRS = {".git", "node_modules", ".venv", "dist", "__pycache__", ".pytest_cache"}
SKIP_FILES = {".env", ".env.example"}


def iter_files() -> list[Path]:
    files: list[Path] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.name in SKIP_FILES:
            continue
        if path.suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2"}:
            continue
        files.append(path)
    return files


def main() -> int:
    findings: list[str] = []
    for path in iter_files():
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pattern in PATTERNS:
            if pattern.search(text):
                findings.append(f"{path.relative_to(ROOT)}: possible secret ({pattern.pattern})")
                break

    if findings:
        print("Possible secrets found in tracked files:")
        for item in findings:
            print(f"  - {item}")
        return 1

    print("No obvious ZeptoMail secrets found in scanned files (excluding .env).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
