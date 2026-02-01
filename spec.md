# Recruiting Visualizer - Specification Document

## Overview

A local web application for quickly reviewing and managing job applicants. The app displays candidate resumes alongside their structured information, enabling rapid screening with note-taking and starring capabilities.

## Data Source

**Applicant Data Location:**
```
C:\Users\corbyrosset\OneDrive - Microsoft\Desktop\tahub\tahub\reqs\Senior-Researcher-Foundations-of-Generative-AI-Microsoft-Research\applicants\
```

Each applicant has a folder named `{FirstName}-{LastName}` containing:
- `cv.pdf` - Resume/CV document
- `basic_info.json` - Structured profile data (name, title, experience, education)
- `personal_info.json` - Contact info and URLs (email, LinkedIn, GitHub, etc.)

**Total Applicants:** 164

---

## Core Features

### 1. Split-Screen Candidate Viewer

**Layout:**
- **Left Panel (50%):** PDF resume viewer (`cv.pdf`)
- **Right Panel (50%):** Candidate information panel

**Right Panel Contents:**
- **Header Section:**
  - Full name (`basic_info.json → data.fullName`)
  - Current title (`basic_info.json → data.title`)
  - Primary email (`personal_info.json → data.primaryEmail`)

- **Links Section:**
  - LinkedIn URL (`personal_info.json → data.linkedinUrl`)
  - GitHub and other URLs from `personal_info.json → data.displayUrls[]`
  - **Filter out:** Any `arxiv.org/*` links (visible in resume anyway)

- **Experience Section:**
  - From `basic_info.json → data.experience[]`
  - Display: Job title, company/organization (`work`), date range (`time`)

- **Education Section:**
  - From `basic_info.json → data.education[]`
  - Display: Degree, major, school, date range (`time`)

### 2. Review Tracking

**Star Feature:**
- Toggle button to star/unstar a candidate
- Starred candidates are flagged for interview consideration
- Star state persists in database

**Notes Feature:**
- Text area to add free-form notes about the candidate
- Auto-saves on blur or after typing stops
- Notes persist in database

**Viewed Status:**
- Automatically mark candidate as "viewed" when opened
- Visual indicator showing viewed vs. unviewed candidates

### 3. Navigation

**Quick Navigation:**
- "Previous" and "Next" buttons/arrows to navigate between candidates
- Keyboard shortcuts: `←` / `→` for navigation
- Current position indicator (e.g., "23 / 164")

**Candidate List:**
- Sidebar or dropdown showing all candidates
- Visual indicators for: starred, viewed, has notes
- Click to jump to any candidate

### 4. Search Functionality

**Search Capabilities:**
- Search by education (school name, degree, major)
- Search by employer/company name
- Search by candidate name

**Search Results Display:**
- List view showing matching candidates
- Each result shows:
  - Candidate name
  - Current title
  - Education summary (degree, school)
  - Previous employers (company names)
- Click result to open candidate in viewer

---

## Technical Architecture

### Project Structure

```
recruiting_visualizer/
├── backend/                          # FastAPI backend (Python)
│   ├── __init__.py
│   ├── app.py                       # FastAPI app initialization & server entry point
│   ├── routes.py                    # API endpoint handlers
│   ├── models.py                    # SQLModel database models
│   ├── database.py                  # Database configuration & session management
│   ├── services.py                  # Business logic (data loading, search)
│   └── client.py                    # Python API client (optional)
├── frontend/                         # React + Vite frontend (TypeScript)
│   ├── src/
│   │   ├── api.ts                   # TypeScript API client class
│   │   ├── App.tsx                  # Main React component
│   │   ├── main.tsx                 # React DOM render entry point
│   │   └── index.css                # Tailwind CSS imports
│   ├── index.html                   # HTML entry point
│   ├── package.json                 # Frontend dependencies
│   ├── tsconfig.json                # TypeScript configuration
│   ├── vite.config.ts               # Vite build config with dev proxy
│   ├── tailwind.config.js           # Tailwind CSS configuration
│   └── postcss.config.js            # PostCSS configuration
├── tests/                           # Backend tests
│   ├── conftest.py                  # Pytest fixtures
│   └── test_api.py                  # API endpoint tests
├── pyproject.toml                   # Backend dependencies (uv package manager)
└── spec.md                          # This file
```

---

### Backend (FastAPI + SQLModel)

