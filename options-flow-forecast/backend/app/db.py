from sqlmodel import SQLModel, create_engine, Session
from .core.config import settings


def get_engine():
    return create_engine(settings.database_url, echo=False)


def init_db() -> None:
    engine = get_engine()
    SQLModel.metadata.create_all(engine)


def get_session():
    engine = get_engine()
    with Session(engine) as session:
        yield session
