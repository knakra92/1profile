from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, GEMINI_API_KEY, LLM_MODEL
from .db import Base, engine
from .routers import auth, member, provider

Base.metadata.create_all(engine)

app = FastAPI(title="1Profile API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(member.router)
app.include_router(provider.router)


@app.get("/health")
def health():
    return {"ok": True, "model": LLM_MODEL, "model_ready": bool(GEMINI_API_KEY)}
