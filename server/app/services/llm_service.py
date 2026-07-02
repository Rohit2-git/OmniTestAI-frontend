import os
import json
import asyncio as _asyncio
from typing import Any, List
from datetime import datetime
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field
from google import genai        # type: ignore
from google.genai import types  # type: ignore

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# ── Token usage log ────────────────────────────────────────────────────────
# Canonical path: server/token_usage_log.json — must match token_usage.py's
# router exactly. This used to resolve one directory too shallow (server/app/
# token_usage_log.json), which is the same misplacement token_usage.py's
# one-time startup migration was written to clean up — except that migration
# only runs once, at startup, and this file kept writing to the wrong path on
# every single generation afterward, so the wrong file just got recreated and
# silently grew again until the next restart swept it up. Fixed to point at
# the same file token_usage.py actually reads from.
_TOKEN_LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "token_usage_log.json")

def _append_token_log(entry: dict):
    try:
        path = os.path.abspath(_TOKEN_LOG_PATH)
        existing = []
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    existing = json.load(f)
            except Exception:
                existing = []
        existing.append(entry)
        # NOTE: this used to be `existing = existing[-500:]` here, which
        # silently discarded every entry beyond the most recent 500 on every
        # single write. Retries alone can produce 2-3 log entries per test
        # case, so that cap was getting hit — and quietly erasing history —
        # far sooner than "500 generations" would suggest. Not capping here
        # at all; see the note below about why a flat JSON file isn't a great
        # long-term home for this regardless.
        with open(path, "w") as f:
            json.dump(existing, f)
    except Exception as e:
        print(f"[Token log write error]: {e}")

def _extract_tokens(response) -> dict:
    try:
        meta = response.usage_metadata
        return {
            "input_tokens": getattr(meta, "prompt_token_count", 0) or 0,
            "output_tokens": getattr(meta, "candidates_token_count", 0) or 0,
            "total_tokens": getattr(meta, "total_token_count", 0) or 0,
        }
    except Exception:
        return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}


def _safe_parse_json(raw: str) -> Any:
    if not raw:
        raise ValueError("Empty response from Gemini")
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    if raw.startswith("["):
        last_complete = raw.rfind("},")
        if last_complete == -1:
            last_complete = raw.rfind("}")
        if last_complete != -1:
            candidate = raw[:last_complete + 1] + "]"
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass
    for cutoff in [raw.rfind('",'), raw.rfind('",\n'), raw.rfind('":')]:
        if cutoff > 0:
            candidate = raw[:cutoff] + '"}'
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                continue
    raise ValueError(f"Could not parse Gemini response as JSON: {raw[:200]}")


class BlueprintItem(BaseModel):
    title: str = Field(description="Short name of the test case scenario")
    type: str = Field(description="Must be exactly positive, negative, or edge_case")
    objective: str = Field(description="One sentence statement of what behavior is being validated")

class BlueprintListSchema(BaseModel):
    blueprints: List[BlueprintItem]

class ExpandedTestCaseSchema(BaseModel):
    title: str
    steps: List[str] = Field(description="Explicit browser-level action instructions using clear verbs like Navigate to, Click, Type, or Press Enter")
    expected_result: str = Field(description="Precise description of target screen confirmation parameters")
    type: str


