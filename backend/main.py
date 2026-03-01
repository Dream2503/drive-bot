from fastapi import FastAPI
from backend.database.get_db import engine,Base
from backend.models import user,files,owns
from fastapi.middleware.cors import CORSMiddleware
from backend.routers import router

Base.metadata.create_all(engine)

app = FastAPI()
origins = ["http://localhost:5173"]

app.include_router(router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