**Tech Stack:**
- Python 3.10+
- FastAPI
- SQLModel (SQLAlchemy + Pydantic)
- SQLite database
- Uvicorn ASGI server

#### App Initialization (`backend/app.py`)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    load_candidates_from_disk()  # Scan applicant folders and populate DB
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")

# Serve frontend static files
app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")
```

#### Database Models (`backend/models.py`)

```python
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class Candidate(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    folder_name: str = Field(unique=True, index=True)  # e.g., "Abdo-Sharafeldin"
    full_name: str
    title: Optional[str] = None
    primary_email: Optional[str] = None
    linkedin_url: Optional[str] = None
    display_urls: Optional[str] = None      # JSON array string (filtered, no arxiv)
    experience: Optional[str] = None        # JSON array string
    education: Optional[str] = None         # JSON array string

    # Searchable text fields (flattened for FTS)
    experience_text: Optional[str] = None   # "Company1, Company2, Title1, Title2..."
    education_text: Optional[str] = None    # "School1, Degree1, Major1..."

    # User review fields
    starred: bool = Field(default=False)
    notes: Optional[str] = None
    viewed: bool = Field(default=False)
    viewed_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

#### API Routes (`backend/routes.py`)

**Request/Response Pattern:**
```python
from pydantic import BaseModel
from typing import Any, Optional

class ApiResponse(BaseModel):
    status: bool
    message: str
    data: Optional[Any] = None
```

**Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/candidates` | List all candidates (summary: id, name, title, starred, viewed) |
| GET | `/api/candidates/{id}` | Get full candidate data |
| GET | `/api/candidates/{id}/resume` | Serve PDF file from applicant folder |
| PATCH | `/api/candidates/{id}` | Update starred, notes, viewed fields |
| GET | `/api/search?q=query` | Full-text search candidates |
| GET | `/api/stats` | Get counts (total, viewed, starred, unviewed) |

**Example Route Handlers:**

```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session, select

router = APIRouter()

@router.get("/candidates")
def get_candidates(session: Session = Depends(get_session)) -> ApiResponse:
    candidates = session.exec(select(Candidate)).all()
    return ApiResponse(
        status=True,
        message="Candidates retrieved",
        data={"candidates": [c.dict() for c in candidates]}
    )

@router.get("/candidates/{candidate_id}")
def get_candidate(candidate_id: int, session: Session = Depends(get_session)) -> ApiResponse:
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Mark as viewed
    if not candidate.viewed:
        candidate.viewed = True
        candidate.viewed_at = datetime.utcnow()
        session.add(candidate)
        session.commit()
        session.refresh(candidate)

    return ApiResponse(status=True, message="Candidate retrieved", data=candidate.dict())

@router.get("/candidates/{candidate_id}/resume")
def get_resume(candidate_id: int, session: Session = Depends(get_session)):
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    pdf_path = APPLICANTS_PATH / candidate.folder_name / "cv.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Resume not found")

    return FileResponse(pdf_path, media_type="application/pdf")

@router.patch("/candidates/{candidate_id}")
def update_candidate(
    candidate_id: int,
    update: CandidateUpdate,
    session: Session = Depends(get_session)
) -> ApiResponse:
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    if update.starred is not None:
        candidate.starred = update.starred
    if update.notes is not None:
        candidate.notes = update.notes
    if update.viewed is not None:
        candidate.viewed = update.viewed
        if update.viewed:
            candidate.viewed_at = datetime.utcnow()

    candidate.updated_at = datetime.utcnow()
    session.add(candidate)
    session.commit()
    session.refresh(candidate)

    return ApiResponse(status=True, message="Candidate updated", data=candidate.dict())

@router.get("/search")
def search_candidates(q: str, session: Session = Depends(get_session)) -> ApiResponse:
    # Simple LIKE search on flattened text fields
    query = f"%{q}%"
    candidates = session.exec(
        select(Candidate).where(
            (Candidate.full_name.ilike(query)) |
            (Candidate.experience_text.ilike(query)) |
            (Candidate.education_text.ilike(query))
        )
    ).all()

    return ApiResponse(
        status=True,
        message=f"Found {len(candidates)} results",
        data={"candidates": [c.dict() for c in candidates]}
    )
```

#### Database Setup (`backend/database.py`)

```python
from sqlmodel import create_engine, Session, SQLModel

DATABASE_URL = "sqlite:///recruiting.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

