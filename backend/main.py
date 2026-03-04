from fastapi import FastAPI
from routers import router

app: FastAPI = FastAPI()
origins: list[str] = ["http://localhost:5173"]

app.include_router(router)
