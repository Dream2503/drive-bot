from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy.orm import Session
from .database.get_db import get_db
from .security import hash_pwd,verify_pwd
from backend.schema.user import UserCreate,UserLogin
from backend.models.user import User

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/signup")
def signup(user:UserCreate, db: Session=Depends(get_db)):
    existing_user = db.query(User).filter(User.username == user.username).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    hashed_pwd = hash_pwd(user.password)
    new_user = User(username=user.username, password=hashed_pwd)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

@router.post("/signin")
def signin(user: UserLogin, db: Session = Depends(get_db)):

    db_user = db.query(User).filter(User.username == user.username).first()

    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid credentials")

    if not verify_pwd(user.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    return {
        "message": "Login successful",
        "uid": db_user.uid
    }