import json
import os
import re
import csv
import io
import time
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
    normalize_manual_test_case,
)
from app.routers.test_data import find_best_template, find_default_condition, get_condition_fields, resolve_template_values, get_batch_records
from app.services.synthetic_data import pick_synthetic_record
from app.auth.middleware import get_current_user
from app.rate_limiter import check_generation, RateLimitExceeded
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


# Same path llm_service.py's _append_token_log writes to — reading it back
# here (filtered by this run's unique batch_label) is how the Tech Logs modal
# gets REAL Gemini call data (model, tokens, whether the Pass 1 top-up fired)
# instead of the previous hardcoded "kernel telemetry" flavor text.
_TOKEN_LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "token_usage_log.json")


def _build_generation_trace(batch_label: str, pass1_time_sec: float, pass2_time_sec: float) -> dict:
    events = []
    try:
        path = os.path.abspath(_TOKEN_LOG_PATH)
        if os.path.exists(path):
            with open(path, "r") as f:
                all_entries = json.load(f)
            events = [e for e in all_entries if e.get("batch_label") == batch_label]
    except Exception as e:
        print(f"[generate] Could not read token usage log for trace: {e}")

    pass1_events = [e for e in events if e.get("type") == "generation_pass1"]
    topup_events = [e for e in events if e.get("type") == "generation_pass1_topup"]
    pass2_events = [e for e in events if e.get("type") == "generation_pass2"]

    def _sum(entries, key):
        return sum(e.get(key, 0) or 0 for e in entries)

    model_name = events[0]["model"] if events else "gemini-3-flash-preview"

    return {
        "model": model_name,
        "pass1_time_sec": round(pass1_time_sec, 1),
        "pass2_time_sec": round(pass2_time_sec, 1),
        "total_time_sec": round(pass1_time_sec + pass2_time_sec, 1),
        "topup_fired": bool(topup_events),
        "pass1_input_tokens": _sum(pass1_events, "input_tokens"),
        "pass1_output_tokens": _sum(pass1_events, "output_tokens"),
        "topup_input_tokens": _sum(topup_events, "input_tokens"),
        "topup_output_tokens": _sum(topup_events, "output_tokens"),
        "pass2_input_tokens": _sum(pass2_events, "input_tokens"),
        "pass2_output_tokens": _sum(pass2_events, "output_tokens"),
        "total_tokens": _sum(events, "total_tokens"),
        "pass2_call_count": len(pass2_events),
        # Raw events so the frontend can render one real log line per Gemini
        # call (type, model, tokens, timestamp) instead of fabricated copy.
        "events": events,
    }


_TITLE_COLS = {"title", "test case", "test case title", "name", "test name", "scenario", "test scenario"}
_ID_COLS = {"test case id", "id", "tc id", "case id", "test id", "tcid"}
_DESC_COLS = {"test case description", "description", "test description", "summary", "objective"}
_STEPS_COLS = {"steps", "test steps", "step", "action", "actions", "test case steps"}
_EXPECTED_COLS = {"expected result", "expected", "expected outcome", "expected results"}


def _normalize_header(h: str) -> str:
    return re.sub(r'\s+', ' ', (h or "").strip().lower())


