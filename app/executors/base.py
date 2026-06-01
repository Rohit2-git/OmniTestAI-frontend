from abc import ABC, abstractmethod
from app.schemas.test import TestRunRequest

class BaseExecutor(ABC):
    """All executors must implement execute(). New frameworks just subclass this."""

    @abstractmethod
    async def execute(self, plan: list, request: TestRunRequest) -> str:
        pass