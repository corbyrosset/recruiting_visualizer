import json

import pytest


class TestGetCandidates:
    """Tests for GET /api/candidates endpoint."""

    def test_get_candidates_empty(self, client):
        """Should return empty list when no candidates exist."""
        response = client.get("/api/candidates")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] is True
        assert data["data"]["candidates"] == []

    def test_get_candidates_with_data(self, client, multiple_candidates):
        """Should return all candidates in summary format."""
        response = client.get("/api/candidates")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] is True
        assert len(data["data"]["candidates"]) == 3

        # Check summary fields are present
        candidate = data["data"]["candidates"][0]
        assert "id" in candidate
        assert "full_name" in candidate
        assert "title" in candidate
        assert "starred" in candidate
        assert "viewed" in candidate
        assert "has_notes" in candidate

        # Full data fields should NOT be present
        assert "experience" not in candidate
        assert "education" not in candidate


class TestGetCandidate:
    """Tests for GET /api/candidates/{id} endpoint."""

    def test_get_candidate_not_found(self, client):
        """Should return 404 for non-existent candidate."""
        response = client.get("/api/candidates/999")
        assert response.status_code == 404

    def test_get_candidate_success(self, client, sample_candidate):
        """Should return full candidate data."""
        response = client.get(f"/api/candidates/{sample_candidate.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] is True
        assert data["data"]["full_name"] == "John Doe"
        assert data["data"]["title"] == "Software Engineer at Google"

        # Full data should be present
        assert "experience" in data["data"]
        assert "education" in data["data"]

    def test_get_candidate_marks_as_viewed(self, client, sample_candidate):
        """Should mark candidate as viewed when retrieved."""
        # Initially not viewed
        assert sample_candidate.viewed is False

        response = client.get(f"/api/candidates/{sample_candidate.id}")
        assert response.status_code == 200

        data = response.json()
        assert data["data"]["viewed"] is True
        assert data["data"]["viewed_at"] is not None


class TestUpdateCandidate:
    """Tests for PATCH /api/candidates/{id} endpoint."""

    def test_update_candidate_not_found(self, client):
        """Should return 404 for non-existent candidate."""
        response = client.patch("/api/candidates/999", json={"starred": True})
        assert response.status_code == 404

    def test_update_starred(self, client, sample_candidate):
        """Should update starred status."""
        response = client.patch(
            f"/api/candidates/{sample_candidate.id}",
            json={"starred": True},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["status"] is True
        assert data["data"]["starred"] is True

    def test_update_notes(self, client, sample_candidate):
        """Should update notes."""
        response = client.patch(
            f"/api/candidates/{sample_candidate.id}",
            json={"notes": "Great candidate, strong ML background"},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["data"]["notes"] == "Great candidate, strong ML background"

    def test_update_multiple_fields(self, client, sample_candidate):
        """Should update multiple fields at once."""
        response = client.patch(
            f"/api/candidates/{sample_candidate.id}",
            json={"starred": True, "notes": "Interview scheduled", "viewed": True},
        )
        assert response.status_code == 200

        data = response.json()
        assert data["data"]["starred"] is True
        assert data["data"]["notes"] == "Interview scheduled"
        assert data["data"]["viewed"] is True


class TestSearch:
    """Tests for GET /api/search endpoint."""

    def test_search_requires_query(self, client):
        """Should require query parameter."""
        response = client.get("/api/search")
        assert response.status_code == 422  # Validation error

    def test_search_by_name(self, client, multiple_candidates):
        """Should find candidates by name."""
        response = client.get("/api/search?q=Alice")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] is True
        assert len(data["data"]["candidates"]) == 1
        assert data["data"]["candidates"][0]["full_name"] == "Alice Smith"

    def test_search_by_company(self, client, multiple_candidates):
        """Should find candidates by company in experience."""
        response = client.get("/api/search?q=DeepMind")
        assert response.status_code == 200

        data = response.json()
        assert len(data["data"]["candidates"]) == 1
        assert data["data"]["candidates"][0]["full_name"] == "Alice Smith"

    def test_search_by_school(self, client, multiple_candidates):
        """Should find candidates by school in education."""
        response = client.get("/api/search?q=Stanford")
        assert response.status_code == 200

        data = response.json()
        assert len(data["data"]["candidates"]) == 1
        assert data["data"]["candidates"][0]["full_name"] == "Alice Smith"

    def test_search_case_insensitive(self, client, multiple_candidates):
        """Should be case insensitive."""
        response = client.get("/api/search?q=meta")
        assert response.status_code == 200

        data = response.json()
        assert len(data["data"]["candidates"]) == 1
        assert data["data"]["candidates"][0]["full_name"] == "Bob Jones"

    def test_search_no_results(self, client, multiple_candidates):
        """Should return empty list for no matches."""
        response = client.get("/api/search?q=nonexistent")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] is True
        assert len(data["data"]["candidates"]) == 0


class TestStats:
    """Tests for GET /api/stats endpoint."""

    def test_stats_empty(self, client):
        """Should return zero counts when no candidates."""
        response = client.get("/api/stats")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] is True
        assert data["data"]["total"] == 0
        assert data["data"]["viewed"] == 0
        assert data["data"]["starred"] == 0

    def test_stats_with_data(self, client, multiple_candidates):
        """Should return correct counts."""
        response = client.get("/api/stats")
        assert response.status_code == 200

        data = response.json()
        assert data["data"]["total"] == 3
        assert data["data"]["viewed"] == 1  # Carol is pre-viewed
        assert data["data"]["unviewed"] == 2
        assert data["data"]["starred"] == 1  # Carol is pre-starred


class TestDataLoader:
    """Tests for the data loading service."""

    def test_filter_urls(self):
        """Should filter out arxiv URLs."""
        from backend.services import filter_urls

        urls = [
            "https://github.com/test",
            "https://arxiv.org/abs/1234",
            "https://linkedin.com/in/test",
            "https://arxiv.org/pdf/5678.pdf",
        ]
        filtered = filter_urls(urls)

        assert len(filtered) == 2
        assert "https://github.com/test" in filtered
        assert "https://linkedin.com/in/test" in filtered
        assert not any("arxiv" in u for u in filtered)

    def test_flatten_experience(self):
        """Should flatten experience list into searchable text."""
        from backend.services import flatten_experience

        experience = [
            {"title": "Engineer", "work": "Google"},
            {"title": "Intern", "work": "Microsoft"},
        ]
        text = flatten_experience(experience)

        assert "Engineer Google" in text
        assert "Intern Microsoft" in text

    def test_flatten_education(self):
        """Should flatten education list into searchable text."""
        from backend.services import flatten_education

        education = [
            {"degree": "PhD", "major": "CS", "school": "MIT"},
            {"degree": "BS", "major": "Math", "school": "Stanford"},
        ]
        text = flatten_education(education)

        assert "PhD CS MIT" in text
        assert "BS Math Stanford" in text

    def test_load_candidate_from_folder(self, temp_applicants_dir):
        """Should load candidate data from folder."""
        from backend.services import load_candidate_from_folder

        folder = temp_applicants_dir / "Test-Candidate"
        candidate = load_candidate_from_folder(folder)

        assert candidate is not None
        assert candidate.folder_name == "Test-Candidate"
        assert candidate.full_name == "Test Candidate"
        assert candidate.title == "Engineer at TestCorp"
        assert candidate.primary_email == "test@example.com"

        # Check URLs were filtered (arxiv removed)
        urls = json.loads(candidate.display_urls)
        assert len(urls) == 1
        assert "github.com" in urls[0]
        assert not any("arxiv" in u for u in urls)
