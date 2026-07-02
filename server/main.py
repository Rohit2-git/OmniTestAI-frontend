from dotenv import load_dotenv   # type: ignore
load_dotenv()

from fastapi import FastAPI   # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
from fastapi.staticfiles import StaticFiles  # type: ignore
from app.database import db

import app.routers.health as health
import app.routers.tests as tests
import app.routers.results as results
import app.routers.generate as generate
import app.routers.execute as execute
import app.routers.knowledge as knowledge
import app.routers.dashboard as dashboard
import app.routers.auth as auth
from app.routers.token_usage import router as token_usage_router
from app.routers import test_data
from app.services.media_storage import MEDIA_ROOT

app = FastAPI(
    title="OmniTestAI",
    description="Agentic test automation API — Web, API, Performance, Accessibility, Security, Mobile",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # ⚠️ update to your actual frontend origin(s); wildcard "*" breaks cookies
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],  
)

@app.on_event("startup")
async def startup():
    await db.connect()

@app.on_event("shutdown")
async def shutdown():
    await db.disconnect()

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(tests.router)
app.include_router(results.router)
app.include_router(generate.router)
app.include_router(execute.router)
app.include_router(knowledge.router)
app.include_router(dashboard.router)
app.include_router(token_usage_router)
app.include_router(test_data.router)

# Serve execution screenshots/videos as static files at /media/...
app.mount("/media", StaticFiles(directory=MEDIA_ROOT), name="media")