def _parse_manual_csv(raw_text: str) -> List[dict]:
    """
    Groups CSV rows into test cases. Column names are matched flexibly
    (case-insensitive, several common synonyms) so this isn't locked to one
    exact export format. Supports two common shapes:

    1. One row per test case, identified by an ID and/or Description column
       (e.g. "Test Case ID" / "Test Case Description" - the standard
       TestRail/Excel export shape), with all steps in a single multi-line
       "Test Steps" cell.
    2. One row per step, with a blank title/id/desc marking "same test case
       as the row above" - the TestRail/Zephyr continuation-row pattern.

    IMPORTANT: a row only counts as a "continuation of the previous row" when
    the CSV actually HAS a title/id/desc column and that column is blank on
    this row. If the CSV has no such column at all, every row is its own
    test case - previously, CSVs whose only identifying columns were
    "Test Case ID"/"Test Case Description" (not recognized as a title) fell
    through to "blank title -> continuation", silently merging every row in
    the file into a single test case.
    """
    reader = csv.DictReader(io.StringIO(raw_text))
    if not reader.fieldnames:
        return []

    header_map = {}
    for h in reader.fieldnames:
        norm = _normalize_header(h)
        if norm in _TITLE_COLS:
            header_map['title'] = h
        elif norm in _STEPS_COLS:
            header_map['steps'] = h
        elif norm in _EXPECTED_COLS:
            header_map['expected'] = h
        if norm in _ID_COLS:
            header_map['id'] = h
        if norm in _DESC_COLS:
            header_map['desc'] = h

    if 'steps' not in header_map:
        raise ValueError("Could not find a Steps/Description column in the CSV.")

    has_title_col = 'title' in header_map
    has_id_or_desc = 'id' in header_map or 'desc' in header_map
    # Do we have ANY column that can identify "this row starts a new test
    # case"? If not, there's no such thing as a continuation row here.
    has_identifying_col = has_title_col or has_id_or_desc

    test_cases: List[dict] = []
    current = None
    for row in reader:
        raw_title = (row.get(header_map.get('title', ''), '') or '').strip()
        id_val = (row.get(header_map.get('id', ''), '') or '').strip()
        desc_val = (row.get(header_map.get('desc', ''), '') or '').strip()
        steps_val = (row.get(header_map['steps'], '') or '').strip()
        expected_val = (row.get(header_map.get('expected', ''), '') or '').strip()

        if not steps_val and not raw_title and not id_val and not desc_val:
            continue

        if has_title_col:
            title_val = raw_title
        elif has_id_or_desc:
            # Combine whichever of ID/Description are present into a readable title.
            title_val = " - ".join(v for v in (id_val, desc_val) if v)
        else:
            title_val = ""

        is_continuation_row = has_identifying_col and not title_val and current is not None

        if is_continuation_row:
            if steps_val:
                current["steps_text"] += ("\n" + steps_val)
            if expected_val and not current["expected_result"]:
                current["expected_result"] = expected_val
        else:
            current = {"title": title_val or "Untitled Test Case", "steps_text": steps_val, "expected_result": expected_val}
            test_cases.append(current)

    return test_cases


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
    # Rate limit: 5 generations per user per 10 minutes
    try:
        check_generation(current_user.id)
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=429,
            detail=str(e),
            headers={"Retry-After": str(e.retry_after)},
        )

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

        _pass1_start = time.time()
        blueprints = await discover_test_blueprints(
            content=content,
            image_parts=image_parts,
            context=context,
            count=count,
            app_id=str(app_id) if app_id else None,
            batch_label=batch_label
        )
        pass1_time_sec = time.time() - _pass1_start

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
                    test_data=this_case_test_data,
                    image_parts=image_parts
                )

                tc_result["test_data_source_type"] = matched_source_type if this_case_test_data else None
                tc_result["test_data_source_id"] = matched_template_id if this_case_test_data else None
                tc_result["test_data_values"] = this_case_test_data
                return tc_result

        _pass2_start = time.time()
        test_cases = await asyncio.gather(*[worker_wrapper(bp, i) for i, bp in enumerate(blueprints)])
        pass2_time_sec = time.time() - _pass2_start

    except _GenerationAborted:
        raise HTTPException(status_code=499, detail="Generation cancelled by client.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation error: {str(e)}")

    generation_trace = _build_generation_trace(batch_label, pass1_time_sec, pass2_time_sec)

    return GenerateTestResponse(
        run_id=None,
        filename=filename,
        total=len(test_cases),
        context_used=(context is not None or knowledge_context != ""),
        source=source,
        test_cases=test_cases,
        generation_trace=generation_trace
    )


@router.post("/import-csv", response_model=GenerateTestResponse)
async def import_manual_test_cases_csv(
    request: Request,
    file: UploadFile = File(...),
    app_id: Optional[str] = Form(None),
    current_user=Depends(get_current_user)
):
    """
    Imports manually-written test cases from a CSV export. Steps that already
    read as atomic/literal actions are kept verbatim at zero AI cost; only
    genuinely high-level/descriptive steps get an AI rewrite pass — see
    normalize_manual_test_case / _looks_already_executable in llm_service.py.
    Returns the same shape as /tests/generate.
    """
    try:
        check_generation(current_user.id)
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=429,
            detail=str(e),
            headers={"Retry-After": str(e.retry_after)},
        )

    if not file.filename or not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="Please upload a .csv file.")

    raw_bytes = await file.read()
    try:
        raw_text = raw_bytes.decode('utf-8-sig')
    except UnicodeDecodeError:
        raw_text = raw_bytes.decode('latin-1')

    try:
        parsed_rows = _parse_manual_csv(raw_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not parsed_rows:
        raise HTTPException(status_code=400, detail="No test cases found in the uploaded CSV.")

    app_base_url = None
    if app_id:
        try:
            app_record = await db.application.find_unique(where={"id": str(app_id)})
            if app_record and app_record.url:
                app_base_url = app_record.url.rstrip("/")
        except Exception as e:
            print(f"[import-csv] Could not fetch app URL: {e}")

    import time as _time
    batch_label = f"{file.filename} · {_time.strftime('%H:%M:%S')}"

    semaphore = asyncio.Semaphore(4)

    async def worker(row: dict) -> dict:
        async with semaphore:
            await asyncio.sleep(0.15)
            tc_result = await normalize_manual_test_case(
                title=row["title"],
                raw_steps_text=row["steps_text"],
                expected_result=row.get("expected_result") or None,
                app_id=str(app_id) if app_id else None,
                batch_label=batch_label,
                base_url=app_base_url,
            )
            tc_result["test_data_source_type"] = None
            tc_result["test_data_source_id"] = None
            tc_result["test_data_values"] = None
            return tc_result

    if await request.is_disconnected():
        raise HTTPException(status_code=499, detail="Import cancelled by client.")

    test_cases = await asyncio.gather(*[worker(row) for row in parsed_rows])

    return GenerateTestResponse(
        run_id=None,
        filename=file.filename,
        total=len(test_cases),
        context_used=False,
        source="csv-import",
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