import json
from datetime import date, datetime, time, timezone
from typing import Any

from fastapi import Request
from sqlalchemy import func, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import AuditLog, User
from app.schemas.audit import AuditLogPublic


def _client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return None


def record_audit(
    db: Session,
    *,
    action: str,
    resource_type: str,
    summary: str,
    actor: User | None = None,
    actor_email: str | None = None,
    resource_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    ip = _client_ip(request)
    email = actor.email if actor is not None else actor_email
    emp_id = actor.emp_id if actor is not None else None
    row = AuditLog(
        actor_emp_id=emp_id,
        actor_email=email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        summary=summary[:500],
        metadata_json=json.dumps(metadata, default=str) if metadata else None,
        ip_address=ip,
    )
    db.add(row)
    db.commit()


def list_audit_logs(db: Session, *, limit: int = 50, offset: int = 0) -> tuple[list[AuditLog], int]:
    total = db.scalar(select(func.count()).select_from(AuditLog)) or 0
    rows = db.scalars(
        select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    ).all()
    return list(rows), int(total)


def _audit_sort_key(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_end_datetime(value: date | datetime | str | None) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time(23, 59, 59, 999999), tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    if "T" not in str(value):
        parsed = parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
    return parsed


def _parse_start_datetime(value: date | datetime | str | None) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min, tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _teamwise_audit_query(db: Session, *, action, resource_type, search, start_date, end_date):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"%{action.strip()}%"))
    if resource_type:
        stmt = stmt.where(AuditLog.resource_type.ilike(f"%{resource_type.strip()}%"))
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            (AuditLog.actor_email.ilike(term))
            | (AuditLog.actor_emp_id.ilike(term))
            | (AuditLog.action.ilike(term))
            | (AuditLog.resource_type.ilike(term))
            | (AuditLog.summary.ilike(term))
            | (AuditLog.metadata_json.ilike(term))
        )
    start_dt = _parse_start_datetime(start_date)
    end_dt = _parse_end_datetime(end_date)
    if start_dt is not None:
        stmt = stmt.where(AuditLog.created_at >= start_dt)
    if end_dt is not None:
        stmt = stmt.where(AuditLog.created_at <= end_dt)
    return stmt


def _enterprise_audit_rows(
    review_engine: Engine | None,
    *,
    action: str | None,
    resource_type: str | None,
    search: str | None,
    start_date: date | datetime | str | None,
    end_date: date | datetime | str | None,
    cap: int = 5000,
) -> list[AuditLogPublic]:
    if review_engine is None:
        return []

    conditions = ["1=1"]
    params: dict[str, Any] = {"cap": cap}

    if action:
        conditions.append("action LIKE :action")
        params["action"] = f"%{action.strip()}%"
    if resource_type:
        conditions.append("resource LIKE :resource")
        params["resource"] = f"%{resource_type.strip()}%"
    if search:
        conditions.append(
            "(user_email LIKE :search OR action LIKE :search OR resource LIKE :search OR details LIKE :search)"
        )
        params["search"] = f"%{search.strip()}%"
    start_dt = _parse_start_datetime(start_date)
    end_dt = _parse_end_datetime(end_date)
    if start_dt is not None:
        conditions.append("created_at >= :start_date")
        params["start_date"] = start_dt.replace(tzinfo=None)
    if end_dt is not None:
        conditions.append("created_at <= :end_date")
        params["end_date"] = end_dt.replace(tzinfo=None)

    sql = f"""
        SELECT id, user_email, action, resource, details, ip_address, created_at
        FROM audit_logs
        WHERE {' AND '.join(conditions)}
        ORDER BY created_at DESC
        LIMIT :cap
    """
    rows: list[AuditLogPublic] = []
    try:
        with review_engine.connect() as conn:
            result = conn.execute(text(sql), params)
            for row in result.mappings():
                details = row["details"]
                summary = str(row["action"]).replace("_", " ")
                actor_emp_id = None
                if details:
                    try:
                        parsed = json.loads(details)
                        if isinstance(parsed, dict):
                            actor_emp_id = parsed.get("actor_emp_id")
                            summary = parsed.get("summary") or summary
                    except json.JSONDecodeError:
                        summary = str(details)[:500]
                created = row["created_at"]
                if isinstance(created, datetime) and created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                rows.append(
                    AuditLogPublic(
                        id=int(row["id"]) + 1_000_000_000,
                        created_at=created,
                        actor_emp_id=str(actor_emp_id) if actor_emp_id else None,
                        actor_email=row["user_email"],
                        action=str(row["action"]),
                        resource_type=str(row["resource"]),
                        resource_id=str(row["resource"]) if len(str(row["resource"])) < 64 else None,
                        summary=summary[:500],
                        metadata_json=details,
                        ip_address=row["ip_address"],
                        source="enterprise",
                    )
                )
    except SQLAlchemyError:
        return []
    return rows


def list_merged_audit_logs(
    db: Session,
    review_engine: Engine | None,
    *,
    limit: int,
    offset: int,
    action: str | None = None,
    resource_type: str | None = None,
    search: str | None = None,
    start_date: date | datetime | str | None = None,
    end_date: date | datetime | str | None = None,
) -> tuple[list[AuditLogPublic], int]:
    tw_stmt = _teamwise_audit_query(
        db,
        action=action,
        resource_type=resource_type,
        search=search,
        start_date=start_date,
        end_date=end_date,
    )
    tw_rows = db.scalars(tw_stmt.order_by(AuditLog.created_at.desc()).limit(5000)).all()
    tw_items = [
        AuditLogPublic(
            id=row.id,
            created_at=row.created_at,
            actor_emp_id=row.actor_emp_id,
            actor_email=row.actor_email,
            action=row.action,
            resource_type=row.resource_type,
            resource_id=row.resource_id,
            summary=row.summary,
            metadata_json=row.metadata_json,
            ip_address=row.ip_address,
            source="teamwise",
        )
        for row in tw_rows
    ]

    ent_items = _enterprise_audit_rows(
        review_engine,
        action=action,
        resource_type=resource_type,
        search=search,
        start_date=start_date,
        end_date=end_date,
    )

    merged = sorted(
        tw_items + ent_items,
        key=lambda item: _audit_sort_key(item.created_at),
        reverse=True,
    )
    total = len(merged)
    page = merged[offset : offset + limit]
    return page, total
