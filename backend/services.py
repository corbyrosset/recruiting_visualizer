import json
from pathlib import Path
from typing import Optional
from sqlmodel import Session, select

try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

from .models import Candidate

# Default applicants path - can be overridden via set_applicants_path()
_applicants_path: Path = Path(r"C:\Users\corbyrosset\OneDrive - Microsoft\Desktop\tahub\tahub\reqs\Research-Software-Engineer-Multiple-Levels-AI-Frontiers\applicants")


def get_applicants_path() -> Path:
    """Get the current applicants path."""
    return _applicants_path


def set_applicants_path(path: Path) -> None:
    """Set the applicants path."""
    global _applicants_path
    _applicants_path = path
    print(f"Applicants path set to: {path}")


def load_json(path: Path) -> dict:
    """Load and parse a JSON file, returning empty dict on error."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def filter_urls(urls: list[str]) -> list[str]:
    """Filter out arxiv.org URLs from the list."""
    return [u for u in urls if "arxiv.org" not in u]


def flatten_experience(experience: list[dict]) -> str:
    """Flatten experience list into searchable text."""
    parts = []
    for exp in experience:
        title = exp.get("title", "")
        work = exp.get("work", "")
        if title or work:
            parts.append(f"{title} {work}".strip())
    return ", ".join(parts)


def flatten_education(education: list[dict]) -> str:
    """Flatten education list into searchable text."""
    parts = []
    for edu in education:
        degree = edu.get("degree", "")
        major = edu.get("major", "")
        school = edu.get("school", "")
        if degree or major or school:
            parts.append(f"{degree} {major} {school}".strip())
    return ", ".join(parts)


def extract_pdf_text(pdf_path: Path) -> Optional[str]:
    """Extract text content from a PDF file."""
    if not HAS_PYMUPDF:
        return None

    if not pdf_path.exists():
        return None

    try:
        doc = fitz.open(str(pdf_path))
        text_parts = []

        for page in doc:
            text = page.get_text()
            if text:
                text_parts.append(text)

        doc.close()

        # Join all pages and clean up whitespace
        full_text = "\n\n".join(text_parts)
        # Normalize whitespace but preserve paragraph structure
        lines = [line.strip() for line in full_text.split("\n")]
        cleaned = "\n".join(line for line in lines if line)

        return cleaned if cleaned else None
    except Exception as e:
        print(f"Warning: Failed to extract text from {pdf_path}: {e}")
        return None


def load_candidate_from_folder(folder: Path) -> Optional[Candidate]:
    """Load candidate data from a folder containing JSON files."""
    basic_info_path = folder / "basic_info.json"
    personal_info_path = folder / "personal_info.json"
    cv_path = folder / "cv.pdf"

    basic_info = load_json(basic_info_path)
    personal_info = load_json(personal_info_path)

    data = basic_info.get("data", {})
    personal_data = personal_info.get("data", {})

    # Extract fields
    full_name = data.get("fullName", folder.name.replace("-", " "))
    title = data.get("title")
    primary_email = personal_data.get("primaryEmail")
    linkedin_url = personal_data.get("linkedinUrl")

    # Filter URLs (remove arxiv.org)
    display_urls = personal_data.get("displayUrls", [])
    filtered_urls = filter_urls(display_urls)

    # Get experience and education
    experience = data.get("experience", [])
    education = data.get("education", [])

    # Flatten for search
    experience_text = flatten_experience(experience)
    education_text = flatten_education(education)

    # Extract CV text for search
    cv_text = extract_pdf_text(cv_path)

    return Candidate(
        folder_name=folder.name,
        full_name=full_name,
        title=title,
        primary_email=primary_email,
        linkedin_url=linkedin_url,
        display_urls=json.dumps(filtered_urls),
        experience=json.dumps(experience),
        education=json.dumps(education),
        experience_text=experience_text,
        education_text=education_text,
        cv_text=cv_text,
    )


def load_candidates_from_disk(session: Session, applicants_path: Optional[Path] = None):
    """Scan applicant folders and load into database."""
    path = applicants_path or get_applicants_path()

    if not path.exists():
        print(f"Warning: Applicants path does not exist: {path}")
        return

    loaded_count = 0
    skipped_count = 0

    for folder in sorted(path.iterdir()):
        if not folder.is_dir():
            continue

        # Skip if already loaded
        existing = session.exec(
            select(Candidate).where(Candidate.folder_name == folder.name)
        ).first()

        if existing:
            skipped_count += 1
            continue

        candidate = load_candidate_from_folder(folder)
        if candidate:
            session.add(candidate)
            loaded_count += 1

    session.commit()
    print(f"Loaded {loaded_count} new candidates, skipped {skipped_count} existing")
