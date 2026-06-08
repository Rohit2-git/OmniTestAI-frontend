import os
import json
import base64
from google import genai        # type: ignore
from google.genai import types       # type: ignore

# Initialize client using new google-genai SDK
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


def _parse_gemini_response(raw: str) -> list:
    """Strip markdown fences and parse JSON from Gemini response."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def _build_prompt(context: str = None) -> str:
    """Build the common QA prompt with optional context section."""
    context_section = ""
    if context:
        context_section = f"""
You have also been provided a context file with specific details about this application.
Use this context to make your test cases as specific and realistic as possible.
Replace any generic placeholders (like "valid email", "correct password", "example URL")
with the real values, real user roles, real URLs, and real data found in the context below.

Context:
\"\"\"{context}\"\"\"
"""

    return f"""You are a senior QA engineer.
{context_section}
Generate comprehensive test cases covering:
- Positive test cases (happy path)
- Negative test cases (invalid inputs, wrong credentials, etc.)
- Edge cases (empty fields, boundary values, etc.)

Return ONLY a valid JSON array. No explanation, no markdown, no code fences.
Each object in the array must have exactly these fields:
- "title": short name of the test case (string)
- "steps": list of step-by-step actions (array of strings)
- "expected_result": what should happen (string)
- "type": one of "positive", "negative", or "edge_case" (string)

Example of ONE item:
{{
  "title": "Login with valid credentials",
  "steps": ["Navigate to /login", "Enter valid email", "Enter correct password", "Click Login button"],
  "expected_result": "User is redirected to the dashboard",
  "type": "positive"
}}"""


async def generate_test_cases_from_text(content: str, context: str = None) -> list:
    """
    Generates test cases from a requirements document (text).
    Optionally uses context to make test cases app-specific.
    """
    base_prompt = _build_prompt(context)
    prompt = f"""{base_prompt}

Read the following requirements document which contains user stories and acceptance criteria:
\"\"\"{content}\"\"\"
"""
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=prompt
    )
    return _parse_gemini_response(response.text)


async def generate_test_cases_from_image(
    image_bytes: bytes,
    media_type: str,
    context: str = None
) -> list:
    """
    Generates test cases from a wireframe or UI screenshot.
    Gemini visually analyzes the image and generates test cases
    based on what it sees in the UI.
    Optionally uses context to make test cases app-specific.
    """
    base_prompt = _build_prompt(context)
    prompt = f"""{base_prompt}

Analyze the attached wireframe or UI screenshot carefully.
Identify all interactive elements (buttons, forms, inputs, links, navigation, etc.)
and generate comprehensive test cases based on what you see in the UI.
"""
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=media_type)

    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=[prompt, image_part]
    )
    return _parse_gemini_response(response.text)


async def generate_test_cases_from_both(
    content: str,
    image_bytes: bytes,
    media_type: str,
    context: str = None
) -> list:
    """
    Generates test cases from both a requirements document AND a wireframe image.
    Gemini combines both sources for the most complete and accurate test cases.
    Optionally uses context to make test cases app-specific.
    """
    base_prompt = _build_prompt(context)
    prompt = f"""{base_prompt}

You have been provided both a requirements document and a wireframe/UI screenshot.
Use both sources together — the requirements for expected behavior and the wireframe
for exact UI elements, layout, and interactions.

Requirements document:
\"\"\"{content}\"\"\"

Also analyze the attached wireframe/UI screenshot carefully and combine both
to generate the most accurate and complete test cases possible.
"""
    image_part = types.Part.from_bytes(data=image_bytes, mime_type=media_type)

    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=[prompt, image_part]
    )
    return _parse_gemini_response(response.text)