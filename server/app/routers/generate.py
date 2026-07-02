import json
import re
import asyncio
from datetime import timedelta
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request, Depends # type: ignore
from typing import Optional, List, Any
from app.schemas.generate import GenerateTestResponse
from app.services.file_service import extract_text_from_file
from google.genai import types # type: ignore
from app.services.llm_service import (
    discover_test_blueprints,
    expand_single_test_case,
    generate_test_cases_from_images,
    generate_test_cases_from_both_multi,
)
from app.routers.test_data import find_best_template, find_default_condition, get_condition_fields, resolve_template_values, get_batch_records
from app.services.synthetic_data import pick_synthetic_record
from app.auth.middleware import get_current_user
from app.database import db

router = APIRouter(prefix="/tests", tags=["generate"])

SUPPORTED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp"
}

# Maps role to visibility value stored on TestRun.
# "all"             → admin-generated: visible to everyone with app access
# "qa_and_reviewer" → qa_engineer-generated: visible to owner + any qa_reviewer
# "owner_only"      → developer-generated: visible only to the creator
_ROLE_VISIBILITY = {
    "admin":       "all",
    "qa_engineer": "qa_and_reviewer",
    "developer":   "owner_only",
}


class _GenerationAborted(Exception):
    pass


def _is_image(file: UploadFile) -> bool:
    if file.content_type in SUPPORTED_IMAGE_TYPES:
        return True
    return any(file.filename.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"])


@router.post("/generate", response_model=GenerateTestResponse)
async def generate_tests_from_document(
    request: Request,
    file: Optional[UploadFile] = File(None),
    wireframes: Optional[List[UploadFile]] = File(None),
    context_file: Optional[UploadFile] = File(None),
    app_id: Optional[str] = Form(None),
    count: Optional[int] = Form(10),
    test_data_mode: Optional[str] = Form(None),
    test_data_id: Optional[str] = Form(None),
    current_user=Depends(get_current_user)
):
    has_doc = file and file.filename
    wireframes = [w for w in (wireframes or []) if w and w.filename]
    has_wireframe = bool(wireframes)

    if not has_doc and not has_wireframe:
        raise HTTPException(status_code=400, detail="At least one input resource is required.")

    knowledge_context = ""
    if app_id:
        try:
            assets = await db.knowledgeasset.find_many(where={"appId": str(app_id)})
            if assets:
                knowledge_context = "\n\n[CRITICAL GROUNDING CONSTRAINTS - ADHERE TO THE FOLLOWING RULES]"
                for asset in assets:
                    knowledge_context += f"\n- {asset.name} (Context Rule): {asset.summary}"
                    if asset.url:
                        knowledge_context += f" (Reference Resource Link: {asset.url})"
                knowledge_context += "\n[END OF GROUNDING CONSTRAINTS]\n"
        except Exception as e:
            print(f"Warning: Knowledge Base indexing skipped: {str(e)}")

    content = None
    if has_doc:
        extracted_text = await extract_text_from_file(file)
        if len(extracted_text.strip()) < 20:
            raise HTTPException(status_code=400, detail="Requirements document is empty.")
        content = f"{extracted_text}{knowledge_context}"

    image_list = []  # list of (bytes, media_type) tuples — one per uploaded screenshot
    if has_wireframe:
        for wf in wireframes:
            if not _is_image(wf):
                raise HTTPException(status_code=400, detail=f"Invalid wireframe file: {wf.filename}")
            wf_bytes = await wf.read()
            wf_media_type = wf.content_type or "image/png"
            image_list.append((wf_bytes, wf_media_type))

    context = None
    if context_file and context_file.filename:
        try:
            context = await extract_text_from_file(context_file)
            if len(context.strip()) < 10:
                context = None
        except:
            context = None

    if has_wireframe and not has_doc and knowledge_context:
        context = f"{context}\n{knowledge_context}" if context else knowledge_context


    app_base_url = None
    if app_id:
        try:
            app_record = await db.application.find_unique(where={"id": str(app_id)})
            if app_record and app_record.url:
                app_base_url = app_record.url.rstrip("/")
        except Exception as e:
            print(f"[generate] Could not fetch app URL: {e}")

    source = "document"
    if has_doc and has_wireframe:
        source = "document + wireframe"
    elif has_wireframe:
        source = "wireframe"

    filename = "Untitled Upload"
    if has_doc and file is not None:
        filename = file.filename
    elif has_wireframe and wireframes:
        filename = wireframes[0].filename

    try:
        count = max(1, min(count or 10, 20))
        import time as _time
        batch_label = f"{filename} · {_time.strftime('%H:%M:%S')}"

        active_mode, active_source_id = test_data_mode, test_data_id
        if not active_mode and app_id:
            active_mode, active_source_id = await find_default_condition(str(app_id))

        # Explicit data-source selection (from the Generator's data-source picker)
        # overrides the automatic per-test-case template matching below.
        condition_fields = None
        forced_template_values = None
        forced_template_id = None
        batch_records: list = []

        if active_mode == "condition" and active_source_id:
            condition_fields = await get_condition_fields(active_source_id)
        elif active_mode == "template" and active_source_id:
            # User explicitly picked one Data Template for the whole run — every
            # test case gets these exact values, same as condition mode does.
            forced_template_values = await resolve_template_values(active_source_id)
            forced_template_id = active_source_id
        elif active_mode == "batch" and active_source_id:
            # User picked a bulk-generated batch — assign one distinct record
            # per test case (round-robin) instead of repeating a single record,
            # so the run actually gets data variety.
            batch_records = await get_batch_records(active_source_id)

        explicit_source_chosen = bool(condition_fields or forced_template_values or batch_records)
        use_template_matching = (not explicit_source_chosen) and bool(app_id)

        # Build image_parts list for Gemini — all screenshots passed together so the
        # model sees every page at once before allocating blueprint slots.
        image_parts = [
            types.Part.from_bytes(data=b, mime_type=mt)
            for b, mt in image_list
        ] if image_list else None

        blueprints = await discover_test_blueprints(
            content=content,
            image_parts=image_parts,
            context=context,
            count=count,
            app_id=str(app_id) if app_id else None,
            batch_label=batch_label
        )

        if not blueprints or not isinstance(blueprints, list):
            raise ValueError("Pass 1 discovery failed.")

        blueprints = blueprints[:count]

        if await request.is_disconnected():
            raise _GenerationAborted()

        semaphore = asyncio.Semaphore(4)

        async def worker_wrapper(bp_node: dict, bp_index: int) -> dict:
            async with semaphore:
                await asyncio.sleep(0.15)

                this_case_test_data = None
                matched_template_id = None
                matched_source_type = None

                if condition_fields:
                    this_case_test_data = pick_synthetic_record(condition_fields)
                    matched_source_type = "condition"
                    matched_template_id = active_source_id
                elif forced_template_values:
                    # Explicit single-template selection — every test case in this
                    # run shares the same real record, same as before this feature.
                    this_case_test_data = forced_template_values
                    matched_source_type = "template"
                    matched_template_id = forced_template_id
                elif batch_records:
                    # Round-robin: test case i gets records[i % N], so N records
                    # spread realistically across however many test cases are
                    # generated, wrapping around if there are more cases than records.
                    this_case_test_data = batch_records[bp_index % len(batch_records)]
                    matched_source_type = "batch"
                    matched_template_id = active_source_id
                elif use_template_matching:
                    match = await find_best_template(
                        app_id=str(app_id),
                        title=bp_node.get("title", ""),
                        objective=bp_node.get("objective", ""),
                    )
                    if match:
                        this_case_test_data = match["fields"]
                        matched_template_id = match["id"]
                        matched_source_type = "template"

                tc_result = await expand_single_test_case(
                    bp_node,
                    context=context,
                    app_id=str(app_id) if app_id else None,
                    batch_label=batch_label,
                    base_url=app_base_url,
                    test_data=this_case_test_data
                )

                tc_result["test_data_source_type"] = matched_source_type if this_case_test_data else None
                tc_result["test_data_source_id"] = matched_template_id if this_case_test_data else None
                tc_result["test_data_values"] = this_case_test_data
                return tc_result

        test_cases = await asyncio.gather(*[worker_wrapper(bp, i) for i, bp in enumerate(blueprints)])

    except _GenerationAborted:
        raise HTTPException(status_code=499, detail="Generation cancelled by client.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation error: {str(e)}")

    return GenerateTestResponse(
        run_id=None,
        filename=filename,
        total=len(test_cases),
        context_used=(context is not None or knowledge_context != ""),
        source=source,
        test_cases=test_cases
    )


@router.post("/save")
async def save_test_cases_to_repo(
    request: Request,
    current_user=Depends(get_current_user)
):
    """
    Persists a reviewed batch to the DB.
    Stamps createdByUserId, createdByRole, visibility based on who is saving.

    Visibility matrix:
      admin       → "all"              visible to every role with app access
      qa_engineer → "qa_and_reviewer"  visible to this qa_engineer + all qa_reviewers
      developer   → "owner_only"       visible only to this developer
    """
    payload = await request.json()
    filename = payload.get("filename", "Untitled")
    batch_name = (payload.get("batch_name") or "").strip() or None
    app_id = payload.get("app_id")
    test_cases = payload.get("test_cases", [])

    if not test_cases:
        raise HTTPException(status_code=400, detail="No test cases provided.")

    visibility = _ROLE_VISIBILITY.get(current_user.role, "owner_only")
    display_label = batch_name or filename

    try:
        async with db.tx(timeout=timedelta(seconds=15)) as transaction:
            run = await transaction.testrun.create(data={
                "filename": filename,
                "batchName": batch_name,
                "total": len(test_cases),
                "status": "completed",
                "appId": str(app_id) if app_id else None,
                "createdByUserId": current_user.id,
                "createdByRole": current_user.role,
                "visibility": visibility,
            })
            for tc in test_cases:
                await transaction.testresult.create(data={
                    "runId": run.id,
                    "title": tc.get("title", "Untitled Test Case"),
                    "steps": json.dumps(tc.get("steps", [])) if isinstance(tc.get("steps"), list) else tc.get("steps", "[]"),
                    "expectedResult": tc.get("expected_result", "Passed"),
                    "type": tc.get("type", "functional"),
                    "testDataSourceType": tc.get("test_data_source_type"),
                    "testDataSourceId": tc.get("test_data_source_id"),
                    "testDataValues": json.dumps(tc["test_data_values"]) if tc.get("test_data_values") else None
                })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save: {str(e)}")

    return {"run_id": run.id, "saved": len(test_cases), "batch_name": display_label}