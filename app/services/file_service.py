import io
from fastapi import UploadFile, HTTPException


async def extract_text_from_file(file: UploadFile) -> str:
    """
    Reads the uploaded file and returns its text content.
    Supports: .txt, .pdf, .docx
    """
    filename = file.filename.lower()
    content = await file.read()

    # ── Plain text ──────────────────────────────────────────────
    if filename.endswith(".txt") or filename.endswith(".md"):
        return content.decode("utf-8")

    # ── PDF ─────────────────────────────────────────────────────
    elif filename.endswith(".pdf"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            if not text.strip():
                raise HTTPException(
                    status_code=400,
                    detail="PDF appears to be scanned/image-only. Please use a text-based PDF."
                )
            return text
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="pypdf not installed. Run: pip install pypdf"
            )

    # ── DOCX ────────────────────────────────────────────────────
    elif filename.endswith(".docx"):
        try:
            import docx
            doc = docx.Document(io.BytesIO(content))
            text = "\n".join([para.text for para in doc.paragraphs if para.text.strip()])
            return text
        except ImportError:
            raise HTTPException(
                status_code=500,
                detail="python-docx not installed. Run: pip install python-docx"
            )

    # ── Unsupported ──────────────────────────────────────────────
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.filename}. Please upload a .txt, .pdf, or .docx file."
        )