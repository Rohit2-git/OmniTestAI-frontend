from app.executors.base import BaseExecutor
from app.schemas.test import TestRunRequest

class APIExecutor(BaseExecutor):
    """Runs API tests using httpx."""

    async def execute(self, plan: list, request: TestRunRequest) -> str:
        # TODO: async with httpx.AsyncClient() as client: ...
        return f"[APIExecutor] Tested {request.target_url}"