from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlmodel import Session, select, or_

from .database import get_session
from .models import Candidate, CandidateUpdate, ApiResponse, utc_now
from .services import get_applicants_path

router = APIRouter()


@router.get("/candidates")
def get_candidates(session: Session = Depends(get_session)) -> ApiResponse:
    """Get all candidates (summary view)."""
    candidates = session.exec(select(Candidate).order_by(Candidate.full_name)).all()

    # Return summary data for list view
    summary = [
        {
            "id": c.id,
            "folder_name": c.folder_name,
            "full_name": c.full_name,
            "title": c.title,
            "starred": c.starred,
            "viewed": c.viewed,
            "has_notes": bool(c.notes),
        }
        for c in candidates
    ]

    return ApiResponse(
        status=True,
        message=f"Retrieved {len(summary)} candidates",
        data={"candidates": summary},
    )


@router.get("/candidates/{candidate_id}")
def get_candidate(candidate_id: int, session: Session = Depends(get_session)) -> ApiResponse:
    """Get full candidate data and mark as viewed."""
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Mark as viewed if not already
    if not candidate.viewed:
        candidate.viewed = True
        candidate.viewed_at = utc_now()
        candidate.updated_at = utc_now()
        session.add(candidate)
        session.commit()
        session.refresh(candidate)

    return ApiResponse(
        status=True,
        message="Candidate retrieved",
        data=candidate.model_dump(),
    )


@router.get("/candidates/{candidate_id}/resume")
def get_resume(candidate_id: int, session: Session = Depends(get_session)):
    """Serve the candidate's resume PDF."""
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    pdf_path = get_applicants_path() / candidate.folder_name / "cv.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Resume not found")

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"},
    )


@router.patch("/candidates/{candidate_id}")
def update_candidate(
    candidate_id: int,
    update: CandidateUpdate,
    session: Session = Depends(get_session),
) -> ApiResponse:
    """Update candidate review fields (starred, notes, viewed)."""
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    if update.starred is not None:
        candidate.starred = update.starred
    if update.notes is not None:
        candidate.notes = update.notes
    if update.viewed is not None:
        candidate.viewed = update.viewed
        if update.viewed and not candidate.viewed_at:
            candidate.viewed_at = utc_now()

    candidate.updated_at = utc_now()
    session.add(candidate)
    session.commit()
    session.refresh(candidate)

    return ApiResponse(
        status=True,
        message="Candidate updated",
        data=candidate.model_dump(),
    )


@router.get("/search")
def search_candidates(
    q: str = Query(..., min_length=1),
    session: Session = Depends(get_session),
) -> ApiResponse:
    """Search candidates by name, experience, education, or CV text (whole word match)."""
    import re

    query_pattern = f"%{q}%"

    # First, get candidates that contain the substring (fast DB query)
    candidates = session.exec(
        select(Candidate).where(
            or_(
                Candidate.full_name.ilike(query_pattern),
                Candidate.experience_text.ilike(query_pattern),
                Candidate.education_text.ilike(query_pattern),
                Candidate.title.ilike(query_pattern),
                Candidate.cv_text.ilike(query_pattern),
            )
        ).order_by(Candidate.full_name)
    ).all()

    # Then filter for whole word matches using regex
    word_pattern = re.compile(r'\b' + re.escape(q) + r'\b', re.IGNORECASE)

    def matches_whole_word(c: Candidate) -> bool:
        fields = [c.full_name, c.experience_text, c.education_text, c.title, c.cv_text]
        return any(field and word_pattern.search(field) for field in fields)

    candidates = [c for c in candidates if matches_whole_word(c)]

    # Return summary for search results
    results = [
        {
            "id": c.id,
            "folder_name": c.folder_name,
            "full_name": c.full_name,
            "title": c.title,
            "education_text": c.education_text,
            "experience_text": c.experience_text,
            "starred": c.starred,
            "viewed": c.viewed,
        }
        for c in candidates
    ]

    return ApiResponse(
        status=True,
        message=f"Found {len(results)} results for '{q}'",
        data={"candidates": results, "query": q},
    )


@router.get("/stats")
def get_stats(session: Session = Depends(get_session)) -> ApiResponse:
    """Get aggregate statistics."""
    all_candidates = session.exec(select(Candidate)).all()

    total = len(all_candidates)
    viewed = sum(1 for c in all_candidates if c.viewed)
    starred = sum(1 for c in all_candidates if c.starred)
    with_notes = sum(1 for c in all_candidates if c.notes)

    return ApiResponse(
        status=True,
        message="Stats retrieved",
        data={
            "total": total,
            "viewed": viewed,
            "unviewed": total - viewed,
            "starred": starred,
            "with_notes": with_notes,
        },
    )
