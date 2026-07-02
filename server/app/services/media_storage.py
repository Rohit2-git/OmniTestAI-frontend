"""
Media storage for execution artifacts (screenshots, videos).

Writes real files to disk under server/media/{screenshots,videos}/ and
returns relative URL paths (e.g. "/media/screenshots/abc123.png") that
main.py serves via a StaticFiles mount. The DB stores these paths, not
the raw bytes — keeping rows small and queries fast regardless of how
many screenshots/videos accumulate.
"""
import os
import base64
import uuid

# server/app/services/media_storage.py -> up two levels -> server/
_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MEDIA_ROOT = os.path.join(_PROJECT_ROOT, "media")
SCREENSHOTS_DIR = os.path.join(MEDIA_ROOT, "screenshots")
VIDEOS_DIR = os.path.join(MEDIA_ROOT, "videos")

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(VIDEOS_DIR, exist_ok=True)


def save_screenshot_bytes(image_bytes: bytes) -> str:
    """Writes a screenshot's raw bytes to disk, returns its web-relative path."""
    filename = f"{uuid.uuid4().hex}.png"
    full_path = os.path.join(SCREENSHOTS_DIR, filename)
    with open(full_path, "wb") as f:
        f.write(image_bytes)
    return f"/media/screenshots/{filename}"


def save_screenshot_base64(b64_data: str) -> str:
    """Convenience wrapper for code paths that still produce base64 first."""
    return save_screenshot_bytes(base64.b64decode(b64_data))


def save_video_file(source_path: str) -> str:
    """
    Moves an existing video file (e.g. one Playwright already wrote to a
    temp recording directory) into permanent media storage, returns its
    web-relative path. Uses copy+remove rather than os.rename to stay safe
    across different filesystems/drives.
    """
    filename = f"{uuid.uuid4().hex}.webm"
    full_path = os.path.join(VIDEOS_DIR, filename)
    with open(source_path, "rb") as src, open(full_path, "wb") as dst:
        dst.write(src.read())
    try:
        os.remove(source_path)
    except OSError:
        pass  # not fatal if the original temp file can't be cleaned up
    return f"/media/videos/{filename}"