from typing import Callable, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.rbac import Permission
from app.models.user import User
from app.schemas.user import TokenData

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user."""
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


async def get_current_superuser(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current superuser."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="The user doesn't have enough privileges"
        )
    return current_user


def get_user_permission_keys(user: User) -> set[str]:
    keys: set[str] = set()
    try:
        for role in getattr(user, "roles", []) or []:
            for perm in getattr(role, "permissions", []) or []:
                k = getattr(perm, "key", None)
                if k:
                    keys.add(str(k))
    except Exception:
        return set()
    return keys


async def get_current_permissions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> set[str]:
    if current_user.is_superuser:
        rows = db.query(Permission.key).order_by(Permission.key.asc()).all()
        return {str(r[0]) for r in rows if r and r[0]}
    return get_user_permission_keys(current_user)


def require_permission(permission_key: str) -> Callable:
    async def _checker(
        current_user: User = Depends(get_current_active_user),
        permissions: set[str] = Depends(get_current_permissions),
    ) -> User:
        if current_user.is_superuser:
            return current_user
        if permission_key not in permissions:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        return current_user

    return _checker
