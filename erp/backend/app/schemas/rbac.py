from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class PermissionBase(BaseModel):
    key: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = None


class PermissionCreate(PermissionBase):
    pass


class PermissionOut(PermissionBase):
    id: int

    class Config:
        from_attributes = True


class RoleBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    description: Optional[str] = None


class RoleCreate(RoleBase):
    permission_keys: list[str] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    description: Optional[str] = None
    permission_keys: Optional[list[str]] = None


class RoleOut(RoleBase):
    id: int
    is_system: bool
    permissions: list[PermissionOut] = []

    class Config:
        from_attributes = True


class AdminUserCreate(BaseModel):
    email: str
    username: str
    full_name: Optional[str] = None
    password: str = Field(..., min_length=6)
    is_active: bool = True
    is_superuser: bool = False
    role_ids: list[int] = []


class AdminUserOut(BaseModel):
    id: int
    email: str
    username: str
    full_name: Optional[str] = None
    is_active: bool
    is_superuser: bool
    roles: list[RoleOut] = []

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=6)
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None
    role_ids: Optional[list[int]] = None
