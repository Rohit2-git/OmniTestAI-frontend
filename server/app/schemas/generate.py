# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from typing import List, Optional


class TestCase(BaseModel):
    title: str
    steps: List[str]
    expected_result: str
    type: str  # positive, negative, edge_case


class GenerateTestResponse(BaseModel):
    run_id: Optional[int] = None
    filename: str
    total: int
    source: str           # "document", "wireframe", or "document + wireframe"
    context_used: bool = False
    test_cases: List[TestCase]