from backend.routers import router
from fastapi import FastAPI

app: FastAPI = FastAPI()
origins: list[str] = ["http://localhost:5173"]

app.include_router(router)
