from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models import Department, Permission, Role, RolePermission, User, UserRole

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
    if db.scalar(select(Department.id).limit(1)) is None:
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

    # Ensure default platform administrator account exists
    admin_user = db.scalar(select(User).where(User.email == "admin@company.com"))
    if not admin_user:
        admin_role = db.scalar(select(Role).where(Role.name == "admin"))
        dept = db.scalar(select(Department).where(Department.code == "operations"))
        if not dept:
            dept = db.scalar(select(Department).limit(1))

        admin = User(
            emp_id="ADMIN001",
            email="admin@company.com",
            password=hash_password("AdminPassword123!"),
            name="System Administrator",
            department_id=dept.id if dept else 1,
            is_active=True,
            job_title="System Administrator",
            mobile_number="+10000000000",
        )
        db.add(admin)
        db.flush()
        if admin_role:
            db.add(UserRole(user_id=admin.id, role_id=admin_role.id, department_id=admin.department_id))
        db.commit()
