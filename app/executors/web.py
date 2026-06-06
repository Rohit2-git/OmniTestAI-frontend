"""
Web Executor — wraps playwright_executor.py.

Single test  → headful browser (user watches live) + screenshots
Suite run    → headless browser + screenshots for slideshow
"""
from app.executors.base import BaseExecutor
from app.schemas.test import TestRunRequest
from app.executors.playwright import run_test_case


class WebExecutor(BaseExecutor):

    async def execute(self, plan: list, request: TestRunRequest) -> str:
        return "[WebExecutor] Use execute_test_case() or execute_test_case_headless()."

    async def execute_test_case(
        self,
        test_case: dict,
        base_url: str,
        continue_on_fail: bool = False
    ) -> dict:
        """
        SINGLE TEST MODE — headful browser.
        Browser opens visibly. Screenshots captured after each step.
        """
        return await run_test_case(
            test_case=test_case,
            base_url=base_url,
            headful=True,
            capture_screenshots=True
        )

    async def execute_test_case_headless(
        self,
        test_case: dict,
        base_url: str,
    ) -> dict:
        """
        SUITE MODE — headless browser.
        Captures screenshot after every step for slideshow.
        """
        return await run_test_case(
            test_case=test_case,
            base_url=base_url,
            headful=False,
            capture_screenshots=True
        )