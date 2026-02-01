from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel


def utc_now():
    return datetime.now(timezone.utc)


class Candidate(SQLModel, table=True):
    """Database model for a job candidate."""
    id: Optional[int] = Field(default=None, primary_key=True)
    folder_name: str = Field(unique=True, index=True)
    full_name: str
    title: Optional[str] = None
    primary_email: Optional[str] = None
    linkedin_url: Optional[str] = None
    display_urls: Optional[str] = None  # JSON array string
    experience: Optional[str] = None  # JSON array string
    education: Optional[str] = None  # JSON array string

    # Flattened text for search
    experience_text: Optional[str] = None
    education_text: Optional[str] = None
    cv_text: Optional[str] = None  # Extracted text from CV PDF

    # User review fields
    starred: bool = Field(default=False)
    notes: Optional[str] = None
    viewed: bool = Field(default=False)
    viewed_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class CandidateUpdate(BaseModel):
    """Request model for updating a candidate."""
    starred: Optional[bool] = None
    notes: Optional[str] = None
    viewed: Optional[bool] = None


class ApiResponse(BaseModel):
    """Standard API response wrapper."""
    status: bool
    message: str
    data: Optional[dict] = None
