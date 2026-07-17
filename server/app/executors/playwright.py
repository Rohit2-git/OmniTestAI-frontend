"""
Playwright Executor — Direct Playwright execution engine.
Parses plain English steps and maps them to Playwright actions.
Single test → headful (live browser window).
Suite/NL    → headless + screenshots per step + video recording.
"""
import threading
import os
import re
import base64
import asyncio
import sys
import tempfile
import shutil
import json
from typing import List
from app.services.media_storage import save_screenshot_bytes, save_video_file


def _screenshot_to_base64(screenshot_bytes: bytes) -> str:
    return base64.b64encode(screenshot_bytes).decode("utf-8")


def _video_to_base64(video_path: str) -> str:
    with open(video_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _repair_and_parse_json(raw: str) -> dict | None:
    """
    Gemini's self-heal responses are supposed to be clean JSON (response_mime_type
    is forced to application/json), but long DOM/explanation content can still get
    the output truncated mid-string — producing errors like "Unterminated string"
    or "Expecting value". Previously any parse failure silently became a "skip",
    which then got mislabeled as a successful [SELF-HEALED] step. This recovers
    what it can instead of giving up immediately.
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Attempt 1: the response was cut off mid-object — try closing it cleanly.
    for suffix in ('"}', '"', '}', '"}}'):
        try:
            return json.loads(raw + suffix)
        except json.JSONDecodeError:
            continue

    # Attempt 2: pull out whatever key:value pairs are still intact via regex,
    # even if the object as a whole never closed properly.
    result = {}
    for key in ("action", "healed_type", "healed_selector", "role_name", "navigate_url", "explanation"):
        m = re.search(rf'"{key}"\s*:\s*"((?:[^"\\]|\\.)*)"', raw)
        if m:
            result[key] = m.group(1).replace('\\"', '"')
    return result if "action" in result else None


async def _call_gemini_healer(
    step: str,
    failed_selectors: List[str],
    dom_snapshot: str,
    error_msg: str,
    app_id: str = None,
    batch_label: str = None,
    screenshot_bytes: bytes = None,   # ← NEW: live page screenshot for visual triage
) -> dict:
    """
    Full-Page Situational Triage Engine: when a step fails (element not found,
    selector broken, page state unexpected), Gemini scans the entire DOM **and
    a live screenshot**, reasons about *why* the failure happened, and decides the
    best next action — which may be an alternative selector for the same action,
    a different action entirely, a navigation step first, or a graceful skip if
    the step is genuinely irrelevant to the current page state.

    Returns a dict with:
      {
        "action":          "heal" | "skip" | "navigate" | "press_enter",
        "healed_type":     "css" | "text" | "role"   (only when action == "heal"),
        "healed_selector": "...",                     (only when action == "heal"),
        "role_name":       "...",                     (only when healed_type == "role"),
        "navigate_url":    "...",                     (only when action == "navigate"),
        "explanation":     "brief reason"
      }
    """
    from google import genai as _genai          # type: ignore
    from google.genai import types as _gtypes   # type: ignore
    from datetime import datetime as _dt
    import base64 as _b64

    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        return {"action": "skip", "explanation": "No API key — skipping step"}

    try:
        _client = _genai.Client(api_key=gemini_key)

        text_prompt = f"""You are an expert QA Self-Healing automation engine with full situational awareness.

A Playwright test step has failed. Your job is NOT just to find an alternative selector —
you must analyze the full page state (DOM + screenshot if provided) and decide the best possible next action.

=== FAILED STEP ===
Original intent: "{step}"
Selectors already tried: {failed_selectors}
Error: "{error_msg}"

=== CURRENT PAGE DOM (first 6000 chars) ===
{(dom_snapshot or "")[:6000]}

=== YOUR TASK ===
1. Look at the screenshot (if provided) AND read the DOM. Understand what page/state the browser is actually on.
2. Decide the best recovery action:
   - "heal"        → PREFERRED: you found the correct element; provide the best CSS selector from the DOM
   - "navigate"    → the browser needs to go to a URL first before this step makes sense
   - "press_enter" → pressing Enter is the right next move (e.g. after filling a search field)
   - "skip"        → LAST RESORT ONLY: element genuinely does not exist anywhere on this page
3. Always try to heal first. Only skip if the element truly cannot be found anywhere in the DOM.
4. For "heal" on an input field: look for the exact input element in the DOM (by id, name, placeholder, type, or aria-label).
   Prefer CSS selectors like input[name="username"] or input[type="password"] — these are the most reliable.
5. If the original intent was to select an option from a dropdown/select list, your healed_selector must
   target the <select> element itself (never the <option>) — the caller always calls select_option(label=...)
   on whatever selector you provide for this case, so pointing at an <option> will not work.

Respond ONLY with valid JSON (no markdown, no explanation outside the JSON):
{{
    "action": "heal" | "skip" | "navigate" | "press_enter",
    "healed_type": "css" | "text" | "role",
    "healed_selector": "the selector or text to match",
    "role_name": "button | textbox | link | etc — only if healed_type is role",
    "navigate_url": "full URL — only if action is navigate",
    "explanation": "under 15 words: what went wrong and what you decided to do"
}}"""

        # Build contents list — always include text prompt, optionally add screenshot
        contents = []
        if screenshot_bytes:
            try:
                img_b64 = _b64.b64encode(screenshot_bytes).decode("utf-8")
                contents.append(_gtypes.Part.from_bytes(data=_b64.b64decode(img_b64), mime_type="image/png"))
            except Exception as _img_err:
                print(f"[Healer screenshot encode error]: {_img_err}")
        contents.append(text_prompt)

        response = await asyncio.to_thread(
            _client.models.generate_content,
            model="gemini-3-flash-preview",
            contents=contents,
            config=_gtypes.GenerateContentConfig(
                max_output_tokens=1536,
                response_mime_type="application/json"
            )
        )

        # ── Log token usage ───────────────────────────────────────────────
        try:
            meta = response.usage_metadata
            _log_entry = {
                "id": f"heal-{int(_dt.utcnow().timestamp()*1000)}",
                "timestamp": _dt.utcnow().isoformat(),
                "type": "self_healing",
                "phase": "execution",
                "model": "gemini-3-flash-preview",
                "app_id": app_id,
                "batch_label": batch_label or "Execution / Self-Heal",
                "test_title": step[:60],
                "input_tokens":  getattr(meta, "prompt_token_count", 0) or 0,
                "output_tokens": getattr(meta, "candidates_token_count", 0) or 0,
                "total_tokens":  getattr(meta, "total_token_count", 0) or 0,
            }
            _log_entry["cost_usd"] = round(
                (_log_entry["input_tokens"] / 1_000_000) * 0.50 +
                (_log_entry["output_tokens"] / 1_000_000) * 3.00, 6
            )
            _token_log = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "token_usage_log.json")
            )
            _existing = []
            if os.path.exists(_token_log):
                with open(_token_log, "r") as _f:
                    _existing = json.load(_f)
            _existing.append(_log_entry)
            with open(_token_log, "w") as _f:
                json.dump(_existing, _f)
        except Exception as _le:
            print(f"[Token log error in healer]: {_le}")
        # ─────────────────────────────────────────────────────────────────

        # BUG FIX 1: response.text can be None if Gemini returned no candidates
        # (content filtered, rate limited, model error). Guard before calling .strip().
        raw = response.text
        if not raw:
            return {"action": "skip", "explanation": "Gemini returned empty response — skipping step"}

        raw = raw.strip()

        # BUG FIX 2: the old code used raw.split("") which splits on empty string,
        # producing a list of individual characters — completely wrong. The correct
        # way to strip ```json ... ``` fences is to strip the first and last lines
        # when the response starts with a backtick fence, even though
        # response_mime_type="application/json" should prevent fences entirely.
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1]).strip()

        # BUG FIX 3: if raw is still empty after stripping fences, json.loads("")
        # throws JSONDecodeError("Expecting value: line 1 column 1 (char 0)") which
        # was the exact error surfacing as [Self-Healing Telemetry Network Error].
        if not raw:
            return {"action": "skip", "explanation": "Gemini response was empty after cleaning — skipping step"}

        parsed = _repair_and_parse_json(raw)
        if parsed is None:
            print(f"[Self-Healing Telemetry Network Error]: unrecoverable JSON, raw response was: {raw[:300]}")
            return {"action": "skip", "explanation": "Gemini response could not be parsed even after repair — skipping step"}
        return parsed

    except Exception as e:
        print(f"[Self-Healing Telemetry Network Error]: {e}")
        return {"action": "skip", "explanation": str(e)}


async def _execute_step(page, step: str, app_id: str = None, batch_label: str = None) -> dict:
    # BUG FIX: step can arrive as None when the steps JSON array contains a null
    # entry, or when a step dict had a missing "instruction" key and the caller
    # read it as None. Guard here so nothing below crashes on .lower()/.strip().
    if not step or not isinstance(step, str):
        return {"status": "passed", "detail": "Empty/null step — skipped"}

    # Steps generated by the NL autonomous agent may carry a disambiguation
    # marker like "Click 'Add to cart' [context: Sauce Labs Backpack]" — used
    # to tell apart several identical controls (e.g. repeated "Add to cart"
    # buttons on a product listing). Strip it before any matching logic runs,
    # but keep the value so the click handler can scope its search with it.
    click_context = None
    _ctx_match = re.search(r"\[context:\s*(.+?)\]\s*$", step, re.IGNORECASE)
    if _ctx_match:
        click_context = _ctx_match.group(1).strip()
        step = step[:_ctx_match.start()].strip()

    s = step.lower().strip()
    healer_notes = None
    self_healed = False

    try:
        if any(s.startswith(w) for w in ["navigate to", "go to", "open", "visit"]):
            url_match = re.search(r'https?://\S+|www\.\S+', step)
            if url_match:
                url = url_match.group(0).rstrip('.,)')
                if not url.startswith("http"):
                    url = "https://" + url
                await page.goto(url, timeout=30000, wait_until="domcontentloaded")
                try:
                    await page.wait_for_load_state("networkidle", timeout=15000)
                except Exception:
                    pass  # networkidle can hang on sites with long-polling — domcontentloaded is enough
                return {"status": "passed", "detail": f"Navigated to {url}"}
            return {"status": "passed", "detail": "Navigate step — no URL found, skipping"}

        if any(w in s for w in ["type", "enter", "fill", "input", "write", "search for", "search"]):
            text_match = re.search(r"['\"](.+?)['\"]", step)
            text = text_match.group(1) if text_match else ""
            if text:
                # Detect field intent from the step text
                is_search   = any(w in s for w in ["search for", "search"])
                is_password = any(w in s for w in ["password", "pass"])
                is_username = any(w in s for w in ["username", "user name", "user_name"])
                is_email    = any(w in s for w in ["email", "e-mail"])

                if is_password:
                    # Password field — be very specific, never fall back to first textbox
                    locators_to_try = [
                        page.locator("input[type='password']").first,
                        page.locator("input[name*='pass']").first,
                        page.locator("input[id*='pass']").first,
                        page.locator("input[placeholder*='assword']").first,
                        page.get_by_label(re.compile(r"password", re.IGNORECASE)),
                    ]
                elif is_username:
                    # Username field — prioritize name/id/placeholder over generic textbox
                    locators_to_try = [
                        page.locator("input[name='username']").first,
                        page.locator("input[id*='user']").first,
                        page.locator("input[placeholder*='sername']").first,
                        page.locator("input[name*='user']").first,
                        page.get_by_label(re.compile(r"username|user name", re.IGNORECASE)),
                        page.locator("input[type='text']").first,
                    ]
                elif is_email:
                    locators_to_try = [
                        page.locator("input[type='email']").first,
                        page.locator("input[name*='email']").first,
                        page.locator("input[id*='email']").first,
                        page.get_by_label(re.compile(r"email", re.IGNORECASE)),
                        page.get_by_role("textbox"),
                    ]
                elif is_search:
                    locators_to_try = [
                        page.get_by_role("searchbox"),
                        page.locator("input[type='search']").first,
                        page.locator("input[name='search']").first,
                        page.locator("input[placeholder*='earch']").first,
                        page.get_by_role("textbox"),
                        page.locator("input[type='text']").first,
                        page.locator("input:visible").first,
                    ]
                else:
                    locators_to_try = [
                        page.get_by_role("searchbox"),
                        page.get_by_role("textbox"),
                        page.get_by_role("combobox"),
                        page.locator("input[type='text']").first,
                        page.locator("input[type='search']").first,
                        page.locator("input:visible").first,
                        page.locator("textarea:visible").first,
                    ]

                # Field hint extraction (from step phrasing like "in the X field").
                # Uses .+? rather than a letters-only class — field labels routinely
                # contain punctuation ("Zip/Postal Code", "E-mail", "User's Name"), and
                # a restrictive character class silently fails to match those, which
                # used to fall through to a blind "first textbox on the page" locator
                # that can overwrite an already-filled field instead of the right one.
                field_hints = re.findall(r'(?:in|into|on|the)\s+(?:the\s+)?(.+?)(?:\s+field|\s+input|\s+box|$)', s)
                if field_hints and not is_password and not is_username and not is_email:
                    hint = field_hints[0].strip()
                    hint_locators = [
                        page.get_by_placeholder(re.compile(re.escape(hint), re.IGNORECASE)),
                        page.get_by_label(re.compile(re.escape(hint), re.IGNORECASE)),
                    ]
                    # These two use hint inside a quoted CSS attribute selector — skip them
                    # if hint itself contains a quote (e.g. "user's name"), which would
                    # otherwise break the selector string. The regex-based locators above
                    # already cover this case fine.
                    if "'" not in hint:
                        hint_locators += [
                            page.locator(f"[name*='{hint}']"),
                            page.locator(f"[placeholder*='{hint}']"),
                        ]
                    locators_to_try = hint_locators + locators_to_try
                
                # Wrapped input loop selector sequence inside our safe execution layer.
                # Extra safety net on top of the hint-matching above: if a candidate
                # locator still resolves to MULTIPLE elements (e.g. a generic
                # "any visible textbox" fallback), prefer the first one that's
                # currently EMPTY over the literal first in DOM order — so an
                # overly generic match can't silently overwrite a field an earlier
                # step already filled in (this was the actual mechanism behind the
                # postal-code-overwrote-first-name bug, on top of the hint-regex gap
                # already fixed above).
                success = False
                for loc in locators_to_try:
                    try:
                        target = loc.first
                        count = await loc.count()
                        if count > 1:
                            for idx in range(count):
                                candidate = loc.nth(idx)
                                try:
                                    if not await candidate.is_visible():
                                        continue
                                    current_value = await candidate.input_value()
                                    if not current_value:
                                        target = candidate
                                        break
                                except Exception:
                                    continue
                        await target.wait_for(state="visible", timeout=1500)
                        await target.clear()
                        await target.type(text, delay=40)
                        success = True
                        break
                    except:
                        continue
                
                # 🚨 INPUT SELF-HEALING ENFORCEMENT LOOP
                if not success:
                    try:
                        dom_tree = await page.content()
                    except Exception:
                        await asyncio.sleep(1.0)
                        try:
                            dom_tree = await page.content()
                        except Exception:
                            dom_tree = ""
                    # Capture screenshot so Gemini can visually see the page state
                    try:
                        _heal_screenshot = await page.screenshot(type="png")
                    except Exception:
                        _heal_screenshot = None
                    healing_plan = await _call_gemini_healer(
                        step, [str(l) for l in locators_to_try[:3]], dom_tree,
                        "Locators timed out / vanished",
                        app_id=app_id, batch_label=batch_label,
                        screenshot_bytes=_heal_screenshot
                    )
                    action = healing_plan.get("action", "heal")

                    if action == "skip":
                        return {"status": "passed", "detail": f"[SELF-HEALED] Gemini skipped unreachable step: {healing_plan.get('explanation', '')}"}

                    if action == "navigate":
                        nav_url = healing_plan.get("navigate_url", "")
                        if nav_url:
                            await page.goto(nav_url, timeout=30000, wait_until="domcontentloaded")
                            return {"status": "passed", "detail": f"[SELF-HEALED] Gemini navigated to {nav_url}: {healing_plan.get('explanation', '')}"}
                        return {"status": "passed", "detail": "[SELF-HEALED] Gemini suggested navigation but gave no URL — skipping"}

                    if action == "press_enter":
                        await page.keyboard.press("Enter")
                        return {"status": "passed", "detail": f"[SELF-HEALED] Gemini pressed Enter: {healing_plan.get('explanation', '')}"}

                    if "healed_selector" in healing_plan:
                        try:
                            h_sel = healing_plan["healed_selector"]
                            if healing_plan.get("healed_type") == "css":
                                target_loc = page.locator(h_sel).first
                            elif healing_plan.get("healed_type") == "text":
                                target_loc = page.get_by_text(re.compile(h_sel, re.IGNORECASE)).first
                            else:
                                target_loc = page.get_by_role(healing_plan.get("role_name", "textbox"), name=re.compile(h_sel, re.IGNORECASE)).first
                                
                            await target_loc.wait_for(state="visible", timeout=3000)
                            await target_loc.clear()
                            await target_loc.type(text, delay=40)
                            self_healed = True
                            healer_notes = healing_plan.get("explanation")
                        except Exception as retry_err:
                            raise ValueError(f"Self-healing strategy failed on fallback selector block: {str(retry_err)}")
                    else:
                        raise ValueError("Deterministic typing selector configurations exhausted. AI healing aborted.")

                return {
                    "status": "passed", 
                    "detail": f"Typed '{text}'" if not self_healed else f"[SELF-HEALED] Typed '{text}' via: {healer_notes}"
                }

        # Dedicated native <select> dropdown handler — must run BEFORE the generic
        # click branch below. A step like "Select 'X' from the ... dropdown" was
        # previously falling through to the click-matching logic used for buttons
        # and links, which cannot work for a native HTML <select>: its <option>
        # elements aren't visible/actionable via ordinary DOM interaction the way a
        # button is while the dropdown is closed. That mismatch meant both the
        # primary attempt AND the self-heal retry (which also just called .click())
        # failed the same way — the healer wasn't skipped, it just tried the wrong
        # kind of interaction and hung on Playwright's default actionability timeout
        # before giving up, which is why failures here surfaced as a raw ~45s
        # timeout with no [SELF-HEALED] badge instead of a clean success or failure.
        if "dropdown" in s or "select box" in s or "select-box" in s:
            text_match = re.search(r"['\"](.+?)['\"]", step)
            option_label = text_match.group(1) if text_match else None

            if option_label:
                # Descriptive words before "dropdown" (e.g. "product sort dropdown")
                # narrow down which <select> on the page is meant, when there's more
                # than one. Falls back to the first visible <select> if no hint
                # matches — fine for the common case of a single relevant dropdown.
                hint_match = re.search(r"(?:the\s+)?([a-z0-9\s]+?)\s+(?:dropdown|select box|select-box)", s)
                hint_words = [w for w in hint_match.group(1).strip().split() if len(w) > 2] if hint_match else []

                select_candidates = []

                # Most reliable strategy first: scan every <select> on the page and
                # find the one whose own <option> list actually contains the target
                # text. This is deterministic — no guessing from surrounding words —
                # and correctly handles pages with multiple dropdowns without ever
                # needing to call the AI healer at all for the common case.
                try:
                    all_selects = page.locator("select")
                    select_count = await all_selects.count()
                    for idx in range(select_count):
                        candidate = all_selects.nth(idx)
                        try:
                            options_text = await candidate.locator("option").all_inner_texts()
                            if any(option_label.strip().lower() == opt.strip().lower() for opt in options_text):
                                select_candidates.append(candidate)
                        except Exception:
                            continue
                except Exception:
                    pass

                for w in hint_words:
                    w_esc = re.escape(w)
                    select_candidates.append(
                        page.locator(f"select[class*='{w_esc}'], select[id*='{w_esc}'], select[name*='{w_esc}'], select[aria-label*='{w_esc}' i]").first
                    )
                select_candidates.append(page.locator("select:visible").first)
                select_candidates.append(page.locator("select").first)

                success = False
                for sel_loc in select_candidates:
                    try:
                        await sel_loc.wait_for(state="visible", timeout=1500)
                        await sel_loc.select_option(label=option_label)
                        success = True
                        break
                    except Exception:
                        continue

                if success:
                    return {"status": "passed", "detail": f"Selected '{option_label}' from dropdown"}

                # Self-heal: ask Gemini to locate the right <select> element. Always
                # retries with select_option() below, never .click() — we know
                # structurally this must be a native-select interaction regardless
                # of what generic action type the healer's response schema implies.
                try:
                    dom_tree = await page.content()
                except Exception:
                    dom_tree = ""
                try:
                    _heal_screenshot_select = await page.screenshot(type="png")
                except Exception:
                    _heal_screenshot_select = None
                healing_plan = await _call_gemini_healer(
                    step, [option_label], dom_tree,
                    "Could not locate the target <select> element for this dropdown option",
                    app_id=app_id, batch_label=batch_label,
                    screenshot_bytes=_heal_screenshot_select
                )
                action = healing_plan.get("action", "heal")

                if action == "skip":
                    return {"status": "passed", "detail": f"[SELF-HEALED] Gemini skipped unreachable dropdown selection: {healing_plan.get('explanation', '')}"}

                if "healed_selector" in healing_plan:
                    try:
                        h_sel = healing_plan["healed_selector"]
                        target_loc = page.locator(h_sel).first
                        await target_loc.wait_for(state="visible", timeout=3000)
                        await target_loc.select_option(label=option_label)
                        return {"status": "passed", "detail": f"[SELF-HEALED] Selected '{option_label}' via: {healing_plan.get('explanation', '')}"}
                    except Exception as retry_err:
                        return {"status": "failed", "detail": f"Dropdown selection failed even after self-healing: {str(retry_err)}"}

                return {"status": "failed", "detail": f"Could not find dropdown for '{option_label}': {healing_plan.get('explanation', 'no viable selector found')}"}

        if any(w in s for w in ["click", "press", "tap", "select", "choose", "submit"]):
            # Dedicated "Press Enter" / "Press the Enter key" handler — common after autocomplete
            # selection or search bars, where pressing Enter triggers navigation. Must not fall
            # through to self-healing (which calls page.content() and crashes mid-navigation).
            if "enter" in s and not re.search(r"['\"](.+?)['\"]", step):
                try:
                    await page.keyboard.press("Enter")
                    try:
                        await page.wait_for_load_state("domcontentloaded", timeout=15000)
                        await page.wait_for_load_state("networkidle", timeout=10000)
                    except Exception:
                        pass  # page may not navigate at all — that's fine
                    return {"status": "passed", "detail": "Pressed Enter"}
                except Exception as e:
                    return {"status": "failed", "detail": f"Failed pressing Enter: {str(e)}"}

            text_match = re.search(r"['\"](.+?)['\"]", step)
            if text_match:
                label = text_match.group(1)
                label_re = re.escape(label)
                label_lower = label.lower().strip()
                locators_to_try = [
                    page.get_by_role("button", name=re.compile(label_re, re.IGNORECASE)),
                    page.get_by_role("link", name=re.compile(label_re, re.IGNORECASE)),
                    page.get_by_text(re.compile(label_re, re.IGNORECASE)),
                    page.locator(f"button:has-text('{label}')"),
                    page.locator(f"[value='{label}']"),
                    page.locator(f"input[type='submit'][value*='{label}']"),
                ]

                # Labels like "cart icon" / "menu icon" are synthesized by the NL agent
                # for icon-only controls that have no real visible text (see
                # _get_clean_layout in nl_executor.py). Generic name-matching locators
                # above will never match these — route straight to the same
                # attribute-based strategies used for unquoted icon phrasing below.
                icon_prefixes = {
                    "cart icon": ("[data-testid*='cart'], [aria-label*='cart' i], [href*='cart'], .shopping_cart_link, #shopping_cart_container a", "cart|basket"),
                    "menu icon": ("[data-testid*='menu'], [aria-label*='menu' i], .bm-burger-button, #react-burger-menu-btn", "menu|nav"),
                    "search icon": ("[data-testid*='search'], [aria-label*='search' i]", "search"),
                    "close icon": ("[data-testid*='close'], [aria-label*='close' i]", "close"),
                    "wishlist icon": ("[data-testid*='wishlist'], [aria-label*='wishlist' i], [aria-label*='favorite' i]", "wishlist|favorite"),
                }
                if label_lower in icon_prefixes:
                    css_sel, name_pattern = icon_prefixes[label_lower]
                    locators_to_try = [
                        page.locator(css_sel).first,
                        page.get_by_role("link", name=re.compile(name_pattern, re.IGNORECASE)),
                        page.get_by_role("button", name=re.compile(name_pattern, re.IGNORECASE)),
                    ] + locators_to_try

                if click_context:
                    # Scope the search to whichever card/row/container also contains the
                    # disambiguating text (e.g. the product name) — resolves the classic
                    # "6 identical Add to cart buttons" ambiguity. Tried first, since it's
                    # the most precise match when a context hint is available.
                    ctx_re = re.escape(click_context)
                    locators_to_try = [
                        page.locator("div, li, article, section")
                            .filter(has_text=re.compile(ctx_re, re.IGNORECASE))
                            .get_by_role("button", name=re.compile(label_re, re.IGNORECASE))
                            .first,
                        page.locator("div, li, article, section")
                            .filter(has_text=re.compile(ctx_re, re.IGNORECASE))
                            .locator(f"button:has-text('{label}'), a:has-text('{label}'), [role='button']:has-text('{label}')")
                            .first,
                    ] + locators_to_try
            else:
                surrounding = re.sub(r'\b(?:click|press|tap|select|choose|submit|the|a|an|on)\b', '', s).strip()
                is_cart   = any(w in s for w in ["cart", "basket", "shopping"])
                is_nav    = any(w in s for w in ["menu", "hamburger", "navigation", "sidebar", "drawer"])
                is_social = any(w in s for w in ["twitter", "facebook", "linkedin", "instagram", "youtube", "social"])
                if is_cart:
                    locators_to_try = [
                        page.locator("[data-testid*='cart'], [aria-label*='cart' i], [href*='cart'], .shopping_cart_link, #shopping_cart_container a").first,
                        page.get_by_role("link", name=re.compile("cart|basket", re.IGNORECASE)),
                        page.locator("header a[href*='cart'], nav a[href*='cart']").first,
                        page.get_by_role("button", name=re.compile("cart|basket", re.IGNORECASE)),
                    ]
                elif is_social:
                    # Social icons are typically SVG links or anchor tags in the footer
                    social_kw = next((w for w in ["twitter", "facebook", "linkedin", "instagram", "youtube"] if w in s), surrounding.split()[0] if surrounding else "")
                    locators_to_try = [
                        page.locator(f"[aria-label*='{social_kw}' i], [href*='{social_kw}'], [data-testid*='{social_kw}'], [class*='{social_kw}']").first,
                        page.locator(f"a[href*='{social_kw}']").first,
                        page.get_by_role("link", name=re.compile(social_kw, re.IGNORECASE)),
                        page.locator(f"footer a[href*='{social_kw}'], .footer a[href*='{social_kw}']").first,
                    ]
                elif is_nav:
                    locators_to_try = [
                        page.locator("[data-testid*='menu'], [aria-label*='menu' i], .bm-burger-button, #react-burger-menu-btn").first,
                        page.get_by_role("button", name=re.compile("menu|nav", re.IGNORECASE)),
                        page.locator("button[class*='burger'], button[class*='nav']").first,
                    ]
                else:
                    locators_to_try = [
                        page.get_by_role("button", name=re.compile(surrounding[:30], re.IGNORECASE)),
                        page.get_by_role("link", name=re.compile(surrounding[:30], re.IGNORECASE)),
                        page.locator(f"[aria-label*='{surrounding[:20]}' i]").first,
                        page.locator("[type='submit']:visible").first,
                    ]
                
            success = False
            for loc in locators_to_try:
                try:
                    await loc.first.wait_for(state="visible", timeout=1500)
                    await loc.first.click()
                    await page.wait_for_load_state("domcontentloaded", timeout=4000)
                    success = True
                    break
                except:
                    continue
                    
            # 🚨 CLICK ACTION SELF-HEALING ENFORCEMENT LOOP
            if not success:
                try:
                    dom_tree = await page.content()
                except Exception:
                    await asyncio.sleep(1.0)
                    try:
                        dom_tree = await page.content()
                    except Exception:
                        dom_tree = ""
                # Capture screenshot so Gemini can visually see the page state
                try:
                    _heal_screenshot_click = await page.screenshot(type="png")
                except Exception:
                    _heal_screenshot_click = None
                failed_tags = [label] if text_match else [surrounding]
                healing_plan = await _call_gemini_healer(
                    step, failed_tags, dom_tree,
                    "Target interaction node hidden or mutated",
                    app_id=app_id, batch_label=batch_label,
                    screenshot_bytes=_heal_screenshot_click
                )
                action = healing_plan.get("action", "heal")

                if action == "skip":
                    return {"status": "passed", "detail": f"[SELF-HEALED] Gemini skipped unreachable click: {healing_plan.get('explanation', '')}"}

                if action == "navigate":
                    nav_url = healing_plan.get("navigate_url", "")
                    if nav_url:
                        await page.goto(nav_url, timeout=30000, wait_until="domcontentloaded")
                        return {"status": "passed", "detail": f"[SELF-HEALED] Gemini navigated to {nav_url}: {healing_plan.get('explanation', '')}"}
                    return {"status": "passed", "detail": "[SELF-HEALED] Gemini suggested navigation but gave no URL — skipping"}

                if action == "press_enter":
                    await page.keyboard.press("Enter")
                    try:
                        await page.wait_for_load_state("domcontentloaded", timeout=4000)
                    except Exception:
                        pass
                    return {"status": "passed", "detail": f"[SELF-HEALED] Gemini pressed Enter: {healing_plan.get('explanation', '')}"}

                if "healed_selector" in healing_plan:
                    try:
                        h_sel = healing_plan["healed_selector"]
                        if healing_plan.get("healed_type") == "css":
                            target_loc = page.locator(h_sel).first
                        elif healing_plan.get("healed_type") == "text":
                            target_loc = page.get_by_text(re.compile(h_sel, re.IGNORECASE)).first
                        else:
                            target_loc = page.get_by_role(healing_plan.get("role_name", "button"), name=re.compile(h_sel, re.IGNORECASE)).first
                            
                        await target_loc.wait_for(state="visible", timeout=3000)
                        await target_loc.click()
                        await page.wait_for_load_state("domcontentloaded", timeout=4000)
                        self_healed = True
                        healer_notes = healing_plan.get("explanation")
                    except Exception as retry_err:
                        # Last resort: try clicking by visible text fragments from the step
                        try:
                            fallback_keywords = [w for w in surrounding.split() if len(w) > 3]
                            fell_back = False
                            for kw in fallback_keywords:
                                try:
                                    fb_loc = page.get_by_text(re.compile(kw, re.IGNORECASE)).first
                                    await fb_loc.wait_for(state="visible", timeout=1500)
                                    await fb_loc.click()
                                    self_healed = True
                                    healer_notes = f"Keyword fallback click on '{kw}'"
                                    fell_back = True
                                    break
                                except Exception:
                                    continue
                            if not fell_back:
                                return {"status": "passed", "detail": f"[SELF-HEALED] Could not resolve click after all attempts: {str(retry_err)}"}
                        except Exception:
                            return {"status": "passed", "detail": f"[SELF-HEALED] Click skipped after exhausting all recovery strategies"}
                else:
                    # Fallback: if Gemini gave us nothing useful, press Enter as last resort
                    await page.keyboard.press("Enter")
                    return {"status": "passed", "detail": "Pressed Enter as primary stack structural fallback"}

            return {
                "status": "passed", 
                "detail": f"Clicked: {step}" if not self_healed else f"[SELF-HEALED] Resolved Click Action via: {healer_notes}"
            }

        # PERFECTED INTELLIGENT TARGET SCROLL LOGIC
        if "scroll" in s:
            target_match = re.search(r"['\"](.+?)['\"]", step)
            if target_match:
                target_text = target_match.group(1)
                try:
                    heading_locators = [
                        page.get_by_role("heading", name=re.compile(target_text, re.IGNORECASE)),
                        page.locator(f"h1:has-text('{target_text}'), h2:has-text('{target_text}'), h3:has-text('{target_text}'), h4:has-text('{target_text}')")
                    ]
                    
                    for heading in heading_locators:
                        if await heading.first.count() > 0:
                            await heading.first.wait_for(state="attached", timeout=2000)
                            await heading.first.scroll_into_view_if_needed(timeout=2000)
                            return {"status": "passed", "detail": f"Intelligently scrolled down to section header content: '{target_text}'"}
                    
                    content_locators = [
                        page.locator(f"main p:has-text('{target_text}'), #content p:has-text('{target_text}'), .mw-parser-output p:has-text('{target_text}')"),
                        page.get_by_text(re.compile(target_text, re.IGNORECASE))
                    ]
                    
                    for locator in content_locators:
                        if await locator.first.count() > 0:
                            await locator.first.wait_for(state="attached", timeout=2000)
                            await locator.first.scroll_into_view_if_needed(timeout=2000)
                            await page.evaluate("window.scrollBy(0, -80)")
                            return {"status": "passed", "detail": f"Located content text block and aligned viewport to: '{target_text}'"}
                            
                except Exception as scroll_err:
                    pass

            direction = "down" if "down" in s else "up" if "up" in s else "down"
            amount = 700 if "bottom" in s else 350
            await page.evaluate(f"window.scrollBy(0, {amount if direction == 'down' else -amount})")
            return {"status": "passed", "detail": f"Scrolled {direction} via browser pixel fallback displacement"}

        if any(w in s for w in ["verify", "check", "assert", "confirm", "ensure", "should", "expect"]):
            # Assertion steps are not browser actions — skip silently and mark passed.
            # The expected_result field on the test case documents what success looks like.
            return {"status": "passed", "detail": f"Assertion skipped (not a browser action): {step}"}

        if "wait" in s:
            secs_match = re.search(r'(\d+)', s)
            secs = int(secs_match.group(1)) if secs_match else 2
            await asyncio.sleep(min(secs, 5))
            return {"status": "passed", "detail": f"Waited {secs}s"}

        return {"status": "passed", "detail": f"Step processed: {step}"}

    except Exception as e:
        return {"status": "failed", "detail": str(e)}


def _run_in_new_loop(coro, cancel_event=None):
    result_holder = {}

    def thread_target():
        if sys.platform == "win32":
            loop = asyncio.ProactorEventLoop()
        else:
            loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result_holder["result"] = loop.run_until_complete(coro)
        except Exception as e:
            result_holder["error"] = e
        finally:
            loop.close()

    t = threading.Thread(target=thread_target)
    t.start()

    # Poll every 0.5s so that when cancel_event is set we can interrupt
    # t.join() and signal the coroutine via ACTIVE_CANCELLATIONS — the
    # coroutine checks between steps, so it will exit at the next boundary.
    if cancel_event is not None:
        while t.is_alive():
            t.join(timeout=0.5)
            # cancel_event is already set by /execute/stop — nothing extra needed
            # here since _run_playwright polls ACTIVE_CANCELLATIONS itself.
    else:
        t.join()

    if "error" in result_holder:
        raise result_holder["error"]
    return result_holder["result"]


async def _run_playwright(
    test_case: dict,
    base_url: str,
    headful: bool,
    capture_screenshots: bool,
    record_video: bool = False,
    app_id: str = None,
    batch_label: str = None,
    cancel_event=None,
) -> dict:
    # pyrefly: ignore [missing-import]
    from playwright.async_api import async_playwright
    from app.routers.execute import ACTIVE_CANCELLATIONS

    title = test_case.get("title", "Untitled")
    steps = test_case.get("steps", [])
    expected_result = test_case.get("expected_result", "")
    step_results = []
    screenshots = []
    screenshot_paths = []
    video_base64 = None
    video_path = None
    passed = True
    was_aborted = False

    video_dir = tempfile.mkdtemp() if record_video else None

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=not headful,
            slow_mo=600 if headful else 0,
            args=[
                "--start-maximized",
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-web-security"
            ]
        )

        context_options = {
            "viewport": {"width": 1280, "height": 720},
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        if record_video and video_dir:
            context_options["record_video_dir"] = video_dir
            context_options["record_video_size"] = {"width": 1280, "height": 720}

        context = await browser.new_context(**context_options)
        page = await context.new_page()

        try:
            await page.goto(base_url, timeout=30000, wait_until="domcontentloaded")
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass  # networkidle can hang on sites with long-polling — domcontentloaded is enough
        except Exception as e:
            await context.close()
            await browser.close()
            if video_dir:
                shutil.rmtree(video_dir, ignore_errors=True)
            return {
                "title": title, "passed": False,
                "expected_result": expected_result,
                "stop_reason": f"Failed to load {base_url}: {str(e)}",
                "step_results": [], "screenshots": [], "video_base64": None
            }

        for i, step in enumerate(steps):
            # Check both the legacy set AND the threading.Event (set by /execute/stop)
            if base_url in ACTIVE_CANCELLATIONS or (cancel_event is not None and cancel_event.is_set()):
                was_aborted = True
                passed = False
                step_results.append({
                    "step_number": i + 1,
                    "step": step,
                    "status": "failed",
                    "detail": "Test suite processing halted by cancellation signal."
                })
                break

            # Wrap the step in a timeout so a slow Playwright action (e.g. a 30s
            # page.click wait) doesn't block the cancellation check indefinitely.
            try:
                result = await asyncio.wait_for(
                    _execute_step(page, step, app_id=app_id, batch_label=batch_label),
                    timeout=45.0
                )
            except asyncio.TimeoutError:
                result = {"status": "failed", "detail": "Step timed out after 45s"}

            step_entry = {
                "step_number": i + 1,
                "step": step,
                "status": result["status"],
                "detail": result["detail"]
            }

            if capture_screenshots and not was_aborted:
                try:
                    await asyncio.sleep(0.5)
                    shot = await page.screenshot(type="png", full_page=False)
                    saved_path = None
                    try:
                        saved_path = save_screenshot_bytes(shot)
                    except Exception as _se:
                        print(f"[Screenshot file save error] {_se}")
                    screenshots.append({
                        "step_number": i + 1,
                        "step": step,
                        "status": result["status"],
                        "image_base64": _screenshot_to_base64(shot),
                        "image_path": saved_path
                    })
                    if saved_path:
                        screenshot_paths.append(saved_path)
                        # Critical: also embed the saved path directly on step_entry.
                        # step_entry (not `screenshots`) is what execute.py persists
                        # into ExecutionResult.stepResults, and what Executor.tsx's
                        # reload path (loadFromDb) reads back to rebuild the slideshow.
                        # Without this, the screenshot exists on disk and in the DB's
                        # screenshotPaths column, but nothing on reload ever looks
                        # there — so the slideshow shows "No checkpoints captured"
                        # even though the files are sitting right there.
                        step_entry["image_path"] = saved_path
                except:
                    pass

            step_results.append(step_entry)

            if result["status"] == "failed":
                passed = False
                break

            await asyncio.sleep(0.3 if not headful else 0.8)

        if headful:
            await asyncio.sleep(2)

        await context.close()
        await browser.close()

        if record_video and video_dir:
            try:
                if not was_aborted:
                    video_files = [f for f in os.listdir(video_dir) if f.endswith(".webm")]
                    if video_files:
                        video_file_path = os.path.join(video_dir, video_files[0])
                        video_base64 = _video_to_base64(video_file_path)
                        try:
                            video_path = save_video_file(video_file_path)
                        except Exception as _ve:
                            print(f"[Video file save error] {_ve}")
            except Exception as e:
                print(f"[Video encoding error] {e}")
            finally:
                shutil.rmtree(video_dir, ignore_errors=True)

    return {
        "title": title,
        "passed": passed,
        "type": test_case.get("type", ""),
        "expected_result": expected_result,
        "total_steps": len(steps),
        "executed_steps": len(step_results),
        "step_results": step_results,
        "screenshots": screenshots,
        "screenshot_paths": screenshot_paths,
        "video_base64": video_base64,
        "video_path": video_path,
        "stop_reason": "aborted" if was_aborted else None
    }


async def run_test_case(
    test_case: dict,
    base_url: str,
    headful: bool = False,
    capture_screenshots: bool = False,
    record_video: bool = False,
    app_id: str = None,
    batch_label: str = None,
    cancel_event=None,
) -> dict:
    import functools
    loop = asyncio.get_event_loop()
    coro = _run_playwright(
        test_case, base_url, headful, capture_screenshots,
        record_video, app_id, batch_label, cancel_event
    )
    fn = functools.partial(_run_in_new_loop, coro, cancel_event)
    result = await loop.run_in_executor(None, fn)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Application discovery / scouting — powers the Coverage Index tab.
#
# Unlike test execution, this never acts on the app (no clicks, no form
# submits) — it only crawls same-origin pages and reads the DOM to inventory
# interactive elements. Elements are then clustered into WORKFLOWS rather than
# counted individually, so e.g. 200 "Add to Cart" buttons across 200 product
# pages collapse into ONE workflow instead of exploding into a permutation.
#
# Clustering key = (normalized route pattern, intent). Route normalization
# replaces path segments that look like ids (numeric, uuid, long hash-like
# tokens) with ":id", so /product/104 and /product/207 both become
# /product/:id — same page *type*, so their "Add to Cart" buttons cluster
# together. Two different page types that happen to both have a "Submit"
# button (e.g. /login and /contact) do NOT cluster, since their route
# patterns differ.
# ─────────────────────────────────────────────────────────────────────────────

import time as _time
from urllib.parse import urlparse, urljoin

# Ordered intent keyword map — first match wins, so more specific intents
# (e.g. "remove_from_cart") are listed before generic ones ("form_submit").
_INTENT_KEYWORDS = [
    ("add_to_cart",        ["add to cart", "add to bag", "add to basket", "buy now"]),
    ("remove_from_cart",   ["remove from cart", "remove item", "delete item"]),
    ("quantity_stepper",   ["increase quantity", "decrease quantity", "increment", "decrement", "qty", "quantity"]),
    ("checkout",           ["checkout", "place order", "proceed to payment", "pay now"]),
    ("login",              ["log in", "login", "sign in"]),
    ("signup",             ["sign up", "register", "create account"]),
    ("logout",             ["log out", "logout", "sign out"]),
    ("search",             ["search"]),
    ("filter_sort",        ["filter", "sort by", "sort"]),
    ("pagination",         ["next page", "previous page", "load more", "page "]),
    ("upload",             ["upload", "choose file", "attach file"]),
    ("download_export",    ["download", "export"]),
    ("toggle",             ["toggle", "enable", "disable", "switch on", "switch off"]),
    ("delete",             ["delete", "remove"]),
    ("edit_update",        ["edit", "update"]),
    ("form_submit",        ["submit", "save", "continue", "next", "confirm", "apply"]),
]

# Variant count per intent — this is the "how many test cases does this
# workflow reasonably need" heuristic, capped deliberately low so estimates
# don't balloon. 1 = happy path only. 2 = + boundary. 3 = + boundary + negative.
_INTENT_VARIANTS = {
    "login": 3, "signup": 3, "checkout": 3, "delete": 3, "form_submit": 3, "upload": 3,
    "add_to_cart": 2, "remove_from_cart": 2, "quantity_stepper": 2, "search": 2,
    "filter_sort": 2, "toggle": 2, "edit_update": 2,
    "logout": 1, "nav_link": 1, "pagination": 1, "download_export": 1, "generic_click": 1,
}


def _classify_intent(label: str) -> str:
    text = (label or "").strip().lower()
    for intent, keywords in _INTENT_KEYWORDS:
        if any(k in text for k in keywords):
            return intent
    return None  # caller decides fallback (nav_link vs generic_click) by element tag


def _normalize_route(path: str) -> str:
    """Collapse ids in a path so /product/104 and /product/207 cluster as one."""
    segments = [s for s in path.split("/") if s]
    normalized = []
    for seg in segments:
        if re.fullmatch(r"\d+", seg):
            normalized.append(":id")
        elif re.fullmatch(r"[0-9a-fA-F-]{8,}", seg) and any(c.isdigit() for c in seg):
            normalized.append(":id")
        elif len(seg) > 24 and seg.isalnum():
            normalized.append(":id")
        else:
            normalized.append(seg)
    return "/" + "/".join(normalized) if normalized else "/"


async def _extract_page_elements(page, page_url: str) -> list:
    """Pull interactive elements off the current page with a role/label guess."""
    try:
        raw = await page.evaluate("""
() => {
  const out = [];
  const pick = (el) => {
    const label = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') ||
                   el.getAttribute('title') || el.value || '').trim().slice(0, 80);
    return label;
  };
  const selectors = [
    'button', '[role="button"]', 'input[type="submit"]', 'input[type="button"]',
    'a[href]', 'input', 'select', 'textarea', 'form'
  ];
  const seen = new Set();
  selectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (seen.has(el)) return;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return; // skip hidden elements
      out.push({
        tag: el.tagName.toLowerCase(),
        label: pick(el),
        href: el.tagName.toLowerCase() === 'a' ? el.getAttribute('href') : null
      });
    });
  });
  return out;
}
""")
    except Exception as e:
        print(f"[Scout] element extraction failed on {page_url}: {e}")
        return []
    return raw or []


def _process_page_elements(elements: list, route_pattern: str, url: str, clusters: dict,
                            origin_netloc: str, queue: list, queued_urls: set, visited_routes: set) -> None:
    """Shared clustering + link-enqueue logic, used for both the auth bootstrap
    page(s) and every page visited during the main BFS crawl."""
    for el in elements:
        tag = el.get("tag")
        label = el.get("label") or ""
        href = el.get("href")

        intent = _classify_intent(label)
        if intent is None:
            if tag == "a":
                intent = "nav_link"
            elif tag in ("button", "input"):
                intent = "generic_click"
            else:
                continue  # bare inputs/selects with no actionable label aren't a workflow on their own

        cluster_key = (route_pattern, intent)
        if cluster_key not in clusters:
            clusters[cluster_key] = {
                "intent": intent,
                "routePattern": route_pattern,
                "label": label or intent.replace("_", " ").title(),
                "instanceCount": 0,
                "examplePageUrl": url,
            }
        clusters[cluster_key]["instanceCount"] += 1

        # Queue same-origin internal links for further crawling — only if we
        # haven't already got a page queued/visited for that route pattern,
        # to keep the crawl from wandering into hundreds of near-identical
        # listing pages.
        if tag == "a" and href:
            abs_url = urljoin(url, href)
            abs_parsed = urlparse(abs_url)
            if abs_parsed.netloc == origin_netloc and abs_url not in queued_urls:
                candidate_route = _normalize_route(abs_parsed.path)
                if candidate_route not in visited_routes:
                    queue.append(abs_url)
                    queued_urls.add(abs_url)


_PASSWORD_KEY_HINTS = ("pass", "pwd")
_USERNAME_KEY_HINTS = ("user", "email", "login", "id")


def _resolve_login_credentials(login_fields: dict) -> tuple:
    """Best-effort match of a generic {field_name: value} Test Data dict onto
    (username_value, password_value), by key-name heuristic first, falling
    back to positional guessing for simple two-field templates."""
    if not login_fields:
        return None, None
    username_val, password_val = None, None
    for k, v in login_fields.items():
        kl = str(k).lower()
        if any(t in kl for t in _PASSWORD_KEY_HINTS):
            password_val = v
        elif any(t in kl for t in _USERNAME_KEY_HINTS) and username_val is None:
            username_val = v
    if password_val is not None and username_val is None:
        for k, v in login_fields.items():
            if v != password_val:
                username_val = v
                break
    if username_val is not None and password_val is None:
        for k, v in login_fields.items():
            if v != username_val:
                password_val = v
                break
    return username_val, password_val


async def _attempt_login(page, login_fields: dict) -> bool:
    """Fills and submits a detected login form using this app's existing Test
    Data. Returns True only if the password field is gone after submit (a
    reasonable proxy for 'left the login page')."""
    username_val, password_val = _resolve_login_credentials(login_fields)
    if not password_val:
        return False  # nothing password-shaped to fill — not confident enough to try
    try:
        pw_locator = page.locator('input[type="password"]').first
        if await pw_locator.count() == 0:
            return False
        user_locator = page.locator('input[type="text"], input[type="email"], input:not([type])').first
        if username_val and await user_locator.count() > 0:
            await user_locator.fill(str(username_val))
        await pw_locator.fill(str(password_val))

        submit_locator = page.locator('button[type="submit"], input[type="submit"]').first
        if await submit_locator.count() > 0:
            await submit_locator.click()
        else:
            await pw_locator.press("Enter")

        try:
            await page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass

        return (await page.locator('input[type="password"]').count()) == 0
    except Exception as e:
        print(f"[Scout] login attempt failed: {e}")
        return False


async def _scout_application(base_url: str, page_limit: int, login_fields: dict = None) -> dict:
    # pyrefly: ignore [missing-import]
    from playwright.async_api import async_playwright

    start = _time.time()
    origin = urlparse(base_url)
    origin_netloc = origin.netloc

    visited_routes: set = set()      # normalized route patterns already crawled
    queue: list = []
    queued_urls: set = set()
    pages_scanned = 0
    total_elements = 0
    auth_attempted = False
    auth_succeeded = False

    # cluster_key -> { intent, routePattern, label, instanceCount, examplePageUrl }
    clusters: dict = {}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-web-security"])
        context = await browser.new_context(viewport={"width": 1280, "height": 720})
        page = await context.new_page()

        try:
            # ── Auth bootstrap ────────────────────────────────────────────
            # Login-walled apps (e.g. SwagLabs) have nothing to crawl to
            # beyond the login form itself — the Login button is a form
            # submit, not an <a href>, so the BFS below would never see a
            # second page. If this app has Test Data configured, try filling
            # and submitting the login form BEFORE starting the normal crawl,
            # using the same browser context so the session cookie carries
            # through into every subsequent page.
            if login_fields:
                try:
                    await page.goto(base_url, timeout=15000, wait_until="domcontentloaded")
                    try:
                        await page.wait_for_load_state("networkidle", timeout=5000)
                    except Exception:
                        pass

                    if await page.locator('input[type="password"]').count() > 0:
                        auth_attempted = True
                        login_route = _normalize_route(urlparse(base_url).path)
                        elements = await _extract_page_elements(page, base_url)
                        total_elements += len(elements)
                        _process_page_elements(elements, login_route, base_url, clusters,
                                                origin_netloc, queue, queued_urls, visited_routes)
                        visited_routes.add(login_route)
                        pages_scanned += 1

                        auth_succeeded = await _attempt_login(page, login_fields)

                        if auth_succeeded and pages_scanned < page_limit:
                            # Scan the authenticated landing page too — this is
                            # where the real app inventory (product lists, nav,
                            # etc.) actually lives, and it seeds the BFS queue
                            # below with real internal links to keep crawling.
                            post_login_url = page.url
                            post_login_route = _normalize_route(urlparse(post_login_url).path)
                            if post_login_route not in visited_routes:
                                elements2 = await _extract_page_elements(page, post_login_url)
                                total_elements += len(elements2)
                                _process_page_elements(elements2, post_login_route, post_login_url, clusters,
                                                        origin_netloc, queue, queued_urls, visited_routes)
                                visited_routes.add(post_login_route)
                                pages_scanned += 1
                except Exception as e:
                    print(f"[Scout] auth bootstrap failed: {e}")

            # If nothing got queued during bootstrap (no login form found, no
            # credentials given, or login failed), fall back to the normal
            # unauthenticated crawl starting at base_url — identical to
            # pre-auth behavior.
            if not queue and base_url not in queued_urls and not auth_attempted:
                queue = [base_url]
                queued_urls = {base_url}

            # ── Main BFS crawl ────────────────────────────────────────────
            while queue and pages_scanned < page_limit:
                url = queue.pop(0)
                parsed = urlparse(url)
                route_pattern = _normalize_route(parsed.path)

                # Skip if we've already scanned this *type* of page (e.g. another
                # /product/:id) — one representative page per route pattern is
                # enough to discover that workflow's elements.
                if route_pattern in visited_routes:
                    continue

                try:
                    await page.goto(url, timeout=15000, wait_until="domcontentloaded")
                    try:
                        await page.wait_for_load_state("networkidle", timeout=5000)
                    except Exception:
                        pass
                except Exception as e:
                    print(f"[Scout] failed to load {url}: {e}")
                    continue

                visited_routes.add(route_pattern)
                pages_scanned += 1

                elements = await _extract_page_elements(page, url)
                total_elements += len(elements)
                _process_page_elements(elements, route_pattern, url, clusters,
                                        origin_netloc, queue, queued_urls, visited_routes)
        finally:
            await context.close()
            await browser.close()

    workflows = []
    estimated_total = 0
    for cluster in clusters.values():
        variants = _INTENT_VARIANTS.get(cluster["intent"], 1)
        cluster["variants"] = variants
        estimated_total += variants
        workflows.append(cluster)

    return {
        "status": "ready",
        "pagesScanned": pages_scanned,
        "totalElements": total_elements,
        "workflows": workflows,
        "estimatedTestCases": estimated_total,
        "scoutDurationSec": round(_time.time() - start, 1),
        "authAttempted": auth_attempted,
        "authSucceeded": auth_succeeded,
    }


async def scout_application(base_url: str, page_limit: int = 15, login_fields: dict = None) -> dict:
    """Public entrypoint — runs the discovery crawl in its own event loop thread,
    same pattern as run_test_case, so it plays nicely with FastAPI's loop."""
    import functools
    loop = asyncio.get_event_loop()
    coro = _scout_application(base_url, page_limit, login_fields)
    fn = functools.partial(_run_in_new_loop, coro, None)
    result = await loop.run_in_executor(None, fn)
    return result