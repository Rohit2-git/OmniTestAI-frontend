from dotenv import load_dotenv   # type: ignore
load_dotenv()

from fastapi import FastAPI   # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
from app.database import db

# Explicitly import each router module directly from its file path
import app.routers.health as health
import app.routers.tests as tests
import app.routers.results as results
import app.routers.generate as generate
import app.routers.execute as execute
import app.routers.knowledge as knowledge
import app.routers.dashboard as dashboard

app = FastAPI(
    title="OmniTestAI",
    description="Agentic test automation API — Web, API, Performance, Accessibility, Security, Mobile",
    version="1.0.0"
)

# CORS Middleware Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
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


# Registering Routers directly with the application engine core
app.include_router(health.router)
app.include_router(tests.router)
app.include_router(results.router)
app.include_router(generate.router)
app.include_router(execute.router)
app.include_router(knowledge.router)
app.include_router(dashboard.router)