def init_db():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
```

#### Data Loader (`backend/services.py`)

```python
import json
from pathlib import Path

APPLICANTS_PATH = Path(r"C:\Users\corbyrosset\OneDrive - Microsoft\Desktop\tahub\tahub\reqs\Senior-Researcher-Foundations-of-Generative-AI-Microsoft-Research\applicants")

def load_candidates_from_disk(session: Session):
    """Scan applicant folders and load into database."""
    for folder in APPLICANTS_PATH.iterdir():
        if not folder.is_dir():
            continue

        # Skip if already loaded
        existing = session.exec(
            select(Candidate).where(Candidate.folder_name == folder.name)
        ).first()
        if existing:
            continue

        basic_info = load_json(folder / "basic_info.json")
        personal_info = load_json(folder / "personal_info.json")

        # Extract and filter URLs (remove arxiv.org)
        display_urls = personal_info.get("data", {}).get("displayUrls", [])
        filtered_urls = [u for u in display_urls if "arxiv.org" not in u]

        # Flatten experience/education for search
        experience = basic_info.get("data", {}).get("experience", [])
        education = basic_info.get("data", {}).get("education", [])

        experience_text = ", ".join([
            f"{e.get('title', '')} {e.get('work', '')}" for e in experience
        ])
        education_text = ", ".join([
            f"{e.get('degree', '')} {e.get('major', '')} {e.get('school', '')}" for e in education
        ])

        candidate = Candidate(
            folder_name=folder.name,
            full_name=basic_info.get("data", {}).get("fullName", folder.name),
            title=basic_info.get("data", {}).get("title"),
            primary_email=personal_info.get("data", {}).get("primaryEmail"),
            linkedin_url=personal_info.get("data", {}).get("linkedinUrl"),
            display_urls=json.dumps(filtered_urls),
            experience=json.dumps(experience),
            education=json.dumps(education),
            experience_text=experience_text,
            education_text=education_text,
        )
        session.add(candidate)

    session.commit()
```

---

### Frontend (React + Vite + TypeScript + Tailwind)

**Tech Stack:**
- React 18
- TypeScript
- Vite (build tool)
- Tailwind CSS
- react-pdf or @react-pdf-viewer/core (PDF rendering)

#### TypeScript Types & API Client (`frontend/src/api.ts`)

```typescript
// Types
export interface Candidate {
  id: number;
  folder_name: string;
  full_name: string;
  title: string | null;
  primary_email: string | null;
  linkedin_url: string | null;
  display_urls: string | null;  // JSON string
  experience: string | null;    // JSON string
  education: string | null;     // JSON string
  starred: boolean;
  notes: string | null;
  viewed: boolean;
  viewed_at: string | null;
}

export interface Experience {
  title: string;
  work: string;
  time: [string, string];
  description?: string;
}

export interface Education {
  school: string;
  degree: string;
  major: string;
  time: [string, string];
}

export interface ApiResponse<T> {
  status: boolean;
  message: string;
  data: T | null;
}

export interface CandidateUpdate {
  starred?: boolean;
  notes?: string;
  viewed?: boolean;
}

// API Client
export class RecruitingAPI {
  private static baseUrl = '/api';

  static async getCandidates(): Promise<ApiResponse<{ candidates: Candidate[] }>> {
    const res = await fetch(`${this.baseUrl}/candidates`);
    return res.json();
  }

  static async getCandidate(id: number): Promise<ApiResponse<Candidate>> {
    const res = await fetch(`${this.baseUrl}/candidates/${id}`);
    return res.json();
  }

