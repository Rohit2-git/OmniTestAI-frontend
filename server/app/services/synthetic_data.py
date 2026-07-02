"""
Synthetic test data service — the "Test Data Condition" half of the Test
Data feature.

When a user doesn't want to hand over real data, they instead describe what
a test case needs in plain English (e.g. "testcases with name, email and
age"). This module turns that description into a fixed set of known field
keys, then draws a realistic fake record for those keys from a static bank.

Deliberately NOT using Gemini to invent the actual data values: that would
add latency/cost to every single draw and risks implausible values (a
200-year-old "age", a malformed email). The bank is built once, the only
LLM call here is the one-time mapping from free text -> known field keys.
"""
import os
import json
import random
import asyncio as _asyncio
from typing import List, Dict
from google import genai        # type: ignore
from google.genai import types  # type: ignore
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# The only field keys the bank (and therefore the extractor) knows how to
# serve. Keep this list and every record in synthetic_bank.json in lockstep —
# if you add a field here without adding it to the bank, requests for it will
# just come back empty for that field.
KNOWN_FIELDS = [
    "name", "first_name", "last_name", "email", "age", "dob",
    "phone", "address", "city", "state", "zip_code", "country",
    "username", "password", "company", "job_title", "credit_card"
]

_BANK_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "synthetic_bank.json")
_BANK_CACHE = None


def _get_bank() -> list:
    global _BANK_CACHE
    if _BANK_CACHE is None:
        try:
            with open(os.path.abspath(_BANK_PATH), "r") as f:
                _BANK_CACHE = json.load(f)
        except Exception as e:
            print(f"[Synthetic bank load error] {e}")
            _BANK_CACHE = []
    return _BANK_CACHE


class FieldExtractionSchema(BaseModel):
    fields: List[str] = Field(description="Subset of the known field taxonomy the request is asking for")


class BulkRecordSchema(BaseModel):
    records: List[Dict[str, str]] = Field(
        description="List of generated records. Every record must have exactly the same keys as the template's field schema."
    )


async def extract_fields_from_condition(description: str) -> List[str]:
    """
    Turns free text like "testcases with name, email and age" into
    ["name", "email", "age"].

    Uses a small, strict-JSON Gemini call rather than keyword matching,
    since real phrasing varies more than a fixed keyword list reliably
    catches (e.g. "date of birth" vs "dob", "mobile number" vs "phone").
    Called once when a condition is created/saved — NOT on every generation
    that uses it, so this latency/cost is paid exactly once per condition.
    """
    prompt = f"""You are mapping a QA tester's request onto a fixed taxonomy of test-data field keys.

Known field keys (use ONLY these — never invent new ones): {json.dumps(KNOWN_FIELDS)}

Tester's request: "{description}"

Return ONLY the subset of known field keys the request is asking for, as JSON:
{{"fields": ["..."]}}
If nothing in the request matches the known taxonomy, return {{"fields": []}}."""

    config = types.GenerateContentConfig(
        temperature=0,
        response_mime_type="application/json",
        response_schema=FieldExtractionSchema,
        max_output_tokens=200
    )
    try:
        response = await _asyncio.to_thread(
            client.models.generate_content,
            model="gemini-3-flash-preview",
            contents=prompt,
            config=config
        )
        parsed = json.loads(response.text)
        fields = parsed.get("fields", [])
        # Defensive filter: only ever return keys the bank actually serves,
        # no matter what the model hands back.
        return [f for f in fields if f in KNOWN_FIELDS]
    except Exception as e:
        print(f"[Field extraction error] {e}")
        return []


# Hard cap on records-per-batch — protects against runaway token usage /
# accidental fat-finger input (e.g. "10000"). Raise if a real use case needs more.
MAX_BULK_RECORDS = 200


async def generate_bulk_records(template_name: str, scenario: str, sample_fields: Dict[str, str], count: int) -> List[dict]:
    """
    Generates `count` distinct, realistic records that all share the exact
    field schema of an existing Data Template.

    Unlike pick_synthetic_record() (which draws from the static bank and is
    limited to KNOWN_FIELDS), a Data Template can have ANY field keys the
    user typed in — so this uses one Gemini call per batch to invent
    plausible values for that arbitrary schema. This IS an LLM call per
    generation (not per test case), so cost scales with number of batches
    created, not number of test cases that later use them.
    """
    count = max(1, min(count, MAX_BULK_RECORDS))
    field_keys = list(sample_fields.keys())
    if not field_keys:
        return []

    prompt = f"""You are generating realistic sample test data for QA testing.

Template name: "{template_name}"
Scenario: "{scenario}"
Field schema (every record MUST have exactly these keys, nothing more/less): {json.dumps(field_keys)}

Example of the style/format expected (do NOT repeat this record verbatim — generate NEW distinct values):
{json.dumps(sample_fields)}

Generate exactly {count} records. Each record must:
- Have exactly these keys: {json.dumps(field_keys)}
- Contain realistic, plausible values appropriate to the scenario and each field's name
- Be genuinely DISTINCT from every other record — different names/emails/usernames etc.,
  not the same value with a number appended (e.g. NOT "user1", "user2", "user3")

Return ONLY JSON: {{"records": [{{...}}, ...]}} with exactly {count} records."""

    config = types.GenerateContentConfig(
        temperature=0.9,
        response_mime_type="application/json",
        response_schema=BulkRecordSchema,
        max_output_tokens=min(8000, 200 + count * len(field_keys) * 20)
    )
    try:
        response = await _asyncio.to_thread(
            client.models.generate_content,
            model="gemini-3-flash-preview",
            contents=prompt,
            config=config
        )
        parsed = json.loads(response.text)
        records = parsed.get("records", [])
        # Defensive: keep only records that carry exactly the requested keys,
        # and never return more than what was asked for.
        clean = []
        for r in records:
            if isinstance(r, dict) and set(r.keys()) == set(field_keys):
                clean.append(r)
        return clean[:count]
    except Exception as e:
        print(f"[Bulk record generation error] {e}")
        raise


def pick_synthetic_record(fields: List[str]) -> dict:
    """
    Returns a dict containing only the requested fields, with realistic fake
    values that plausibly belong to the same person.

    Picks one bank record as the base (so name/email/age etc. stay
    consistent with each other), then backfills any field missing from that
    record from a different random record that does have it.
    """
    bank = _get_bank()
    if not bank or not fields:
        return {}

    base_record = random.choice(bank)
    result = {}
    for f in fields:
        if base_record.get(f):
            result[f] = base_record[f]
        else:
            candidates = [r for r in bank if r.get(f)]
            if candidates:
                result[f] = random.choice(candidates)[f]
    return result