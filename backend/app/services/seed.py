from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Department, Permission, Role, RolePermission

DEFAULT_DEPARTMENTS = [
    ("Engineering", "engineering"),
    ("Human Resources", "hr"),
    ("Compliance", "compliance"),
    ("Sales", "sales"),
    ("Finance", "finance"),
    ("Workspace", "workspace"),
    ("Operations", "operations"),
]

DEFAULT_ROLES = ["employee", "manager", "admin"]

DEFAULT_PERMISSIONS = [
    ("workspace", "read"),
    ("reviews", "read"),
    ("reviews", "report"),
    ("users", "manage"),
]

ROLE_PERMISSIONS = {
    "employee": [("workspace", "read"), ("reviews", "read")],
    "manager": [("workspace", "read"), ("reviews", "read"), ("reviews", "report")],
    "admin": [
        ("workspace", "read"),
        ("reviews", "read"),
        ("reviews", "report"),
        ("users", "manage"),
    ],
}


def seed_rbac_if_empty(db: Session) -> None:
    if db.scalar(select(Department.id).limit(1)) is not None:
        return

    for name, code in DEFAULT_DEPARTMENTS:
        if code == "operations":
            continue
        db.add(Department(name=name, code=code))
    db.flush()
    db.add(Department(id=101, name="Operations", code="operations"))
    for role_name in DEFAULT_ROLES:
        db.add(Role(name=role_name))
    db.flush()

    permission_id: dict[tuple[str, str], int] = {}
    for resource, action in DEFAULT_PERMISSIONS:
        permission = Permission(resource=resource, action=action)
        db.add(permission)
        db.flush()
        permission_id[(resource, action)] = permission.id

    role_rows = db.scalars(select(Role)).all()
    role_id = {role.name: role.id for role in role_rows}
    for role_name, pairs in ROLE_PERMISSIONS.items():
        for resource, action in pairs:
            db.add(
                RolePermission(
                    role_id=role_id[role_name],
                    permission_id=permission_id[(resource, action)],
                )
            )
    db.commit()
