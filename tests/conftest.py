import json
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from backend.app import app
from backend.database import get_session
from backend.models import Candidate


@pytest.fixture(name="engine")
def engine_fixture():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture(name="session")
def session_fixture(engine):
    """Create a database session for testing."""
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(engine):
    """Create a test client with overridden database session."""

    def get_session_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="sample_candidate")
def sample_candidate_fixture(session):
    """Create a sample candidate in the database."""
    candidate = Candidate(
        folder_name="John-Doe",
        full_name="John Doe",
        title="Software Engineer at Google",
        primary_email="john@example.com",
        linkedin_url="https://linkedin.com/in/johndoe",
        display_urls=json.dumps(["https://github.com/johndoe"]),
        experience=json.dumps([
            {"title": "Software Engineer", "work": "Google", "time": ["2020-01", "2024-01"]},
            {"title": "Intern", "work": "Microsoft", "time": ["2019-06", "2019-09"]},
        ]),
        education=json.dumps([
            {"degree": "PhD", "major": "Computer Science", "school": "MIT", "time": ["2015-09", "2020-05"]},
        ]),
        experience_text="Software Engineer Google, Intern Microsoft",
        education_text="PhD Computer Science MIT",
    )
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate


@pytest.fixture(name="multiple_candidates")
def multiple_candidates_fixture(session):
    """Create multiple sample candidates in the database."""
    candidates = [
        Candidate(
            folder_name="Alice-Smith",
            full_name="Alice Smith",
            title="ML Researcher at DeepMind",
            primary_email="alice@example.com",
            experience_text="ML Researcher DeepMind",
            education_text="PhD Machine Learning Stanford",
        ),
        Candidate(
            folder_name="Bob-Jones",
            full_name="Bob Jones",
            title="Data Scientist at Meta",
            primary_email="bob@example.com",
            experience_text="Data Scientist Meta",
            education_text="MS Statistics Berkeley",
        ),
        Candidate(
            folder_name="Carol-Williams",
            full_name="Carol Williams",
            title="Research Scientist at OpenAI",
            primary_email="carol@example.com",
            experience_text="Research Scientist OpenAI",
            education_text="PhD AI MIT",
            starred=True,
            viewed=True,
        ),
    ]
    for c in candidates:
        session.add(c)
    session.commit()
    for c in candidates:
        session.refresh(c)
    return candidates


@pytest.fixture(name="temp_applicants_dir")
def temp_applicants_dir_fixture():
    """Create a temporary directory with sample applicant data."""
    with tempfile.TemporaryDirectory() as tmpdir:
        applicants_path = Path(tmpdir)

        # Create a sample applicant folder
        applicant_folder = applicants_path / "Test-Candidate"
        applicant_folder.mkdir()

        # Create basic_info.json
        basic_info = {
            "status": 200,
            "data": {
                "fullName": "Test Candidate",
                "title": "Engineer at TestCorp",
                "experience": [
                    {"title": "Engineer", "work": "TestCorp", "time": ["2022-01", "2024-01"]}
                ],
                "education": [
                    {"degree": "BS", "major": "CS", "school": "Test University", "time": ["2018-09", "2022-05"]}
                ],
            }
        }
        with open(applicant_folder / "basic_info.json", "w") as f:
            json.dump(basic_info, f)

        # Create personal_info.json
        personal_info = {
            "status": 200,
            "data": {
                "primaryEmail": "test@example.com",
                "linkedinUrl": "https://linkedin.com/in/test",
                "displayUrls": [
                    "https://github.com/test",
                    "https://arxiv.org/abs/1234",  # Should be filtered out
                ],
            }
        }
        with open(applicant_folder / "personal_info.json", "w") as f:
            json.dump(personal_info, f)

        # Create a dummy cv.pdf
        with open(applicant_folder / "cv.pdf", "wb") as f:
            f.write(b"%PDF-1.4 dummy pdf content")

        yield applicants_path
