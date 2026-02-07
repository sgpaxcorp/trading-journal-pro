import os
import uuid
from typing import Tuple
from ..core.config import settings


class LocalStorage:
    def __init__(self, base_path: str):
        self.base_path = base_path
        os.makedirs(self.base_path, exist_ok=True)

    def save(self, filename: str, data: bytes) -> Tuple[str, str]:
        ext = os.path.splitext(filename)[1].lower()
        file_id = str(uuid.uuid4())
        safe_name = f"{file_id}{ext}"
        path = os.path.join(self.base_path, safe_name)
        with open(path, "wb") as f:
            f.write(data)
        return file_id, path


class S3Storage:
    def __init__(self, bucket: str):
        self.bucket = bucket

    def save(self, filename: str, data: bytes) -> Tuple[str, str]:
        raise NotImplementedError("S3 storage not wired in MVP. Use local.")


def get_storage():
    if settings.storage_driver.lower() == "s3":
        return S3Storage(settings.s3_bucket)
    return LocalStorage(settings.local_storage_path)
