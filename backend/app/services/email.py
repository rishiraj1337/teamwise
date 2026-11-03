from __future__ import annotations

import hashlib
import json
import secrets
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass


@dataclass(frozen=True)
class EmailRecipient:
    address: str
    name: str | None = None


class EmailDeliveryError(Exception):
    pass


def _build_zeptomail_auth_header(raw_key: str) -> str:
    raw_key = raw_key.strip()
    if raw_key.lower().startswith("zoho-enczapikey"):
        return raw_key
    return f"Zoho-enczapikey {raw_key}"


def send_html_email(
    *,
    api_url: str,
    api_key: str,
    from_address: str,
    from_name: str,
    to: EmailRecipient,
    subject: str,
    html_body: str,
) -> None:
    payload = {
        "from": {"address": from_address, "name": from_name},
        "to": [
            {
                "email_address": {
                    "address": to.address,
                    "name": to.name or to.address.split("@", 1)[0],
                }
            }
        ],
        "subject": subject,
        "htmlbody": html_body,
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        api_url,
        data=data,
        method="POST",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": _build_zeptomail_auth_header(api_key),
        },
    )
    context = ssl.create_default_context()
    try:
        with urllib.request.urlopen(request, context=context, timeout=30) as response:
            if response.status >= 400:
                body = response.read().decode("utf-8", errors="replace")
                raise EmailDeliveryError(f"ZeptoMail HTTP {response.status}: {body[:500]}")
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise EmailDeliveryError(f"ZeptoMail HTTP {error.code}: {body[:500]}") from error
    except urllib.error.URLError as error:
        raise EmailDeliveryError(f"Could not reach ZeptoMail: {error.reason}") from error


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"
