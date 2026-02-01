# Recruiting Visualizer

A webapp to quickly review and manage job applicants. Features a split-screen interface with PDF resume viewer on the left and candidate information on the right.

<img width="1909" height="929" alt="image" src="https://github.com/user-attachments/assets/db5de1f3-f0c3-40b8-bd23-7b17c0f243ea" />


## Features

- Split-screen PDF viewer with candidate info
- Star/unstar candidates
- Add notes (auto-saved)
- Track viewed/unviewed status
- **Full-text search** across name, title, experience, education, and CV content (PDF text extraction)
- **Filter candidates** by: All, Starred, Unviewed, With Notes
- Search results with highlighted matches (click to view, stays open until dismissed)
- Link tooltips showing destination URLs on hover
- Keyboard navigation (arrow keys, j/k, s to star)
- Statistics dashboard

## Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) package manager
- Node.js 18+

## Installation

### Backend

```bash
cd recruiting_visualizer
uv sync --all-extras
```

### Frontend

```bash
cd frontend
npm install
```

## Running the App

### Backend (with hot reload)

```bash
# With default applicants path:
uv run python -m backend.app --reload

# With custom applicants path:
uv run python -m backend.app --reload --applicants "C:\path\to\your\applicants"
```

The backend runs on `http://localhost:8000`.

### Frontend (with hot reload)

```bash
cd frontend
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend.

### Command Line Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--host` | `127.0.0.1` | Host to bind to |
| `--port` | `8000` | Port to bind to |
| `--reload` | off | Enable hot reload |
| `--applicants` | (hardcoded default) | Path to applicants directory |

## Quick Start (Two Terminals)

**Terminal 1 (Backend):**
```bash
uv run python -m backend.app --reload --applicants "C:\path\to\applicants"
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

Then open `http://localhost:5173` in your browser.

## Expected Applicants Directory Structure

```
applicants/
├── John-Doe/
│   ├── basic_info.json
│   ├── personal_info.json
│   └── cv.pdf
├── Jane-Smith/
│   ├── basic_info.json
│   ├── personal_info.json
│   └── cv.pdf
└── ...
```

## Running Tests

```bash
uv run pytest tests/ -v
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `→` or `j` | Next candidate |
| `←` or `k` | Previous candidate |
| `s` | Toggle star |

## Tech Stack

- **Backend:** FastAPI, SQLModel, SQLite, uvicorn, PyMuPDF (PDF text extraction)
- **Frontend:** React, TypeScript, Vite, Tailwind CSS

## Re-indexing Candidates

If you need to re-extract CV text (e.g., after updating the text extraction logic), delete the database and restart:

```bash
del recruiting.db   # Windows
rm recruiting.db    # Linux/Mac
uv run python -m backend.app --reload --applicants "C:\path\to\applicants"
```
