"""
The core LLM reasoning agent.
Implements the Observe -> Plan -> Act loop from StagehandAI.
"""
from app.schemas.test import TestRunRequest, TestRunResponse
from app.executors.web import WebExecutor
from app.executors.api import APIExecutor
from app.executors.performance import PerformanceExecutor

EXECUTOR_MAP = {
    "web": WebExecutor,
    "api": APIExecutor,
    "performance": PerformanceExecutor,
}

class ReasoningAgent:

    async def run(self, request: TestRunRequest) -> TestRunResponse:
        context = await self.observe(request)
        plan = await self.plan(context, request.instructions)
        executor_class = EXECUTOR_MAP.get(request.domain)
        if not executor_class:
            return TestRunResponse(
                run_id=0, domain=request.domain,
                status="error", message=f"No executor for domain: {request.domain}"
            )
        executor = executor_class()
        result = await executor.execute(plan, request)
        return TestRunResponse(run_id=1, domain=request.domain, status="completed", message=result)

    async def observe(self, request: TestRunRequest) -> dict:
        return {"url": request.target_url, "domain": request.domain}

    async def plan(self, context: dict, instructions: str) -> list:
        # TODO: call LLM here to generate steps from natural language
        return [{"step": 1, "action": "navigate", "target": context["url"]}]