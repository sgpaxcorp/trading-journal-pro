from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Upload(SQLModel, table=True):
    id: str = Field(primary_key=True)
    upload_type: str = Field(index=True)  # flow | chart
    filename: str
    storage_path: str
    content_type: str
    provider: Optional[str] = None
    symbol: Optional[str] = None
    metadata_json: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Analysis(SQLModel, table=True):
    id: str = Field(primary_key=True)
    symbol: str
    date: str
    flow_upload_id: str
    chart_upload_id: Optional[str] = None
    result_json: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Feedback(SQLModel, table=True):
    id: str = Field(primary_key=True)
    analysis_id: str
    correct: Optional[bool] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
