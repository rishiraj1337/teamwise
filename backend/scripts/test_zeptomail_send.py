#!/usr/bin/env python3
"""One-off ZeptoMail test send. Run from teamwise/backend: python3 scripts/test_zeptomail_send.py"""
from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request
from pathlib import Path

TO_EMAIL = "vanshika.soni@npstx.com"
TO_NAME = "Vanshika"


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        values[key.strip()] = val.strip()
    return values


def build_auth_header(raw_key: str) -> str:
    raw_key = raw_key.strip()
    if raw_key.lower().startswith("zoho-enczapikey"):
        return raw_key
    return f"Zoho-enczapikey {raw_key}"


def send_mail(*, api_url: str, auth_header: str, from_address: str, from_name: str) -> tuple[int, str]:
    body = {
        "from": {"address": from_address, "name": from_name},
        "to": [
            {
                "email_address": {
                    "address": TO_EMAIL,
                    "name": TO_NAME,
                }
            }
        ],
        "subject": "Teamwise ZeptoMail test",
        "htmlbody": (
            "<div><b>Teamwise backend test email</b>"
            "<p>If you received this, ZeptoMail credentials in .env are working.</p></div>"
        ),
    }
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        api_url,
        data=data,
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": auth_header,
        },
    )
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, context=context, timeout=30) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        return error.code, payload


def main() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    env = load_env(env_path)

    api_url = env.get("ZEPTOMAIL_API_URL", "")
    api_key = env.get("ZEPTOMAIL_API_KEY", "")
    from_address = env.get("ZEPTOMAIL_FROM_ADDRESS", "")
    from_name = env.get("ZEPTOMAIL_FROM_NAME", "Teamwise")

    missing = [name for name, val in [
        ("ZEPTOMAIL_API_URL", api_url),
        ("ZEPTOMAIL_API_KEY", api_key),
        ("ZEPTOMAIL_FROM_ADDRESS", from_address),
    ] if not val]
    if missing:
        print("CONFIG_ERROR: missing or unreadable in .env (check leading spaces on keys):", ", ".join(missing))
        print("Loaded keys:", ", ".join(sorted(k for k in env if k.startswith("ZEPTO"))))
        return

    auth_header = build_auth_header(api_key)
    print(f"POST {api_url}")
    print(f"From: {from_name} <{from_address}>")
    print(f"To: {TO_EMAIL}")
    print(f"Auth prefix: {auth_header.split()[0]} (key length {len(api_key)} chars)")

    status, text = send_mail(
        api_url=api_url,
        auth_header=auth_header,
        from_address=from_address,
        from_name=from_name,
    )
    print(f"HTTP {status}")
    print(text[:2000] if text else "(empty body)")

    if status >= 400:
        print("\n--- Likely fixes ---")
        if status == 401:
            print("- Use full Send Mail token from ZeptoMail: Authorization must be 'Zoho-enczapikey <token>'.")
            print("- Regenerate key in Mail Agent → SMTP/API if unsure.")
        if "leading space" in text.lower() or missing:
            print("- Remove leading spaces before ZEPTOMAIL_* lines in .env so variables load correctly.")


if __name__ == "__main__":
    main()
