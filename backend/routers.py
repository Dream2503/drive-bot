from backend import database
from backend.database import User
from fastapi import APIRouter, HTTPException
from passlib.context import CryptContext

router: APIRouter = APIRouter(prefix="/auth", tags=["Auth"])
HASH_CTX: CryptContext = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/signup")
def signup(user: User) -> dict[str, str]:
    existing_user: User | None = database.get_user(username=user.username)

    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    user.password = HASH_CTX.hash(user.password)
    database.add_user(user)
    return {"message": "User created successfully"}


@router.post("/signin")
def signin(user: User) -> dict[str, str | int]:
    existing_user: User | None = database.get_user(username=user.username)

    if not existing_user or not HASH_CTX.verify(user.password, existing_user.password):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    if existing_user.uid is None:
        raise HTTPException(status_code=500, detail="User record corrupted")

    return {"message": "Login successful", "uid": existing_user.uid}
