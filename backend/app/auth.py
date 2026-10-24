from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import JWT_SECRET, JWT_TTL_HOURS
from .db import get_db
from .models import User

_bearer = HTTPBearer(auto_error=False)


def issue_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "exp": datetime.now(UTC) + timedelta(hours=JWT_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return user


def current_member(user: User = Depends(current_user)) -> User:
    if user.role != "member":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Members only")
    return user


def current_provider_staff(user: User = Depends(current_user)) -> User:
    if user.role != "provider" or user.provider_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Provider staff only")
    return user
