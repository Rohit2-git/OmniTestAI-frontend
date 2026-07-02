import json
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from typing import Optional, Dict, List, Tuple
from app.database import db
from app.services.synthetic_data import extract_fields_from_condition, pick_synthetic_record, generate_bulk_records

router = APIRouter(prefix="/test-data", tags=["test-data"])


# ── Request models ─────────────────────────────────────────────────────────

class CreateTemplateRequest(BaseModel):
    appId: str
    name: str
    scenario: str       # e.g. "checkout", "login", "address form", "payment"
    fields: Dict[str, str]


class CreateConditionRequest(BaseModel):
    appId: str
    description: str


class CreateSyntheticBatchRequest(BaseModel):
    appId: str
    templateId: str
    count: int
    name: Optional[str] = None


# ── Serializers ────────────────────────────────────────────────────────────

def _serialize_template(t) -> dict:
    return {
        "id": t.id,
        "appId": t.appId,
        "name": t.name,
        "scenario": t.scenario,
        "fields": json.loads(t.fields),
        "type": "template",
    }


def _serialize_condition(c) -> dict:
    return {
        "id": c.id,
        "appId": c.appId,
        "description": c.description,
        "resolvedFields": json.loads(c.resolvedFields),
        "isDefault": c.isDefault,
        "createdAt": c.createdAt.isoformat(),
        "type": "condition",
    }


def _serialize_batch(b) -> dict:
    return {
        "id": b.id,
        "appId": b.appId,
        "sourceTemplateId": b.sourceTemplateId,
        "sourceTemplateName": b.sourceTemplateName,
        "name": b.name,
        "recordCount": b.recordCount,
        "records": json.loads(b.records),
        "createdAt": b.createdAt.isoformat(),
        "type": "batch",
    }


# ── Templates (real, scenario-tagged user data) ────────────────────────────

@router.post("/templates")
async def create_template(payload: CreateTemplateRequest):
    template = await db.testdatatemplate.create(data={
        "appId": payload.appId,
        "name": payload.name,
        "scenario": payload.scenario.strip().lower(),
        "fields": json.dumps(payload.fields),
    })
    return _serialize_template(template)


@router.get("/templates")
async def list_templates(app_id: str):
    templates = await db.testdatatemplate.find_many(
        where={"appId": app_id},
        order={"createdAt": "desc"}
    )
    return [_serialize_template(t) for t in templates]


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    await db.testdatatemplate.delete(where={"id": template_id})
    return {"status": "deleted"}


# ── Template matching — called by generate.py per blueprint ───────────────

async def find_best_template(app_id: str, title: str, objective: str) -> Optional[dict]:
    """
    Load all templates for the app and use a simple keyword-matching heuristic
    to pick the best one for this blueprint's title + objective.

    Matching strategy (no extra LLM call needed — fast and deterministic):
      1. Tokenise title + objective into lowercase words.
      2. Score each template: count how many of its name/scenario words appear
         in those tokens.
      3. Return the template with the highest score if score > 0, else None
         (meaning Gemini will invent data as before for that test case).

    This keeps template matching free and instant. If you later want Gemini to
    do semantic matching, replace this function body with an LLM call.
    """
    if not app_id:
        return None

    templates = await db.testdatatemplate.find_many(where={"appId": app_id})
    if not templates:
        return None

    combined_text = f"{title} {objective}".lower()
    # Split on non-alphanumeric characters to get clean tokens
    import re
    tokens = set(re.split(r'[^a-z0-9]+', combined_text))
    tokens.discard('')

    best_template = None
    best_score = 0

    for t in templates:
        # Build candidate words from the template's name and scenario
        candidate_text = f"{t.name} {t.scenario}".lower()
        candidate_words = set(re.split(r'[^a-z0-9]+', candidate_text))
        candidate_words.discard('')

        # Score = number of shared words
        score = len(tokens & candidate_words)
        if score > best_score:
            best_score = score
            best_template = t

    if best_score == 0:
        return None

    return {
        "id": best_template.id,
        "fields": json.loads(best_template.fields),
        "name": best_template.name,
        "scenario": best_template.scenario,
    }


async def resolve_template_values(template_id: str) -> dict:
    """Return the field dict for a template by ID."""
    template = await db.testdatatemplate.find_unique(where={"id": template_id})
    if not template:
        return {}
    return json.loads(template.fields)


# ── Conditions (synthetic data drawn from the bank) ────────────────────────

