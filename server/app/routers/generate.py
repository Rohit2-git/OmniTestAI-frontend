import json
import re
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional, List, Any
from app.schemas.generate import GenerateTestResponse
from app.services.file_service import extract_text_from_file
from app.services.llm_service import (
    generate_test_cases_from_text,
    generate_test_cases_from_image,
    generate_test_cases_from_both
)
from app.database import db

router = APIRouter(prefix="/tests", tags=["generate"])

SUPPORTED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp"
}

SUPPORTED_DOC_EXTENSIONS = {".txt", ".md", ".pdf", ".docx"}


def _is_image(file: UploadFile) -> bool:
    """Check if uploaded file is an image by content type or extension."""
    if file.content_type in SUPPORTED_IMAGE_TYPES:
        return True
    filename = file.filename.lower()
    return any(filename.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp"])


def _clean_and_parse_json(raw_output: Any) -> List[dict]:
    """
    Bulletproof parsing layer that strips code fences, isolates the true JSON array,
    and repairs incomplete arrays or trailing character data from Gemini outputs.
    """
    if isinstance(raw_output, list):
        return raw_output
        
    if not isinstance(raw_output, str):
        raise ValueError("Expected string context structure representation from underlying model framework.")

    # Step 1: Strip markdown block flags entirely
    cleaned = re.sub(r'```json|```', '', raw_output).strip()
    
    # Step 2: Use greedy regex to extract everything from the first '[' to the last ']'
    array_match = re.search(r'\[.*\]', cleaned, re.DOTALL)
    
    if array_match:
        target_json_string = array_match.group(0)
    else:
        # Emergency Check: If no array brackets exist, find a single dictionary object wrapper
        object_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if object_match:
            try:
                single_obj = json.loads(object_match.group(0))
                return [single_obj]
            except Exception:
                pass
        raise ValueError("Could not locate structured JSON bracket boundaries inside AI response context.")

    # Step 3: Secondary Validation Layer for Incomplete Arrays
    if target_json_string.count('{') > target_json_string.count('}'):
        target_json_string += "}]"
    elif not target_json_string.endswith(']'):
        target_json_string += "]"

    # Double clean trailing commas inside array before hitting loads
    target_json_string = re.sub(r',\s*\]', ']', target_json_string)

    try:
        return json.loads(target_json_string)
    except json.JSONDecodeError:
        try:
            fixed_string = re.sub(r'[\r\n\t]', ' ', target_json_string)
            return json.loads(fixed_string)
        except Exception as nested_err:
            raise ValueError(f"JSON validation structure corrupted: {str(nested_err)}")


@router.post("/generate", response_model=GenerateTestResponse)
async def generate_tests_from_document(
    file: Optional[UploadFile] = File(None, description="Requirements document (.txt, .pdf, .docx, .md) with user stories and acceptance criteria"),
    wireframe: Optional[UploadFile] = File(None, description="Wireframe or UI screenshot (.png, .jpg, .webp) — Gemini visually analyzes the UI and generates test cases from it"),
    context_file: Optional[UploadFile] = File(None, description="(Optional) Context file (.txt, .pdf, .md, .docx) with app-specific details like real URLs, user roles, and test data"),
    app_id: Optional[str] = Form(None, description="The active application ID used to automatically retrieve linked Knowledge Base grounding context assets")
):
    """
    Generate test cases using Gemini. At least one of `file` or `wireframe` is required.
    Integrates persistent grounding constraints dynamically pulled straight from your Knowledge Base layout.
    """
    has_doc = file and file.filename
    has_wireframe = wireframe and wireframe.filename

    if not has_doc and not has_wireframe:
        raise HTTPException(
            status_code=400,
            detail="At least one input is required: upload a requirements document, a wireframe/screenshot, or both."
        )

    # 1. DYNAMIC DATA GROUNDING: Fetch assets from database using app_id context
    knowledge_context = ""
    if app_id:
        try:
            assets = await db.knowledgeasset.find_many(
                where={"appId": str(app_id)}
            )
            if assets:
                knowledge_context = "\n\n[CRITICAL GROUNDING CONSTRAINTS - ADHERE TO THE FOLLOWING RULES]"
                for asset in assets:
                    knowledge_context += f"\n- {asset.name} (Context Rule): {asset.summary}"
                    if asset.url:
                        knowledge_context += f" (Reference Resource Link: {asset.url})"
                knowledge_context += "\n[END OF GROUNDING CONSTRAINTS]\n"
        except Exception as e:
            print(f"Telemetry Core Warning: Knowledge Base indexing skipped. details: {str(e)}")

    # Extract requirements document text if provided
    content = None
    if has_doc:
        extracted_text = await extract_text_from_file(file)
        if len(extracted_text.strip()) < 20:
            raise HTTPException(
                status_code=400,
                detail="Requirements document appears to be empty or has too little content."
            )
        content = f"{extracted_text}{knowledge_context}"

    # Read wireframe image bytes if provided
    image_bytes = None
    media_type = None
    if has_wireframe:
        if not _is_image(wireframe):
            raise HTTPException(
                status_code=400,
                detail=f"Wireframe must be an image file (.png, .jpg, .jpeg, .webp). Got: {wireframe.filename}"
            )
        image_bytes = await wireframe.read()
        media_type = wireframe.content_type or "image/png"

    # Extract context file if manually provided via upload field
    context = None
    if context_file and context_file.filename:
        try:
            context = await extract_text_from_file(context_file)
            if len(context.strip()) < 10:
                context = None
        except HTTPException:
            context = None  

    # Fallback to append knowledge base if no primary document text block exists
    if has_wireframe and not has_doc and knowledge_context:
        if context:
            context = f"{context}\n{knowledge_context}"
        else:
            context = knowledge_context

    try:
        if has_doc and has_wireframe:
            raw_output = await generate_test_cases_from_both(
                content=content,
                image_bytes=image_bytes,
                media_type=media_type,
                context=context
            )
            source = "document + wireframe"
        elif has_wireframe:
            raw_output = await generate_test_cases_from_image(
                image_bytes=image_bytes,
                media_type=media_type,
                context=context
            )
            source = "wireframe"
        else:
            raw_output = await generate_test_cases_from_text(
                content=content,
                context=context
            )
            source = "document"

        test_cases = _clean_and_parse_json(raw_output)

    except ValueError as val_err:
        raise HTTPException(status_code=500, detail=str(val_err))
    except json.JSONDecodeError as json_err:
        raise HTTPException(status_code=500, detail=f"Failed parsing Gemini structural payload array: {str(json_err)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API error: {str(e)}")

    filename = file.filename if has_doc else wireframe.filename

    # Save TestRun to DB
    run = await db.testrun.create(data={
        "filename": filename,
        "total": len(test_cases),
        "status": "completed"
    })

    # Save each test case linked to this run
    for tc in test_cases:
        await db.testresult.create(data={
            "runId": run.id,
            "title": tc.get("title", "Untitled Test Case"),
            "steps": json.dumps(tc.get("steps", [])) if isinstance(tc.get("steps"), list) else tc.get("steps", "[]"),
            "expectedResult": tc.get("expected_result", tc.get("expectedResult", "Passed")),
            "type": tc.get("type", "functional")
        })

    return GenerateTestResponse(
        run_id=run.id,
        filename=filename,
        total=len(test_cases),
        context_used=(context is not None or knowledge_context != ""),
        source=source,
        test_cases=test_cases
    )