def _build_pass1_prompt(context: str = None, count: int = 20) -> str:
    context_section = f"\nContext Details:\n{context}" if context else ""
    return f"""You are a Principal QA Architect.{context_section}
Analyze ALL provided application inputs (screenshots, requirements, wireframes) and extract exactly {count} distinct core test case blueprints.

━━━ STEP 1 — FEATURE INVENTORY (do this mentally before generating any blueprints) ━━━
First, identify EVERY distinct feature area / page visible across ALL inputs. For example:
- Login / Authentication
- Product Listing / Inventory page
- Sidebar Navigation (hamburger menu, nav links)
- Shopping Cart (add, remove, view)
- Checkout flow
- Sorting / Filtering
- Product Detail page
- Logout
- Error states / user-type behaviors
List every area you can see. Do NOT skip areas just because they seem secondary.

━━━ STEP 2 — PROPORTIONAL DISTRIBUTION (hard rule) ━━━
Divide the {count} blueprints proportionally across ALL feature areas you identified.
- NO single feature area may account for more than 25% of the total blueprints (i.e. max {max(1, count // 4)} out of {count}), UNLESS the entire input is about only that one feature.
- Authentication / login scenarios are ONE feature area — count ALL login variants (valid login, locked user, invalid credentials, empty fields, case sensitivity, SQL injection, keyboard nav, etc.) together toward that 25% cap.
- Spread the remaining 75%+ across the other feature areas: cart actions, navigation, sorting, product details, logout, checkout, etc.

━━━ STEP 3 — DIVERSITY RULES ━━━
- Cover positive flows, negative/error flows, and edge cases across DIFFERENT features — not multiple negative flows of the same feature.
- Do NOT generate more than 2 blueprints that are minor variations of the same action on the same page (e.g. "empty username" and "empty password" count as 2 login-page variants and that's enough for that sub-area).
- Prioritize cross-feature user journeys: add to cart → view cart → checkout; login → browse → logout; open sidebar → click nav link → land on page.

🚨 DEMO LIMIT DIRECTIVE: 
If the requested count is low (e.g., 5), pick one high-impact test from EACH of the top distinct feature areas rather than multiple variants of the same feature."""


def _build_pass2_prompt(title: str, test_type: str, objective: str, context: str = None, test_data: dict = None, base_url: str = None) -> str:
    context_section = f"\nApp Architecture Context:\n{context}" if context else ""
    test_data_section = ""
    if test_data:
        test_data_section = f"""

TEST DATA TO USE (provided, real values — not invented):
{json.dumps(test_data)}
Wherever a step needs one of these fields (e.g. a name, email, age, or any other key listed
above), use this EXACT value, written verbatim. Do not invent a different value for any field
that appears in this list. For any data a step needs that ISN'T listed here, invent realistic
sample data as you normally would."""

    if base_url:
        url_constraint = f"""
!!HARD CONSTRAINT — URL: The ONLY permitted URL in any Navigate step is: {base_url}
- You MUST use exactly "{base_url}" as the Navigate URL. No exceptions.
- NEVER invent, guess, or substitute any other URL (e.g. example.com, acme.com, inventory-system.com).
- If the test scenario involves a subsystem (inventory, CS tool, admin panel), it still lives at {base_url}. Navigate there first.
- Violation: writing any URL other than {base_url} in a Navigate step is a critical error.\n"""
    else:
        url_constraint = ""

    return f"""You are an Expert QA Engineer writing steps for an AI browser agent.{url_constraint}{context_section}{test_data_section}
Expand this test case into clear, executable action steps.

Target Scenario:
- Title: {title}
- Type: {test_type}
- Objective: {objective}

STEP WRITING RULES:
1. Steps are USER ACTIONS only. No verify/assert/confirm/check/ensure/observe steps ever —
   the executor cannot act on these, they are dead weight. Every step must be a real browser
   action: navigate, click, type, press a key, select, or scroll. Nothing else.
2. Never reference HTML IDs, CSS selectors, or DOM attributes.
3. ALWAYS start from the application homepage. The URL to navigate to is specified in the
   HARD CONSTRAINT above — use it verbatim. Never navigate to a deep subpath directly.
   WRONG: "Navigate to https://en.wikipedia.org/wiki/Artificial_intelligence"
   RIGHT: "Navigate to https://en.wikipedia.org/" then "Search for 'Artificial intelligence'"
   If an Application Base URL is provided above, use THAT exact URL for the first Navigate step.
   NEVER invent a URL — only use the one provided.
4. For searching: ALWAYS use "Search for 'X'" immediately followed by "Press Enter" as the very
   next step — a search that is only typed and never submitted never shows a result page.
   WRONG: ["Search for 'Anonymous'"]  (leaves the term sitting in the box, nothing happens)
   RIGHT: ["Search for 'Anonymous'", "Press Enter"]
   Never use "Type X into search field" for this.
5. For form inputs: "Enter 'value' in the [field name]"
6. For clicks: "Click the [element name]"
7. Write 3-8 steps. Use realistic specific sample data (real names, real queries). The LAST step
   must be the final real action needed to reach the state being tested (e.g. the click, the
   keypress, the submission) — do not add a trailing step describing what should then be seen.
   Put what success looks like in expected_result instead, not in the steps list.
8. Exception to rule 4: if the objective is specifically about the autocomplete/suggestions
   dropdown itself (e.g. "autocomplete at 2 chars"), end on "Search for 'ar'" WITHOUT a Press
   Enter step — pressing Enter would submit the search and the dropdown wouldn't be the thing
   being tested anymore. Put "Autocomplete suggestions appear below the search box" in
   expected_result, not as a step. For every other search-related objective, rule 4 applies and
   Press Enter must follow the search step.
9. NEVER write a step that starts with "Perform:", "Perform", "Test that", "Check whether", or any
   other summary/restatement of the objective. Every single step must be one concrete, atomic
   browser action a person could literally do with a mouse and keyboard.
   WRONG: "Perform: Confirm that selecting a different language routes to the right subdomain"
   RIGHT: "Click the 'Languages' button" then "Click 'Deutsch'"
   (then expected_result: "The page reloads at the de.wikipedia.org subdomain")
10. If the objective itself describes an outcome rather than an action (e.g. "X correctly routes to Y",
    "Z displays the right behavior"), do NOT copy that phrasing into a step. Decompose it into the
    literal sequence of clicks/inputs that would trigger that outcome, and put the outcome itself
    in expected_result.

Return ONLY this JSON:
{{"title":"{title}","steps":["step1","step2","step3"],"expected_result":"what the user sees when test passes","type":"{test_type}"}}"""


