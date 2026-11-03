"""RBAC tables, users.id primary key, and department linkage.

Revision ID: 0002_rbac_and_user_department
Revises: 0001_create_users
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "0002_rbac_and_user_department"
down_revision = "0001_create_users"
branch_labels = None
depends_on = None

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


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    return any(column["name"] == column_name for column in inspect(bind).get_columns(table_name))


def upgrade() -> None:
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("resource", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("resource", "action", name="uq_permissions_resource_action"),
    )
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("role_id", "permission_id"),
    )

    departments = sa.table(
        "departments",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("code", sa.String),
    )
    op.bulk_insert(
        departments,
        [{"id": index + 1, "name": name, "code": code} for index, (name, code) in enumerate(DEFAULT_DEPARTMENTS)],
    )

    roles = sa.table("roles", sa.column("id", sa.Integer), sa.column("name", sa.String))
    op.bulk_insert(
        roles,
        [{"id": index + 1, "name": name} for index, name in enumerate(DEFAULT_ROLES)],
    )

    permissions = sa.table(
        "permissions",
        sa.column("id", sa.Integer),
        sa.column("resource", sa.String),
        sa.column("action", sa.String),
    )
    op.bulk_insert(
        permissions,
        [
            {"id": index + 1, "resource": resource, "action": action}
            for index, (resource, action) in enumerate(DEFAULT_PERMISSIONS)
        ],
    )

    connection = op.get_bind()
    permission_rows = connection.execute(
        sa.text("SELECT id, resource, action FROM permissions")
    ).fetchall()
    permission_id = {(row.resource, row.action): row.id for row in permission_rows}
    role_rows = connection.execute(sa.text("SELECT id, name FROM roles")).fetchall()
    role_id = {row.name: row.id for row in role_rows}

    role_permissions = sa.table(
        "role_permissions",
        sa.column("role_id", sa.Integer),
        sa.column("permission_id", sa.Integer),
    )
    role_permission_rows: list[dict[str, int]] = []
    for role_name, pairs in ROLE_PERMISSIONS.items():
        for resource, action in pairs:
            role_permission_rows.append(
                {"role_id": role_id[role_name], "permission_id": permission_id[(resource, action)]}
            )
    op.bulk_insert(role_permissions, role_permission_rows)

    if not _has_column("users", "department_id"):
        op.add_column("users", sa.Column("department_id", sa.Integer(), nullable=True))
    if not _has_column("users", "is_active"):
        op.add_column(
            "users",
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        )

    if _has_column("users", "department"):
        connection.execute(
            sa.text(
                """
                UPDATE users u
                LEFT JOIN departments d ON LOWER(d.name) = LOWER(u.department)
                SET u.department_id = COALESCE(
                    d.id,
                    (SELECT id FROM departments WHERE code = 'workspace' LIMIT 1)
                )
                WHERE u.department_id IS NULL
                """
            )
        )
    else:
        connection.execute(
            sa.text(
                """
                UPDATE users
                SET department_id = (SELECT id FROM departments WHERE code = 'workspace' LIMIT 1)
                WHERE department_id IS NULL
                """
            )
        )

    op.alter_column("users", "department_id", existing_type=sa.Integer(), nullable=False)
    if not _has_column("users", "id"):
        connection.execute(
            sa.text(
                """
                ALTER TABLE users
                  ADD COLUMN id INT NOT NULL AUTO_INCREMENT FIRST,
                  DROP PRIMARY KEY,
                  ADD PRIMARY KEY (id),
                  ADD UNIQUE KEY uq_users_emp_id (emp_id)
                """
            )
        )
    op.create_foreign_key("fk_users_department_id", "users", "departments", ["department_id"], ["id"])

    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "role_id", "department_id"),
    )

    if _has_column("users", "role"):
        connection.execute(
            sa.text(
                """
                INSERT INTO user_roles (user_id, role_id, department_id)
                SELECT
                    u.id,
                    COALESCE(r.id, (SELECT id FROM roles WHERE name = 'employee' LIMIT 1)),
                    u.department_id
                FROM users u
                LEFT JOIN roles r ON LOWER(r.name) = LOWER(u.role)
                """
            )
        )

    if _has_column("users", "department"):
        op.drop_column("users", "department")
    if _has_column("users", "role"):
        op.drop_column("users", "role")
    if _has_column("users", "token_version"):
        op.drop_column("users", "token_version")


def downgrade() -> None:
    connection = op.get_bind()

    op.add_column("users", sa.Column("role", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("department", sa.String(length=255), nullable=True))

    connection.execute(
        sa.text(
            """
            UPDATE users u
            JOIN departments d ON d.id = u.department_id
            SET u.department = d.name
            """
        )
    )
    connection.execute(
        sa.text(
            """
            UPDATE users u
            JOIN (
                SELECT ur.user_id, MIN(r.name) AS role_name
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
                GROUP BY ur.user_id
            ) role_map ON role_map.user_id = u.id
            SET u.role = role_map.role_name
            """
        )
    )
    op.alter_column("users", "department", existing_type=sa.String(length=255), nullable=False)
    op.alter_column("users", "role", existing_type=sa.String(length=64), nullable=False)

    op.drop_table("user_roles")
    op.drop_constraint("fk_users_department_id", "users", type_="foreignkey")
    op.drop_column("users", "is_active")
    op.drop_column("users", "department_id")

    connection.execute(
        sa.text(
            """
            ALTER TABLE users
              DROP PRIMARY KEY,
              DROP COLUMN id,
              ADD PRIMARY KEY (emp_id)
            """
        )
    )

    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")
    op.drop_table("departments")
