from app.executors.base import BaseExecutor
from app.schemas.test import TestRunRequest

class PerformanceExecutor(BaseExecutor):
    """Runs performance tests using k6."""

    async def execute(self, plan: list, request: TestRunRequest) -> str:
        # TODO: subprocess.run(["k6", "run", "script.js"])
        return f"[PerformanceExecutor] Load test complete for {request.target_url}"