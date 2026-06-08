from fastapi import APIRouter   # type: ignore
from app.schemas.test import TestRunRequest, TestRunResponse
from app.agents.reasoning_agent import ReasoningAgent

router = APIRouter(prefix="/tests", tags=["tests"])

@router.post("/run", response_model=TestRunResponse)
async def run_test(payload: TestRunRequest):
    """
    Trigger a test run for any domain.
    The agent will observe, plan, and execute automatically.
    """
    agent = ReasoningAgent()
    result = await agent.run(payload)
    return result

@router.get("/")
async def list_tests():
    """List all test runs."""
    return {"runs": []}