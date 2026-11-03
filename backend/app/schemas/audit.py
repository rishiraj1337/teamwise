from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    actor_emp_id: str | None
    actor_email: str | None
    action: str
    resource_type: str
    resource_id: str | None
    summary: str
    metadata_json: str | None
    ip_address: str | None
    source: str = "teamwise"


class AuditLogListResponse(BaseModel):
    items: list[AuditLogPublic]
    total: int
    limit: int
    offset: int
