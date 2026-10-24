from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user, issue_token
from ..crypto import hash_password, new_share_code, verify_password
from ..db import get_db
from ..models import User
from ..schemas import LoginIn, RegisterIn, TokenOut, UserOut
from ..services import audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    code = new_share_code()
    while db.scalar(select(User).where(User.share_code == code)):
        code = new_share_code()
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
        role="member",
        share_code=code,
    )
    db.add(user)
    db.flush()
    audit(db, member_id=user.id, actor_id=user.id, action="account.created")
    db.commit()
    return TokenOut(access_token=issue_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return TokenOut(access_token=issue_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
