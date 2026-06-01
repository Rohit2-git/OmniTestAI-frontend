"""
Web executor using Stagehand Python SDK (v3).
Plain English steps → Stagehand + Gemini → browser actions.
No hardcoded selectors, works on any website.

Correct local pattern:
    client = AsyncStagehand(server="local", model_api_key=..., local_chrome_path=...)
    session = await client.sessions.start(model_name=..., browser={"type": "local", "launchOptions": {}})
    await session.navigate(url=...)
    await session.act(input=step)
"""
import os
from app.executors.base import BaseExecutor
from app.schemas.test import TestRunRequest

try:
    from stagehand import AsyncStagehand   # type: ignore
    STAGEHAND_AVAILABLE = True
except ImportError:
    STAGEHAND_AVAILABLE = False


class WebExecutor(BaseExecutor):

    def __init__(self):
        self.model_api_key = os.getenv("GEMINI_API_KEY")
        self.chrome_path = os.getenv("CHROME_PATH", r"C:\Program Files\Google\Chrome\Application\chrome.exe")

    async def execute(self, plan: list, request: TestRunRequest) -> str:
        return "[WebExecutor] Use execute_test_case() for real execution."

    async def execute_test_case(
        self,
        test_case: dict,
        base_url: str,
        continue_on_fail: bool = False
    ) -> dict:
        title = test_case.get("title", "Untitled")
        steps = test_case.get("steps", [])
        expected_result = test_case.get("expected_result", "")
        step_results = []
        overall_passed = True

        if not STAGEHAND_AVAILABLE:
            return {
                "title": title,
                "passed": False,
                "type": test_case.get("type"),
                "expected_result": expected_result,
                "agent_output": "stagehand not installed. Run: pip install stagehand",
                "step_results": [{"step": s, "status": "failed", "detail": "stagehand not installed"} for s in steps]
            }

        try:
            async with AsyncStagehand(
                server="local",
                model_api_key=self.model_api_key,
                local_chrome_path=self.chrome_path
            ) as client:
                session = await client.sessions.start(
                    model_name="google/gemini-3-flash-preview",
                    browser={"type": "local", "launchOptions": {}}
                )

                await session.navigate(url=base_url)

                for step in steps:
                    try:
                        await session.act(input=step)
                        step_results.append({
                            "step": step,
                            "status": "passed",
                            "detail": "Executed successfully."
                        })
                    except Exception as step_error:
                        overall_passed = False
                        step_results.append({
                            "step": step,
                            "status": "failed",
                            "detail": str(step_error)
                        })
                        if not continue_on_fail:
                            break

                if overall_passed and expected_result:
                    try:
                        await session.act(input=f"Verify that: {expected_result}")
                        step_results.append({
                            "step": f"Verify: {expected_result}",
                            "status": "passed",
                            "detail": "Verification passed."
                        })
                    except Exception as verify_error:
                        overall_passed = False
                        step_results.append({
                            "step": f"Verify: {expected_result}",
                            "status": "failed",
                            "detail": str(verify_error)
                        })

        except Exception as system_error:
            overall_passed = False
            step_results = [{
                "step": s,
                "status": "failed",
                "detail": str(system_error)
            } for s in steps]

        return {
            "title": title,
            "passed": overall_passed,
            "type": test_case.get("type"),
            "expected_result": expected_result,
            "agent_output": "Completed" if overall_passed else "Failed",
            "step_results": step_results
        }