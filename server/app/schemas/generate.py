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
    # Real per-batch Gemini call trace (model, tokens, pass timings, whether the
    # Pass 1 top-up retry fired) — powers the Execution Trace tab. Optional/None
    # for older code paths (e.g. CSV import) that don't build one.
    generation_trace: Optional[dict] = None