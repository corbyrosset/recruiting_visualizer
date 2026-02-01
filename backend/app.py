import argparse
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import init_db, get_session
from .routes import router
from .services import load_candidates_from_disk, set_applicants_path


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and load candidates on startup."""
    # Check for applicants path from environment variable
    applicants_path = os.environ.get("APPLICANTS_PATH")
    if applicants_path:
        set_applicants_path(Path(applicants_path))

    init_db()

    # Load candidates from disk
    session = next(get_session())
    try:
        load_candidates_from_disk(session)
    finally:
        session.close()

    yield


app = FastAPI(
    title="Recruiting Visualizer",
    description="API for reviewing job candidates",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")

# Serve frontend static files if dist exists
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Recruiting Visualizer Backend")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    parser.add_argument(
        "--applicants",
        type=str,
        help="Path to directory containing applicant folders",
    )

    args = parser.parse_args()

    # Set environment variable for applicants path (used by lifespan)
    if args.applicants:
        os.environ["APPLICANTS_PATH"] = args.applicants

    uvicorn.run(
        "backend.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
