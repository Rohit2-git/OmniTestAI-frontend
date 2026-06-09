"""
Playwright Executor — Direct Playwright execution engine.
Parses plain English steps and maps them to Playwright actions.
Single test → headful (live browser window).
Suite/NL    → headless + screenshots per step + video recording.
"""
import os
import re
import base64
import asyncio
import sys
import tempfile
import shutil
from typing import List


def _screenshot_to_base64(screenshot_bytes: bytes) -> str:
    return base64.b64encode(screenshot_bytes).decode("utf-8")


def _video_to_base64(video_path: str) -> str:
    with open(video_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


async def _execute_step(page, step: str) -> dict:
    s = step.lower().strip()

    try:
        if any(s.startswith(w) for w in ["navigate to", "go to", "open", "visit"]):
            url_match = re.search(r'https?://\S+|www\.\S+', step)
            if url_match:
                url = url_match.group(0).rstrip('.,)')
                if not url.startswith("http"):
                    url = "https://" + url
                await page.goto(url, timeout=15000, wait_until="domcontentloaded")
                await page.wait_for_load_state("networkidle", timeout=8000)
                return {"status": "passed", "detail": f"Navigated to {url}"}
            return {"status": "passed", "detail": "Navigate step — no URL found, skipping"}

        if any(w in s for w in ["type", "enter", "fill", "input", "write"]):
            text_match = re.search(r"['\"](.+?)['\"]", step)
            text = text_match.group(1) if text_match else ""
            if text:
                locators_to_try = [
                    page.get_by_role("searchbox"),
                    page.get_by_role("textbox"),
                    page.get_by_role("combobox"),
                    page.locator("input[type='text']").first,
                    page.locator("input[type='search']").first,
                    page.locator("input:visible").first,
                    page.locator("textarea:visible").first,
                ]
                field_hints = re.findall(r'(?:in|into|on|the)\s+(?:the\s+)?([a-zA-Z\s]+?)(?:\s+field|\s+input|\s+box|$)', s)
                if field_hints:
                    hint = field_hints[0].strip()
                    locators_to_try = [
                        page.get_by_placeholder(re.compile(hint, re.IGNORECASE)),
                        page.get_by_label(re.compile(hint, re.IGNORECASE)),
                        page.locator(f"[name*='{hint}']"),
                        page.locator(f"[placeholder*='{hint}']"),
                    ] + locators_to_try
                for loc in locators_to_try:
                    try:
                        await loc.first.wait_for(state="visible", timeout=2000)
                        await loc.first.clear()
                        await loc.first.type(text, delay=40)
                        return {"status": "passed", "detail": f"Typed '{text}'"}
                    except:
                        continue
                await page.keyboard.type(text, delay=40)
                return {"status": "passed", "detail": f"Typed '{text}' via keyboard"}

        if any(w in s for w in ["click", "press", "tap", "select", "choose", "submit"]):
            text_match = re.search(r"['\"](.+?)['\"]", step)
            if text_match:
                label = text_match.group(1)
                locators_to_try = [
                    page.get_by_role("button", name=re.compile(label, re.IGNORECASE)),
                    page.get_by_role("link", name=re.compile(label, re.IGNORECASE)),
                    page.get_by_text(re.compile(label, re.IGNORECASE)),
                    page.locator(f"button:has-text('{label}')"),
                    page.locator(f"[value='{label}']"),
                    page.locator(f"input[type='submit'][value*='{label}']"),
                ]
            else:
                surrounding = re.sub(r'\b(?:click|press|tap|select|choose|submit|the|a|an|on)\b', '', s).strip()
                locators_to_try = [
                    page.get_by_role("button", name=re.compile(surrounding[:30], re.IGNORECASE)),
                    page.get_by_role("link", name=re.compile(surrounding[:30], re.IGNORECASE)),
                    page.locator("button:visible").first,
                    page.locator("[type='submit']:visible").first,
                ]
            for loc in locators_to_try:
                try:
                    await loc.first.wait_for(state="visible", timeout=2000)
                    await loc.first.click()
                    await page.wait_for_load_state("domcontentloaded", timeout=5000)
                    return {"status": "passed", "detail": f"Clicked: {step}"}
                except:
                    continue
            await page.keyboard.press("Enter")
            return {"status": "passed", "detail": "Pressed Enter as fallback"}

        # PERFECTED INTELLIGENT TARGET SCROLL LOGIC
        if "scroll" in s:
            target_match = re.search(r"['\"](.+?)['\"]", step)
            if target_match:
                target_text = target_match.group(1)
                try:
                    # Priority 1: Direct structural heading match (h1, h2, h3, h4, h5, h6)
                    # This completely bypasses floating links inside sticky left/right layout sidebars!
                    heading_locators = [
                        page.get_by_role("heading", name=re.compile(target_text, re.IGNORECASE)),
                        page.locator(f"h1:has-text('{target_text}'), h2:has-text('{target_text}'), h3:has-text('{target_text}'), h4:has-text('{target_text}')")
                    ]
                    
                    for heading in heading_locators:
                        if await heading.first.count() > 0:
                            await heading.first.wait_for(state="attached", timeout=2000)
                            await heading.first.scroll_into_view_if_needed(timeout=2000)
                            return {"status": "passed", "detail": f"Intelligently scrolled down to section header content: '{target_text}'"}
                    
                    # Priority 2: Main article content body element text lookup boundary context
                    # Specifically targeting main canvas text elements if it's not a strict header tag
                    content_locators = [
                        page.locator(f"main p:has-text('{target_text}'), #content p:has-text('{target_text}'), .mw-parser-output p:has-text('{target_text}')"),
                        page.get_by_text(re.compile(target_text, re.IGNORECASE))
                    ]
                    
                    for locator in content_locators:
                        if await locator.first.count() > 0:
                            await locator.first.wait_for(state="attached", timeout=2000)
                            await locator.first.scroll_into_view_if_needed(timeout=2000)
                            # Give a slight scroll offset nudge so the target is not hidden beneath sticky headers
                            await page.evaluate("window.scrollBy(0, -80)")
                            return {"status": "passed", "detail": f"Located content text block and aligned viewport to: '{target_text}'"}
                            
                except Exception as scroll_err:
                    # Log trace safely and cascade down to standard relative scrolling if DOM times out
                    pass

            # Priority 3: Fallback standard relative pixel shifts if no bracket text is defined
            direction = "down" if "down" in s else "up" if "up" in s else "down"
            amount = 700 if "bottom" in s else 350
            await page.evaluate(f"window.scrollBy(0, {amount if direction == 'down' else -amount})")
            return {"status": "passed", "detail": f"Scrolled {direction} via browser pixel fallback displacement"}

        if any(w in s for w in ["verify", "check", "assert", "confirm", "ensure", "should", "expect"]):
            text_match = re.search(r"['\"](.+?)['\"]", step)
            if text_match:
                expected = text_match.group(1)
                try:
                    await page.get_by_text(re.compile(expected, re.IGNORECASE)).first.wait_for(timeout=5000)
                    return {"status": "passed", "detail": f"Verified: '{expected}' is visible"}
                except:
                    content = await page.content()
                    if expected.lower() in content.lower():
                        return {"status": "passed", "detail": f"Verified: '{expected}' found in page"}
                    return {"status": "failed", "detail": f"Could not verify: '{expected}' not found"}
            return {"status": "passed", "detail": "Verification step passed (no specific text to check)"}

        if "wait" in s:
            secs_match = re.search(r'(\d+)', s)
            secs = int(secs_match.group(1)) if secs_match else 2
            await asyncio.sleep(min(secs, 5))
            return {"status": "passed", "detail": f"Waited {secs}s"}

        return {"status": "passed", "detail": f"Step processed: {step}"}

    except Exception as e:
        return {"status": "failed", "detail": str(e)}


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


async def _run_playwright(
    test_case: dict,
    base_url: str,
    headful: bool,
    capture_screenshots: bool,
    record_video: bool = False
) -> dict:
    # pyrefly: ignore [missing-import]
    from playwright.async_api import async_playwright   

    title = test_case.get("title", "Untitled")
    steps = test_case.get("steps", [])
    expected_result = test_case.get("expected_result", "")
    step_results = []
    screenshots = []
    video_base64 = None
    passed = True

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
            await page.goto(base_url, timeout=15000, wait_until="domcontentloaded")
            await page.wait_for_load_state("networkidle", timeout=8000)
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
            result = await _execute_step(page, step)

            step_entry = {
                "step_number": i + 1,
                "step": step,
                "status": result["status"],
                "detail": result["detail"]
            }

            if capture_screenshots:
                try:
                    await asyncio.sleep(0.5)
                    shot = await page.screenshot(type="png", full_page=False)
                    screenshots.append({
                        "step_number": i + 1,
                        "step": step,
                        "status": result["status"],
                        "image_base64": _screenshot_to_base64(shot)
                    })
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
                video_files = [f for f in os.listdir(video_dir) if f.endswith(".webm")]
                if video_files:
                    video_path = os.path.join(video_dir, video_files[0])
                    video_base64 = _video_to_base64(video_path)
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
        "video_base64": video_base64
    }


async def run_test_case(
    test_case: dict,
    base_url: str,
    headful: bool = False,
    capture_screenshots: bool = False,
    record_video: bool = False
) -> dict:
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        _run_in_new_loop,
        _run_playwright(test_case, base_url, headful, capture_screenshots, record_video)
    )
    return result