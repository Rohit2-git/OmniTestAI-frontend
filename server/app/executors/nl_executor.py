"""
NL Executor — Natural Language Executor.
Headful browser (user watches live) + headless for screenshots + video recording.
"""
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

        # Run headful first — user watches live
        headful_result = await run_test_case(
            test_case=test_case,
            base_url=url,
            headful=True,
            capture_screenshots=False,
            # pyrefly: ignore [unexpected-keyword]
            record_video=False
        )

        # Run headless — capture screenshots + video
        headless_result = await run_test_case(
            test_case=test_case,
            base_url=url,
            headful=False,
            capture_screenshots=True,
            # pyrefly: ignore [unexpected-keyword]
            record_video=True
        )

        return {
            **headful_result,
            "screenshots": headless_result.get("screenshots", []),
            "video_base64": headless_result.get("video_base64")
        }