@router.post("/conditions")
async def create_condition(payload: CreateConditionRequest):
    resolved_fields = await extract_fields_from_condition(payload.description)
    condition = await db.testdatacondition.create(data={
        "appId": payload.appId,
        "description": payload.description,
        "resolvedFields": json.dumps(resolved_fields)
    })
    return _serialize_condition(condition)


@router.get("/conditions")
async def list_conditions(app_id: str):
    conditions = await db.testdatacondition.find_many(
        where={"appId": app_id},
        order={"createdAt": "desc"}
    )
    return [_serialize_condition(c) for c in conditions]


@router.patch("/conditions/{condition_id}/default")
async def set_default_condition(condition_id: str):
    condition = await db.testdatacondition.find_unique(where={"id": condition_id})
    if not condition:
        raise HTTPException(status_code=404, detail="Condition not found.")
    await db.testdatacondition.update_many(where={"appId": condition.appId}, data={"isDefault": False})
    updated = await db.testdatacondition.update(where={"id": condition_id}, data={"isDefault": True})
    return _serialize_condition(updated)


@router.delete("/conditions/{condition_id}")
async def delete_condition(condition_id: str):
    await db.testdatacondition.delete(where={"id": condition_id})
    return {"status": "deleted"}


# ── Synthetic Batches (bulk AI-generated records from a Data Template) ────
#
# Lives visually inside the Synthetic Conditions tab (per product decision),
# but is backed by its own table since its shape (N full records) is
# different from a Condition (a set of field keys resolved fresh per draw).

@router.post("/batches")
async def create_synthetic_batch(payload: CreateSyntheticBatchRequest):
    if payload.count < 1:
        raise HTTPException(status_code=400, detail="count must be at least 1.")

    template = await db.testdatatemplate.find_unique(where={"id": payload.templateId})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    sample_fields = json.loads(template.fields)
    try:
        records = await generate_bulk_records(
            template_name=template.name,
            scenario=template.scenario,
            sample_fields=sample_fields,
            count=payload.count,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk generation failed: {str(e)}")

    if not records:
        raise HTTPException(status_code=500, detail="Gemini returned no usable records — try again.")

    display_name = (payload.name or "").strip() or f"{template.name} — {len(records)} records"

    batch = await db.syntheticbatch.create(data={
        "appId": payload.appId,
        "sourceTemplateId": template.id,
        "sourceTemplateName": template.name,
        "name": display_name,
        "recordCount": len(records),
        "records": json.dumps(records),
    })
    return _serialize_batch(batch)


@router.get("/batches")
async def list_synthetic_batches(app_id: str):
    batches = await db.syntheticbatch.find_many(
        where={"appId": app_id},
        order={"createdAt": "desc"}
    )
    return [_serialize_batch(b) for b in batches]


@router.delete("/batches/{batch_id}")
async def delete_synthetic_batch(batch_id: str):
    await db.syntheticbatch.delete(where={"id": batch_id})
    return {"status": "deleted"}


async def get_batch_records(batch_id: str) -> List[dict]:
    """Returns the full list of records for a batch by ID. Used by generate.py
    to round-robin-assign one record per test case during Pass 2 expansion."""
    batch = await db.syntheticbatch.find_unique(where={"id": batch_id})
    if not batch:
        return []
    return json.loads(batch.records)


# ── Preview ────────────────────────────────────────────────────────────────

@router.get("/preview")
async def preview_resolution(app_id: str, mode: str, source_id: str):
    if mode == "template":
        values = await resolve_template_values(source_id)
    elif mode == "condition":
        fields = await get_condition_fields(source_id)
        values = pick_synthetic_record(fields)
    elif mode == "batch":
        records = await get_batch_records(source_id)
        values = records[0] if records else {}
    else:
        raise HTTPException(status_code=400, detail="mode must be 'template', 'condition', or 'batch'.")
    return {"values": values}


# ── Shared helpers used by generate.py ────────────────────────────────────

async def get_condition_fields(condition_id: str) -> List[str]:
    condition = await db.testdatacondition.find_unique(where={"id": condition_id})
    if not condition:
        return []
    return json.loads(condition.resolvedFields)


async def find_default_condition(app_id: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Returns ("condition", id) if an app has a default synthetic condition set,
    otherwise (None, None). Templates no longer have a global default — they are
    matched per test case in find_best_template().
    """
    if not app_id:
        return (None, None)
    condition = await db.testdatacondition.find_first(
        where={"appId": app_id, "isDefault": True}
    )
    if condition:
        return ("condition", condition.id)
    return (None, None)