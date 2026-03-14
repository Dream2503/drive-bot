import os
from fastapi import APIRouter, HTTPException, UploadFile, Form
from fastapi.responses import StreamingResponse
import json

from backend.database.schema import File
from backend.database import add_user, get_user, LoginRequest, User
from backend.server.jwt_handler import create_access_token
from backend.server.security import hash_password, verify_password
from core.transfer import upload

router: APIRouter = APIRouter(prefix="/auth")
UPLOAD_DIR = "transfer"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/register")
def register(user: User) -> dict[str, str]:
    existing_user: User | None = get_user(username=user.username)

    if existing_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    user.password = hash_password(user.password)
    add_user(user)
    return {"message": "User registered successfully"}


@router.post("/login")
def login(credentials: LoginRequest) -> dict[str, str]:
    user: User | None = get_user(username=credentials.username)

    if not user or not verify_password(credentials.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    access_token: str = create_access_token(data={"sub": user.username})

    return {
        "Message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
    }

@router.post("/upload")
async def upload_route(
    file: UploadFile,
    data_center: str = Form(...),
    uid: int = Form(...)
):

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            buffer.write(chunk)

    file_job = File(
        fname=file.filename,
        flinks=[],
        data_center=data_center,
        uid=uid
    )

    def progress_stream():
        for progress in upload(file_job):
            yield json.dumps({"progress": progress}) + "\n"

    return StreamingResponse(progress_stream(), media_type="text/plain")


@router.get("/files")
def get_files():

    files = []

    for i, filename in enumerate(os.listdir(UPLOAD_DIR)):
        files.append({
            "id": i,
            "name": filename
        })

    return files