from pydantic import BaseModel, ConfigDict


class DepartmentOption(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str


class RoleOption(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class RegistrationOptionsResponse(BaseModel):
    departments: list[DepartmentOption]
    roles: list[RoleOption]
