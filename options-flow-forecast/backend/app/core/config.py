from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    database_url: str = Field(default="sqlite:///./storage/options_flow.db", alias="DATABASE_URL")
    storage_driver: str = Field(default="local", alias="STORAGE_DRIVER")
    local_storage_path: str = Field(default="./storage", alias="LOCAL_STORAGE_PATH")
    s3_bucket: str = Field(default="", alias="S3_BUCKET")
    s3_region: str = Field(default="", alias="S3_REGION")
    s3_access_key: str = Field(default="", alias="S3_ACCESS_KEY")
    s3_secret_key: str = Field(default="", alias="S3_SECRET_KEY")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