async def discover_test_blueprints(
    content: str = None,
    image_part: Any = None,
    image_parts: List[Any] = None,
    context: str = None,
    count: int = 20,
    app_id: str = None,
    batch_label: str = None
) -> list:
    base_prompt = _build_pass1_prompt(context, count)

    # Build the image list: prefer image_parts (multi-image), fall back to single image_part
    all_image_parts = image_parts if image_parts else ([image_part] if image_part else [])

    num_images = len(all_image_parts)
    input_text = f"Analyze inputs to discover {count} distinct testing blueprint items.\n"
    if num_images > 1:
        input_text += f"\nNOTE: {num_images} screenshots have been provided, each showing a DIFFERENT page or state of the application. You MUST treat each screenshot as a separate feature area and distribute test coverage across ALL of them — do not focus on just one screenshot.\n"
    if content:
        input_text += f"\nRequirements content:\n{content}"
    contents = [base_prompt, input_text]
    for img in all_image_parts:
        contents.append(img)

    config = types.GenerateContentConfig(
        temperature=0.1,
        response_mime_type="application/json",
        response_schema=BlueprintListSchema,
        max_output_tokens=2000
    )

    for attempt in range(3):
        try:
            response = await _asyncio.to_thread(
                client.models.generate_content,
                model="gemini-3-flash-preview",
                contents=contents,
                config=config
            )
            tokens = _extract_tokens(response)
            _append_token_log({
                "id": f"gen-p1-{int(datetime.utcnow().timestamp()*1000)}",
                "timestamp": datetime.utcnow().isoformat(),
                "type": "generation_pass1",
                "model": "gemini-3-flash-preview",
                "app_id": app_id,
                "batch_label": batch_label,
                "input_tokens": tokens["input_tokens"],
                "output_tokens": tokens["output_tokens"],
                "total_tokens": tokens["total_tokens"],
            })
            parsed = _safe_parse_json(response.text)
            blueprints = parsed.get("blueprints", parsed) if isinstance(parsed, dict) else parsed
            if blueprints and isinstance(blueprints, list):
                return blueprints[:count]
        except Exception as e:
            if attempt == 2:
                raise ValueError(f"Blueprint discovery failed after 3 attempts: {str(e)}")
            await _asyncio.sleep(1)
    return []


