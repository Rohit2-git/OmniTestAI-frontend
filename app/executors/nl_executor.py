"""
NL Executor — Natural Language Test Executor using Stagehand Python SDK (v3).
Each step is plain English — Stagehand + Gemini figures out what to do.
Stops immediately on first failure (fail-fast).

Correct local pattern:
    client = AsyncStagehand(server="local", model_api_key=..., local_chrome_path=...)
    session = await client.sessions.start(model_name=..., browser={"type": "local", "launchOptions": {}})
    await session.navigate(url=...)
    await session.act(input=step)
"""
import os
from typing import List, Dict, Any

try:
    from stagehand import AsyncStagehand   # type: ignore
    STAGEHAND_AVAILABLE = True
except ImportError:
    STAGEHAND_AVAILABLE = False


class StagehandNLExecutor:

    def __init__(self):
        self.model_api_key = os.getenv("GEMINI_API_KEY")
        self.chrome_path = os.getenv("CHROME_PATH", r"C:\Program Files\Google\Chrome\Application\chrome.exe")

    async def execute_raw_steps(
        self,
        url: str,
        steps: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Executes plain English steps against a live URL using Stagehand.
        No saved test case needed — just a URL and a list of steps.
        Stops at first failure (fail-fast).
        """
        if not STAGEHAND_AVAILABLE:
            return [{
                "step": "Stagehand initialization",
                "status": "FAILED",
                "detail": "stagehand package not installed. Run: pip install stagehand"
            }]

        execution_log = []

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

                await session.navigate(url=url)

                for step in steps:
                    try:
                        await session.act(input=step)
                        execution_log.append({
                            "step": step,
                            "status": "PASSED",
                            "detail": "Executed successfully."
                        })
                    except Exception as e:
                        execution_log.append({
                            "step": step,
                            "status": "FAILED",
                            "detail": str(e)
                        })
                        break  # Stop on first failure

        except Exception as system_err:
            execution_log.append({
                "step": "Browser initialization",
                "status": "FAILED",
                "detail": str(system_err)
            })

        return execution_log

    async def execute_test_case(
        self,
        test_case: dict,
        base_url: str,
        continue_on_fail: bool = False
    ) -> dict:
        """
        Executes a full structured test case using Stagehand.
        Compatible with the WebExecutor interface used in execute.py.
        """
        title = test_case.get("title", "Untitled")
        steps = test_case.get("steps", [])
        expected_result = test_case.get("expected_result", "")

        step_results = await self.execute_raw_steps(url=base_url, steps=steps)
        passed = all(r["status"] == "PASSED" for r in step_results)

        return {
            "title": title,
            "passed": passed,
            "type": test_case.get("type"),
            "expected_result": expected_result,
            "step_results": [
                {
                    "step": r["step"],
                    "status": r["status"].lower(),
                    "detail": r["detail"]
                }
                for r in step_results
            ]
        }