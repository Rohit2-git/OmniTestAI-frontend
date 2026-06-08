from typing import List, Dict, Any
from app.executors.playwright import run_test_case


class NLExecutor:

    async def execute_raw_steps(self, url: str, steps: List[str]) -> Dict[str, Any]:
        test_case = {
            "title": "NL Execution",
            "steps": steps,
            "expected_result": "",
            "type": "nl"
        }

        # Run 1 — headful, user watches live
        headful_result = await run_test_case(
            test_case=test_case,
            base_url=url,
            headful=True,
            capture_screenshots=False
        )

        # Run 2 — headless, capture screenshots
        headless_result = await run_test_case(
            test_case=test_case,
            base_url=url,
            headful=False,
            capture_screenshots=True
        )

        # Combine — pass/fail from headful, screenshots from headless
        return {
            **headful_result,
            "screenshots": headless_result.get("screenshots", [])
        }

# Also update the /nl endpoint in execute.py — replace the existing @router.post("/nl") with this:
#
# @router.post("/nl")
# async def execute_nl_test(payload: ExecuteNLRequest):
#     executor = NLExecutor()
#     result = await executor.execute_raw_steps(url=payload.url, steps=payload.steps)
#     return {
#         "mode": "headful_nl_with_screenshots",
#         "url": payload.url,
#         "overall_status": "PASSED" if result["passed"] else "FAILED",
#         "passed": result["passed"],
#         "total_steps": len(payload.steps),
#         "executed_steps": result["executed_steps"],
#         "step_results": result["step_results"],
#         "screenshots": result.get("screenshots", [])
#     }