def _ensure_press_enter_after_search(steps: list) -> list:
    """
    Deterministic safety net: the model doesn't always reliably add "Press
    Enter" after a "Search for 'X'" step, even when instructed to in the
    prompt. Rather than trust the model every time, walk the steps and
    insert "Press Enter" wherever a search step isn't immediately followed
    by one — guaranteeing every search actually gets submitted.

    Skips this for autocomplete-specific steps (where the step text itself
    mentions "autocomplete" or "suggestion"), matching the one intentional
    exception in the prompt rules.
    """
    if not steps:
        return steps

    result = []
    for i, step in enumerate(steps):
        result.append(step)
        s_lower = step.strip().lower()
        is_search_step = s_lower.startswith("search for")
        mentions_autocomplete = "autocomplete" in s_lower or "suggestion" in s_lower
        if is_search_step and not mentions_autocomplete:
            next_step = steps[i + 1].strip().lower() if i + 1 < len(steps) else ""
            if not next_step.startswith("press enter"):
                result.append("Press Enter")
    return result


async def expand_single_test_case(
    blueprint: dict,
    context: str = None,
    app_id: str = None,
    batch_label: str = None,
    test_data: dict = None,
    base_url: str = None
) -> dict:
    import re as _re
    raw_objective = blueprint.get("objective", "Validate feature behavior.")
    clean_objective = _re.sub(
        r'^(validate that|verify that|ensure that|confirm that|check that|assert that|validate|verify|ensure|confirm|check|assert)\s+',
        '', raw_objective, flags=_re.IGNORECASE
    ).strip()
    if clean_objective:
        clean_objective = clean_objective[0].upper() + clean_objective[1:]

    prompt = _build_pass2_prompt(
        title=blueprint.get("title", "Untitled"),
        test_type=blueprint.get("type", "positive"),
        objective=clean_objective,
        context=context,
        test_data=test_data,
        base_url=base_url
    )

    config = types.GenerateContentConfig(
        temperature=0.1,
        response_mime_type="application/json",
        response_schema=ExpandedTestCaseSchema,
        max_output_tokens=1500
    )

    for attempt in range(3):
        try:
            response = await _asyncio.to_thread(
                client.models.generate_content,
                model="gemini-3-flash-preview",
                contents=prompt,
                config=config
            )
            tokens = _extract_tokens(response)
            _append_token_log({
                "id": f"gen-p2-{int(datetime.utcnow().timestamp()*1000)}",
                "timestamp": datetime.utcnow().isoformat(),
                "type": "generation_pass2",
                "model": "gemini-3-flash-preview",
                "app_id": app_id,
                "batch_label": batch_label,
                "test_title": blueprint.get("title", "Untitled"),
                "input_tokens": tokens["input_tokens"],
                "output_tokens": tokens["output_tokens"],
                "total_tokens": tokens["total_tokens"],
            })
            parsed = _safe_parse_json(response.text)
            steps = parsed.get("steps", [])
            _SKIP_PREFIXES = (
                'verify', 'assert', 'confirm that', 'check that', 'ensure', 'validate',
                'perform', 'test that', 'check whether', 'confirm', 'check', 'observe'
            )
            steps = [s for s in steps if not s.strip().lower().startswith(_SKIP_PREFIXES)]
            steps = _ensure_press_enter_after_search(steps)
            if not steps or not isinstance(steps, list) or len(steps) < 2:
                raise ValueError(f"Insufficient steps ({len(steps)}) — retrying")
            parsed["steps"] = steps
            if "title" not in parsed:
                parsed["title"] = blueprint.get("title", "Untitled")
            if "type" not in parsed:
                parsed["type"] = blueprint.get("type", "positive")
            if "expected_result" not in parsed:
                parsed["expected_result"] = raw_objective
            return parsed
        except Exception as e:
            if attempt < 2:
                await _asyncio.sleep(0.5)
                continue
            title = blueprint.get("title", "Untitled")
            search_term = title.split()[0] if title else "the topic"
            # Generic fallback that stays 100% executable: navigate then search.
            # Ends on the last real action — no trailing no-op "Observe" step.
            # expected_result carries what success looks like instead.
            return {
                "title": title,
                "steps": [
                    "Navigate to the application homepage",
                    f"Search for '{search_term}'",
                    "Press Enter"
                ],
                "expected_result": raw_objective,
                "type": blueprint.get("type", "positive")
            }


