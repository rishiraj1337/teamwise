from pydantic import BaseModel, EmailStr


class TeamwiseUserSummary(BaseModel):
    id: int
    emp_id: str
    email: EmailStr
    name: str
    department: str
    role: str
    status: str


class TeamwiseUsersListResponse(BaseModel):
    users: list[TeamwiseUserSummary]
    total: int
    limit: int
    offset: int = 0


class RoleOption(BaseModel):
    id: int
    name: str


class PermissionOption(BaseModel):
    id: int
    resource: str
    action: str
    key: str


class RolesMatrixResponse(BaseModel):
    roles: list[RoleOption]
    permissions: list[PermissionOption]
    matrix: dict[str, list[int]]


class UpdateRolesMatrixRequest(BaseModel):
    matrix: dict[str, list[int]]


class UpdateUserRoleRequest(BaseModel):
    role_id: int | None = None
    role_name: str | None = None
    department_id: int | None = None
