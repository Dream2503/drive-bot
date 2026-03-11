from os import getenv
from backend.database import utils as db 
from backend.database.schema import User,LoginRequest,File
from fastapi import APIRouter, HTTPException, File as FastAPIFile, Form, UploadFile
from backend.database.security import hash_password, verify_password
from backend.database.jwt_handler import create_access_token

router = APIRouter(prefix="/auth")

@router.post("/register")
def register(user: User):
    existing_user = db.get_user(username=user.username)
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    user.password = hash_password(user.password)
    db.add_user(user)
    return {"message": "User registered successfully"}

@router.post("/login")
def login(credentials: LoginRequest):
    user = db.get_user(username=credentials.username)
    if not user or not verify_password(credentials.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"message": "Login successful", 
            "access_token": access_token, 
            "token_type": "bearer"}

@router.post("/upload")
async def upload_file(file: UploadFile = FastAPIFile(...),data_center: str = Form(...),uid: int = Form(...)):
    file_obj = File(
        fname=file.filename,
        flinks=["generated_link"],
        data_center=data_center,
        uid=uid
    )
    db.add_file(file_obj)
    return {"message": "File uploaded successfully"}
