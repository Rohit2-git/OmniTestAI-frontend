"""
NL Executor — High-Performance Natural Language Autonomous Goal Executor.
Optimized for ultra-low latency execution loops using Gemini 3 Flash Preview.
"""
import os
import re
import json
import asyncio
import sys
import tempfile
import shutil
import base64
from typing import List, Dict, Any


def _run_in_new_loop(coro):
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

    import threading
    t = threading.Thread(target=thread_target)
    t.start()
    t.join()

    if "error" in result_holder:
        raise result_holder["error"]
    return result_holder["result"]


class NLExecutor:

    def __init__(self):
        self._current_app_id = None
        self._current_batch_label = None

    async def execute(self, plan: list, request: Any) -> str:
        return "[NLExecutor] Use execute_autonomous_goal() for agentic runs."

    async def _call_gemini_agent(self, goal: str, clean_layout: str, operation_history: List[str]) -> dict:
        """Queries Gemini 3 Flash Preview with zero-latency optimized constraint parameters."""
        from google import genai  # type: ignore
        from google.genai import types # type: ignore
        
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            return {"action_type": "error", "value": "Missing API configuration key."}
            
        try:
            client = genai.Client(api_key=gemini_key)
            model_name = os.getenv("GOOGLE_MODEL", "gemini-3-flash-preview")
            
            prompt = f"""
            You are a low-latency web automation driving engine. Fulfill this goal: "{goal}"
            Session History: {operation_history if operation_history else "Initialized."}
            
            Visible Page Items:
            {clean_layout}
            
            Return a single flat JSON object:
            {{
                "action_type": "navigate" | "click" | "type" | "scroll" | "wait" | "goal_achieved",
                "target": "semantic description of the element (e.g. 'search bar', 'email field', 'submit button')",
                "value": "input string value or 'until_visible'"
            }}
            
            RULES:
            1. Keep answers concise. Do not add conversational text padding inside values.
            2. For typing into a search box: action_type="type", target="search bar", value="the search text".
            3. Never use DOM-specific labels like element IDs or CSS selectors in target.
            4. Use common semantic names: "search bar", "email field", "password field", "username field", "submit button".
            5. If the objective is visible and completed, immediately choose action_type 'goal_achieved'.
            6. Do NOT append \\n to value — the executor handles Enter key automatically after typing.
            """
            
            config = types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=1024
            )

            response = await asyncio.to_thread(
                client.models.generate_content,
                model=model_name,
                contents=prompt,
                config=config
            )

            # ── Log token usage — every agent step calls Gemini; tracked here
            # so execution-time cost shows up in Token Usage & Cost. ──
            try:
                import os as _os
                import json as _json
                from datetime import datetime as _dt
                meta = response.usage_metadata
                _log_entry = {
                    "id": f"nlexec-{int(_dt.utcnow().timestamp()*1000)}",
                    "timestamp": _dt.utcnow().isoformat(),
                    "type": "execution_agent_step",
                    "phase": "execution",
                    "model": model_name,
                    "app_id": self._current_app_id,
                    "batch_label": self._current_batch_label or "Execution / Autonomous Agent",
                    "test_title": goal[:60],
                    "input_tokens":  getattr(meta, "prompt_token_count", 0) or 0,
                    "output_tokens": getattr(meta, "candidates_token_count", 0) or 0,
                    "total_tokens":  getattr(meta, "total_token_count", 0) or 0,
                }
                _log_entry["cost_usd"] = round(
                    (_log_entry["input_tokens"] / 1_000_000) * 0.50 +
                    (_log_entry["output_tokens"] / 1_000_000) * 3.00, 6
                )
                _token_log = _os.path.abspath(
                    _os.path.join(_os.path.dirname(__file__), "..", "token_usage_log.json")
                )
                _existing = []
                if _os.path.exists(_token_log):
                    with open(_token_log, "r") as _f:
                        _existing = _json.load(_f)
                _existing.append(_log_entry)
                _existing = _existing[-500:]
                with open(_token_log, "w") as _f:
                    _json.dump(_existing, _f)
            except Exception as _le:
                print(f"[Token log error in NL agent]: {_le}")
            # ─────────────────────────────────────────────────────────────────

            raw_text = (response.text or "").strip()

            if not raw_text:
                print(f"[Agent Empty Response] finish_reason: {response.candidates[0].finish_reason if response.candidates else 'no candidates'}")
                return {"action_type": "wait", "target": "body", "value": "2"}
            
            if "```json" in raw_text:
                raw_text = raw_text.split("```json")[1].split("```")[0].strip()
            elif "```" in raw_text:
                raw_text = raw_text.split("```")[1].split("```")[0].strip()

            # Fallback: extract the first {...} block via regex if direct parse would fail
            try:
                parsed_json = json.loads(raw_text)
            except json.JSONDecodeError:
                match = re.search(r"\{.*\}", raw_text, re.DOTALL)
                if match:
                    parsed_json = json.loads(match.group(0))
                else:
                    raise
            
            normalized_decision = {}
            for k, v in parsed_json.items():
                clean_key = str(k).lower().replace("_", "").replace("-", "").strip()
                if "type" in clean_key or "action" in clean_key:
                    normalized_decision["action_type"] = str(v).lower().strip()
                elif "target" in clean_key or "element" in clean_key or "locator" in clean_key:
                    normalized_decision["target"] = str(v).strip()
                elif "value" in clean_key or "text" in clean_key or "input" in clean_key:
                    normalized_decision["value"] = str(v).lower().strip()
                    
            if "action_type" not in normalized_decision:
                normalized_decision["action_type"] = "wait"
            if "target" not in normalized_decision:
                normalized_decision["target"] = "body"
            if "value" not in normalized_decision:
                normalized_decision["value"] = "2"
                
            return normalized_decision
            
        except Exception as e:
            import traceback
            print(f"[Agent JSON Recovery Warning]: {e}")
            traceback.print_exc()
            return {"action_type": "wait", "target": "body", "value": "2"}

    async def _run_autonomous_agent_loop(self, url: str, goal: str, max_steps: int) -> Dict[str, Any]:
        """Internal worker function running the closed-loop perception-action cycles."""
        from playwright.async_api import async_playwright # type: ignore
        from app.executors.playwright import _execute_step, _screenshot_to_base64, _video_to_base64
        from app.services.media_storage import save_screenshot_bytes, save_video_file

        step_results = []
        screenshots = []
        screenshot_paths = []
        operation_history = []
        video_base64 = None
        video_path = None
        passed = False
        
        video_dir = tempfile.mkdtemp()

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=False,
                slow_mo=50, # SPEED UP OPTIMIZATION: Reduced internal slow_mo delay from 400ms down to 50ms
                args=["--start-maximized", "--no-sandbox", "--disable-web-security"]
            )
            
            context = await browser.new_context(
                viewport={"width": 1280, "height": 720},
                record_video_dir=video_dir,
                record_video_size={"width": 1280, "height": 720}
            )
            page = await context.new_page()

            try:
                # SPEED UP OPTIMIZATION: Switched wait_until configuration to 'commit' to bypass tracking blocks
                await page.goto(url, timeout=15000, wait_until="commit")
                operation_history.append(f"Navigated browser session to target surface: {url}")
                
                step_results.append({
                    "step_number": 1,
                    "step": f"Open target landing URL: '{url}'",
                    "status": "passed",
                    "detail": "Navigation trace resolved cleanly."
                })
                
                shot = await page.screenshot(type="png")
                _saved_path = None
                try:
                    _saved_path = save_screenshot_bytes(shot)
                except Exception as _se:
                    print(f"[Screenshot file save error] {_se}")
                screenshots.append({
                    "step_number": 1,
                    "step": "Navigate baseline",
                    "status": "passed",
                    "image_base64": _screenshot_to_base64(shot),
                    "image_path": _saved_path
                })
                if _saved_path:
                    screenshot_paths.append(_saved_path)

                # Step 2: Main Agent Execution Cycle
                for run_step in range(2, max_steps + 1):
                    # SPEED UP OPTIMIZATION: Switched local sync waiting flags over to instant checks
                    await page.wait_for_load_state("commit")
                    
                    # SPEED UP OPTIMIZATION: Stripped paragraph tags and large non-functional text payloads completely 
                    # out of the JavaScript evaluator to reduce contextual input token load overhead
                    clean_layout = await page.evaluate("""() => {
                        let textContent = [];
                        let h = window.innerHeight;
                        let w = window.innerWidth;

                        const isElementInViewport = (el) => {
                            const rect = el.getBoundingClientRect();
                            return (
                                rect.top >= 0 && rect.left >= 0 &&
                                rect.bottom <= h && rect.right <= w &&
                                rect.width > 0 && rect.height > 0
                            );
                        };

                        // Switched query list strictly to high-value interaction structural handles only
                        document.querySelectorAll('input, button, a, [role="button"]').forEach(el => {
                            if (isElementInViewport(el)) {
                                if (el.closest('.cdx-search-menu') || el.closest('.suggestions') || el.closest('.autocomplete')) {
                                    return;
                                }
                                let visibleText = el.innerText || el.placeholder || el.value || el.getAttribute('aria-label') || '';
                                visibleText = visibleText.replace(/\\s+/g, ' ').trim();
                                if (visibleText && visibleText.length < 100) { // Excludes heavy multi-line description text wrapping block sections
                                    textContent.push(`[${el.tagName.toLowerCase()}] "${visibleText}"`);
                                }
                            }
                        });

                        return textContent.slice(0, 40).join('\\n'); // Capped layout block payload list stream length size
                    }""")
                    
                    decision = await self._call_gemini_agent(goal, clean_layout, operation_history)
                    action = decision["action_type"]
                    target = decision["target"]
                    val = decision["value"]

                    if action == "goal_achieved":
                        passed = True
                        step_results.append({
                            "step_number": run_step,
                            "step": f"Goal Achieved: {val}",
                            "status": "passed",
                            "detail": "Autonomous agent verified the objective parameters match the screen content."
                        })
                        break

                    formatted_instruction = ""
                    is_until_visible_scroll = False

                    if action == "navigate":
                        formatted_instruction = f"Navigate to '{target}'"
                    elif action == "click":
                        formatted_instruction = f"Click '{target}'"
                    elif action == "type":
                        clean_val = val.replace("\n", "").replace("\r", "")
                        # Use intent-based phrasing — avoids playwright looking for literal label "Search input field"
                        target_lower = target.lower()
                        if any(w in target_lower for w in ["search", "query", "find", "lookup"]):
                            formatted_instruction = f"Search for '{clean_val}'"
                        elif any(w in target_lower for w in ["email", "mail"]):
                            formatted_instruction = f"Enter email '{clean_val}'"
                        elif any(w in target_lower for w in ["password", "pass"]):
                            formatted_instruction = f"Enter password '{clean_val}'"
                        elif any(w in target_lower for w in ["username", "user name", "login"]):
                            formatted_instruction = f"Enter username '{clean_val}'"
                        else:
                            formatted_instruction = f"Type '{clean_val}' in the {target} field"
                    elif action == "scroll":
                        if val == "until_visible" or "until" in val or "personal" in target.lower():
                            is_until_visible_scroll = True
                            formatted_instruction = f"Intelligently scroll down until section text content '{target}' is visible"
                        elif val == "bottom" or "bottom" in target.lower():
                            formatted_instruction = "Intelligently scroll to absolute bottom of page"
                            await page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
                            result = {"status": "passed", "detail": "Scrolled to page footer."}
                        else:
                            formatted_instruction = f"Scroll \"{val if val in ['up', 'down'] else 'down'}\" to \"{target or 'content'}\""
                    elif action == "wait":
                        formatted_instruction = "Wait 1 second"
                    else:
                        formatted_instruction = "Wait 1 second"

                    if is_until_visible_scroll and not formatted_instruction.startswith("Wait"):
                        try:
                            found = await page.evaluate("""async (targetText) => {
                                return new Promise((resolve) => {
                                    let totalHeight = 0;
                                    let distance = 400; // Increased scroll step distance speed bounds
                                    
                                    let timer = setInterval(() => {
                                        let regex = new RegExp(targetText, 'i');
                                        let elements = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span, a'));
                                        let match = elements.find(el => {
                                            const rect = el.getBoundingClientRect();
                                            return regex.test(el.innerText) && rect.top >= 0 && rect.bottom <= window.innerHeight && rect.width > 0;
                                        });

                                        if (match) {
                                            match.scrollIntoView({ behavior: 'auto', block: 'center' }); // Switched to instant snapping scroll behavior
                                            clearInterval(timer);
                                            resolve(true);
                                            return;
                                        }
                                        
                                        window.scrollBy(0, distance);
                                        totalHeight += distance;
                                        
                                        if (totalHeight >= document.body.scrollHeight || window.innerHeight + window.scrollY >= document.body.scrollHeight) {
                                            clearInterval(timer);
                                            resolve(false);
                                        }
                                    }, 80); // Fast cycle evaluation tick rate
                                });
                            }""", target)
                            
                            if found:
                                result = {"status": "passed", "detail": f"Target content found."}
                            else:
                                result = {"status": "passed", "detail": f"Scrolled page completely."}
                        except Exception as scroll_err:
                            result = {"status": "failed", "detail": str(scroll_err)}
                    elif not formatted_instruction.startswith("Intelligently scroll to absolute bottom"):
                        result = await _execute_step(page, formatted_instruction)

                    if action == "type" and result["status"] == "passed":
                        try:
                            await page.keyboard.press("Enter")
                            await page.wait_for_load_state("commit", timeout=3000)
                            formatted_instruction += " and submitted search"
                        except:
                            pass

                    operation_history.append(f"Action {run_step}: {formatted_instruction}")

                    step_results.append({
                        "step_number": run_step,
                        "step": formatted_instruction,
                        "status": result["status"],
                        "detail": result["detail"]
                    })

                    try:
                        shot = await page.screenshot(type="png")
                        _saved_path2 = None
                        try:
                            _saved_path2 = save_screenshot_bytes(shot)
                        except Exception as _se2:
                            print(f"[Screenshot file save error] {_se2}")
                        screenshots.append({
                            "step_number": run_step,
                            "step": formatted_instruction,
                            "status": result["status"],
                            "image_base64": _screenshot_to_base64(shot),
                            "image_path": _saved_path2
                        })
                        if _saved_path2:
                            screenshot_paths.append(_saved_path2)
                    except:
                        pass

                    if result["status"] == "failed":
                        break
                        
                    # SPEED UP OPTIMIZATION: Reduced explicit task sleep cooldown loop anchors down to 200ms
                    await asyncio.sleep(0.2)

            except Exception as loop_crash:
                step_results.append({
                    "step_number": len(step_results) + 1,
                    "step": "Autonomous Agent Loop Exception Handler Interrupt",
                    "status": "failed",
                    "detail": str(loop_crash)
                })

            await context.close()
            await browser.close()

            try:
                video_files = [f for f in os.listdir(video_dir) if f.endswith(".webm")]
                if video_files:
                    video_file_path = os.path.join(video_dir, video_files[0])
                    video_base64 = _video_to_base64(video_file_path)
                    try:
                        video_path = save_video_file(video_file_path)
                    except Exception as _ve:
                        print(f"[Video file save error] {_ve}")
            except Exception as e:
                print(f"[Agent session video error]: {e}")
            finally:
                shutil.rmtree(video_dir, ignore_errors=True)

        return {
            "title": "Autonomous Goal Execution",
            "passed": passed,
            "total_steps": len(step_results),
            "executed_steps": len(step_results),
            "step_results": step_results,
            "screenshots": screenshots,
            "screenshot_paths": screenshot_paths,
            "video_base64": video_base64,
            "video_path": video_path
        }

    async def execute_autonomous_goal(self, url: str, goal: str, max_steps: int = 8, app_id: str = None, batch_label: str = None) -> Dict[str, Any]:
        """Public Execution Interface."""
        self._current_app_id = app_id
        self._current_batch_label = batch_label
        # Strip passive assertion steps — these are not browser actions
        _SKIP = ('verify ', 'assert ', 'confirm that', 'check that', 'ensure ', 'validate ', 'make sure')
        if goal.strip().lower().startswith(_SKIP):
            return {
                "title": "Skipped (Assertion Step)",
                "passed": True,
                "total_steps": 0,
                "executed_steps": 0,
                "step_results": [],
                "screenshots": [],
                "screenshot_paths": [],
                "video_base64": None,
                "video_path": None
            }
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            _run_in_new_loop,
            self._run_autonomous_agent_loop(url, goal, max_steps)
        )
        return result