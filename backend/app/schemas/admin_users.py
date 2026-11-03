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
