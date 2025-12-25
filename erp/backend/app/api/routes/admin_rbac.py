from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import require_permission
from app.core.database import get_db
from app.core.security import get_password_hash
from app.models.rbac import Permission, Role
from app.models.user import User
from app.schemas.rbac import (
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
    PermissionCreate,
    PermissionOut,
    RoleCreate,
    RoleOut,
    RoleUpdate,
)

router = APIRouter()


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(
    db: Session = Depends(get_db),
    _u: User = Depends(require_permission("rbac:admin")),
):
    return db.query(Permission).order_by(Permission.key.asc()).all()


@router.post("/permissions", response_model=PermissionOut, status_code=status.HTTP_201_CREATED)
def create_permission(
    payload: PermissionCreate,
    db: Session = Depends(get_db),
    _u: User = Depends(require_permission("rbac:admin")),
):
    key = payload.key.strip()
    exists = db.query(Permission).filter(Permission.key == key).first()
    if exists:
        raise HTTPException(status_code=400, detail="Permission key already exists")
    p = Permission(key=key, description=payload.description)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.get("/roles", response_model=list[RoleOut])
def list_roles(
    db: Session = Depends(get_db),
    _u: User = Depends(require_permission("rbac:admin")),
):
    return db.query(Role).order_by(Role.name.asc()).all()


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    _u: User = Depends(require_permission("rbac:admin")),
):
    name = payload.name.strip()
    exists = db.query(Role).filter(Role.name == name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Role name already exists")

    perms: list[Permission] = []
    if payload.permission_keys:
        perms = db.query(Permission).filter(Permission.key.in_([k.strip() for k in payload.permission_keys])).all()

    r = Role(name=name, description=payload.description, is_system=False)
    r.permissions = perms
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.put("/roles/{role_id}", response_model=RoleOut)
def update_role(
    role_id: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    _u: User = Depends(require_permission("rbac:admin")),
):
    r = db.query(Role).filter(Role.id == role_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Role not found")

    if payload.name is not None:
        new_name = payload.name.strip()
        other = db.query(Role).filter(Role.name == new_name, Role.id != role_id).first()
        if other:
            raise HTTPException(status_code=400, detail="Role name already exists")
        r.name = new_name

    if payload.description is not None:
        r.description = payload.description

    if payload.permission_keys is not None:
        keys = [k.strip() for k in payload.permission_keys]
        perms = db.query(Permission).filter(Permission.key.in_(keys)).all() if keys else []
        r.permissions = perms

    db.commit()
    db.refresh(r)
    return r


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    _u: User = Depends(require_permission("rbac:admin")),
):
    r = db.query(Role).filter(Role.id == role_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Role not found")
    if r.is_system:
        raise HTTPException(status_code=400, detail="System roles cannot be deleted")
    db.delete(r)
    db.commit()
    return None


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    db: Session = Depends(get_db),
    _u: User = Depends(require_permission("rbac:admin")),
):
    return db.query(User).order_by(User.id.asc()).all()


@router.post("/users", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    _u: User = Depends(require_permission("rbac:admin")),
):
    existing = db.query(User).filter((User.email == payload.email) | (User.username == payload.username)).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email or username already exists")

    u = User(
        email=payload.email,
        username=payload.username,
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        is_active=payload.is_active,
        is_superuser=payload.is_superuser,
    )

    if payload.role_ids:
        roles = db.query(Role).filter(Role.id.in_(payload.role_ids)).all()
        u.roles = roles  # type: ignore[attr-defined]

    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@router.put("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    _u: User = Depends(require_permission("rbac:admin")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        u.email = payload.email
    if payload.username is not None:
        u.username = payload.username
    if payload.full_name is not None:
        u.full_name = payload.full_name
    if payload.is_active is not None:
        u.is_active = payload.is_active
    if payload.is_superuser is not None:
        u.is_superuser = payload.is_superuser
    if payload.password is not None:
        u.hashed_password = get_password_hash(payload.password)

    if payload.role_ids is not None:
        roles = db.query(Role).filter(Role.id.in_(payload.role_ids)).all() if payload.role_ids else []
        u.roles = roles  # type: ignore[attr-defined]

    db.commit()
    db.refresh(u)
    return u


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _u: User = Depends(require_permission("rbac:admin")),
):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(u)
    db.commit()
    return None
