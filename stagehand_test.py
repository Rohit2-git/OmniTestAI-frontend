"""
Full debug test — simulates exactly what web.py does during execution
so we can see where screenshots are failing.
"""
import asyncio
import os
import base64
from dotenv import load_dotenv
load_dotenv()

from stagehand import AsyncStagehand
from playwright.async_api import async_playwright


async def _get_active_page(pw_browser):
    try:
        pages = pw_browser.contexts[0].pages
        print(f"  [DEBUG] Pages in context: {len(pages)}")
        for i, p in enumerate(pages):
            print(f"  [DEBUG] Page {i}: {p.url}")
        return pages[-1] if pages else None
    except Exception as e:
        print(f"  [DEBUG] Error getting page: {e}")
        return None


async def _take_screenshot(pw_browser) -> str | None:
    try:
        page = await _get_active_page(pw_browser)
        if not page:
            print("  [DEBUG] No page found for screenshot")
            return None
        await asyncio.sleep(0.5)
        screenshot_bytes = await page.screenshot(type="png")
        b64 = "data:image/png;base64," + base64.b64encode(screenshot_bytes).decode()
        print(f"  [DEBUG] Screenshot taken — {len(b64)} chars")
        return b64
    except Exception as e:
        print(f"  [DEBUG] Screenshot error: {e}")
        return None


async def main():
    print("Starting Stagehand...")
    async with AsyncStagehand(
        server="local",
        model_api_key=os.getenv("GEMINI_API_KEY"),
        local_chrome_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    ) as client:
        session = await client.sessions.start(
            model_name="google/gemini-3-flash-preview",
            browser={"type": "local", "launchOptions": {}}
        )
        print(f"Session started: {session.id}")

        cdp_url = session.data.cdp_url if hasattr(session, 'data') else None
        print(f"CDP URL: {cdp_url}")

        pw = None
        pw_browser = None

        if cdp_url:
            try:
                pw = await async_playwright().start()
                pw_browser = await pw.chromium.connect_over_cdp(cdp_url)
                print(f"Playwright connected: {pw_browser}")
                print(f"Contexts: {len(pw_browser.contexts)}")
            except Exception as e:
                print(f"ERROR connecting Playwright: {e}")
        else:
            print("ERROR: No CDP URL available")

        # Navigate
        print("\nNavigating to google.com...")
        await session.navigate(url="https://www.google.com")
        await asyncio.sleep(1)

        print("\nTaking screenshot after navigation...")
        s = await _take_screenshot(pw_browser)
        if s:
            with open("screenshot_after_nav.png", "wb") as f:
                f.write(base64.b64decode(s.split(",")[1]))
            print("Saved: screenshot_after_nav.png")

        # Act
        print("\nActing: type hello world in search box...")
        await session.act(input="type 'hello world' in the search box")
        await asyncio.sleep(0.5)

        print("\nTaking screenshot after act...")
        s = await _take_screenshot(pw_browser)
        if s:
            with open("screenshot_after_act.png", "wb") as f:
                f.write(base64.b64decode(s.split(",")[1]))
            print("Saved: screenshot_after_act.png")

        if pw_browser:
            await pw_browser.close()
        if pw:
            await pw.stop()

asyncio.run(main())