  static async updateCandidate(id: number, update: CandidateUpdate): Promise<ApiResponse<Candidate>> {
    const res = await fetch(`${this.baseUrl}/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    return res.json();
  }

  static async search(query: string): Promise<ApiResponse<{ candidates: Candidate[] }>> {
    const res = await fetch(`${this.baseUrl}/search?q=${encodeURIComponent(query)}`);
    return res.json();
  }

  static async getStats(): Promise<ApiResponse<{ total: number; viewed: number; starred: number }>> {
    const res = await fetch(`${this.baseUrl}/stats`);
    return res.json();
  }

  static getResumeUrl(id: number): string {
    return `${this.baseUrl}/candidates/${id}/resume`;
  }
}
```

#### Main Component (`frontend/src/App.tsx`)

```typescript
import { useState, useEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { RecruitingAPI, Candidate, Experience, Education } from './api';

function App() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentCandidate, setCurrentCandidate] = useState<Candidate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Candidate[] | null>(null);

  // Load candidates list on mount
  useEffect(() => {
    RecruitingAPI.getCandidates().then(res => {
      if (res.status && res.data) {
        setCandidates(res.data.candidates);
      }
    });
  }, []);

  // Load current candidate when index changes
  useEffect(() => {
    if (candidates.length > 0) {
      const id = candidates[currentIndex].id;
      RecruitingAPI.getCandidate(id).then(res => {
        if (res.status && res.data) {
          setCurrentCandidate(res.data);
        }
      });
    }
  }, [currentIndex, candidates]);

  // Navigation
  const goNext = () => setCurrentIndex(i => Math.min(i + 1, candidates.length - 1));
  const goPrev = () => setCurrentIndex(i => Math.max(i - 1, 0));

  // Star toggle
  const toggleStar = async () => {
    if (!currentCandidate) return;
    const res = await RecruitingAPI.updateCandidate(currentCandidate.id, {
      starred: !currentCandidate.starred
    });
    if (res.status && res.data) {
      setCurrentCandidate(res.data);
    }
  };

  // ... rest of component (notes, search, render)
}
```

#### Vite Config (`frontend/vite.config.ts`)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
```

#### Dependencies (`frontend/package.json`)

```json
{
  "name": "recruiting-visualizer-frontend",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-pdf": "^7.7.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

---

## UI Wireframe

```
┌────────────────────────────────────────────────────────────────────────┐
│  [Search: _______________]                      [◀ Prev] 23/164 [Next ▶]│
├─────────────────────────────────┬──────────────────────────────────────┤
│                                 │  ★ Star    [Viewed ✓]                │
│                                 │                                       │
│                                 │  Abdo Sharafeldin                    │
│                                 │  Pre-Doctoral Researcher, Flatiron   │
│                                 │  asharfal@u.rochester.edu            │
│                                 │                                       │
│         [PDF VIEWER]            │  🔗 LinkedIn  🔗 GitHub              │
│                                 │                                       │
│         cv.pdf                  │  ─────────────────────────────       │
│                                 │  EXPERIENCE                          │
│                                 │  • Pre-Doctoral Researcher           │
│                                 │    Flatiron Institute (2025)         │
│                                 │  • Research Scientist Intern         │
│                                 │    SRI International (2024)          │
│                                 │                                       │
│                                 │  ─────────────────────────────       │
│                                 │  EDUCATION                           │
│                                 │  • PhD Machine Learning              │
│                                 │    Georgia Tech (2021-2026)          │
│                                 │                                       │
│                                 │  ─────────────────────────────       │
│                                 │  NOTES                               │
│                                 │  ┌─────────────────────────────┐    │
│                                 │  │ Strong ML background...     │    │
│                                 │  └─────────────────────────────┘    │
└─────────────────────────────────┴──────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Backend Foundation
1. Set up FastAPI project structure with `pyproject.toml`
2. Create SQLModel database models
3. Build data loader to parse applicant JSON files
4. Implement CRUD API endpoints
5. Add PDF file serving endpoint

### Phase 2: Frontend Core
1. Set up React + Vite + TypeScript + Tailwind
2. Implement API client class
3. Build PDF viewer component
4. Build candidate info panel
5. Add navigation (prev/next)

### Phase 3: Review Features
1. Implement star toggle with persistence
2. Add notes editor with auto-save
3. Add viewed status tracking
4. Visual indicators in UI

### Phase 4: Search & Polish
1. Implement search on backend
2. Build search UI with results
3. Add keyboard shortcuts
4. Polish UI/UX

---

## Local Development

```bash
# Backend (from project root)
uv run python -m backend.app --reload    # Runs on http://localhost:8000

# Frontend (from frontend/)
npm install
npm run dev                               # Runs on http://localhost:5173 (proxies /api to 8000)

# Build frontend for production
npm run build                             # Outputs to frontend/dist/
```

---

## Configuration

**Environment Variables / Constants:**
```python
# backend/services.py
APPLICANTS_PATH = Path(r"C:\Users\corbyrosset\OneDrive - Microsoft\Desktop\tahub\tahub\reqs\Senior-Researcher-Foundations-of-Generative-AI-Microsoft-Research\applicants")

# backend/database.py
DATABASE_URL = "sqlite:///recruiting.db"
```
