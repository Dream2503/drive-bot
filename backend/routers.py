from backend.database import User
from fastapi import APIRouter, HTTPException
from hashing import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/signup")
def signup(user: User):
    existing_user = db.query(User).filter(User.username == user.username).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    hashed_pwd = hash_password(user.password)
    new_user = User(username=user.username, password=hashed_pwd)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)


@router.post("/signin")
def signin(user: User):
    db_user = db.query(User).filter(User.username == user.username).first()

    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid credentials")

    if not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    return {
        "message": "Login successful",
        "uid": db_user.uid
    }