async def _expand_all(blueprints: list, context: str = None, app_id: str = None, batch_label: str = None, base_url: str = None) -> list:
    semaphore = _asyncio.Semaphore(4)
    async def _expand_one(bp):
        async with semaphore:
            await _asyncio.sleep(0.1)
            return await expand_single_test_case(bp, context, app_id=app_id, batch_label=batch_label, base_url=base_url)
    return list(await _asyncio.gather(*[_expand_one(bp) for bp in blueprints]))


async def generate_test_cases_from_text(content: str, context: str = None, count: int = 20, app_id: str = None, batch_label: str = None, base_url: str = None) -> list:
    blueprints = await discover_test_blueprints(content=content, context=context, count=count, app_id=app_id, batch_label=batch_label)
    return await _expand_all(blueprints, context, app_id=app_id, batch_label=batch_label, base_url=base_url)

async def generate_test_cases_from_image(image_bytes: bytes, media_type: str, context: str = None, count: int = 20, app_id: str = None, batch_label: str = None, base_url: str = None) -> list:
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=media_type)
    blueprints = await discover_test_blueprints(image_part=image_part, context=context, count=count, app_id=app_id, batch_label=batch_label)
    return await _expand_all(blueprints, context, app_id=app_id, batch_label=batch_label, base_url=base_url)

async def generate_test_cases_from_images(image_list: list, context: str = None, count: int = 20, app_id: str = None, batch_label: str = None, base_url: str = None) -> list:
    """Multi-image variant: image_list is a list of (image_bytes, media_type) tuples.
    All images are passed to Gemini together so it can see every page/screen at once
    before generating blueprints — prevents anchoring on whichever single image was
    picked when multiple screenshots cover different features."""
    image_parts = [types.Part.from_bytes(data=b, mime_type=mt) for b, mt in image_list]
    blueprints = await discover_test_blueprints(image_parts=image_parts, context=context, count=count, app_id=app_id, batch_label=batch_label)
    return await _expand_all(blueprints, context, app_id=app_id, batch_label=batch_label, base_url=base_url)

async def generate_test_cases_from_both(content: str, image_bytes: bytes, media_type: str, context: str = None, count: int = 20, app_id: str = None, batch_label: str = None, base_url: str = None) -> list:
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=media_type)
    blueprints = await discover_test_blueprints(content=content, image_part=image_part, context=context, count=count, app_id=app_id, batch_label=batch_label)
    return await _expand_all(blueprints, context, app_id=app_id, batch_label=batch_label, base_url=base_url)

async def generate_test_cases_from_both_multi(content: str, image_list: list, context: str = None, count: int = 20, app_id: str = None, batch_label: str = None, base_url: str = None) -> list:
    """Multi-image + text variant: image_list is a list of (image_bytes, media_type) tuples."""
    image_parts = [types.Part.from_bytes(data=b, mime_type=mt) for b, mt in image_list]
    blueprints = await discover_test_blueprints(content=content, image_parts=image_parts, context=context, count=count, app_id=app_id, batch_label=batch_label)
    return await _expand_all(blueprints, context, app_id=app_id, batch_label=batch_label, base_url=base_url)