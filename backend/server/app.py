"""Create and configure the StoreLimitless API application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.server.routers import auth, public

app: FastAPI = FastAPI()

# Media downloads are redirected by the stable Vercel host to the active
# Cloudflare tunnel so large files can stream without passing through Vercel.
# Apply CORS globally so both successful byte streams and FastAPI error responses
# (for example, expired tokens or missing files) remain readable by the frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://storelimitless.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Range",
        "Accept-Ranges",
        "Content-Length",
        "Content-Disposition",
        "ETag",
    ],
)

app.include_router(auth)
app.include_router(public)
