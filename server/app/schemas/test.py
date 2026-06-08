from pydantic import BaseModel
from typing import Optional
from enum import Enum

class TestDomain(str, Enum):
    web = "web"
    api = "api"
    performance = "performance"
    accessibility = "accessibility"
    mobile = "mobile"

class TestRunRequest(BaseModel):
    domain: TestDomain
    target_url: str
    instructions: str
    config: Optional[dict] = {}

class TestRunResponse(BaseModel):
    run_id: int
    domain: str
    status: str
    message: str