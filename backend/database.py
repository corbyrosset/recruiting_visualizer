from sqlmodel import create_engine, Session, SQLModel

DATABASE_URL = "sqlite:///recruiting.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def init_db():
    """Create all database tables."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """Dependency to get database session."""
    with Session(engine) as session:
        yield session
