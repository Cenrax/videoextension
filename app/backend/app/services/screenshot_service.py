"""
Service for handling screenshot uploads.
"""
from __future__ import annotations

import base64
import binascii
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import uuid4

from config import settings

logger = logging.getLogger(__name__)


class ScreenshotService:
    """Business logic for receiving and storing screenshots."""

    def __init__(self, storage_dir: Optional[str] = None) -> None:
        storage_root = storage_dir or settings.SCREENSHOT_STORAGE_DIR or "storage/screenshots"
        storage_path = Path(storage_root)
        if not storage_path.is_absolute():
            # Resolve relative directories against the backend root
            backend_root = Path(__file__).resolve().parents[2]
            storage_path = backend_root / storage_path

        storage_path.mkdir(parents=True, exist_ok=True)
        self.storage_path = storage_path
        logger.info("Screenshot storage initialized at %s", self.storage_path)

    def save_from_data_url(
        self,
        data_url: str,
        source: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Decode a screenshot provided as a data URL and persist it locally.

        Args:
            data_url: Base64 encoded data URL (e.g. data:image/png;base64,...)
            source: Optional source identifier
            metadata: Optional metadata passed from the client

        Returns:
            dict: Information about the stored screenshot
        """
        image_bytes, extension = self._parse_data_url(data_url)
        timestamp = datetime.now(timezone.utc)
        filename = f"{timestamp.strftime('%Y%m%dT%H%M%S%f')}_{uuid4().hex}.{extension}"
        filepath = self.storage_path / filename

        with open(filepath, "wb") as fp:
            fp.write(image_bytes)

        logger.info("Stored screenshot %s (%d bytes)", filename, len(image_bytes))
        return {
            "status": "stored",
            "file_name": filename,
            "file_path": str(filepath),
            "size_bytes": len(image_bytes),
            "source": source,
            "metadata": metadata or {},
            "stored_at": timestamp.isoformat(),
        }

    @staticmethod
    def _parse_data_url(data_url: str) -> tuple[bytes, str]:
        """
        Parse a base64 data URL and return binary content plus file extension.
        """
        if "base64," not in data_url:
            raise ValueError("Screenshot payload must be a base64 data URL")

        header, encoded = data_url.split("base64,", 1)
        extension = "png"
        if "image/jpeg" in header:
            extension = "jpg"
        elif "image/webp" in header:
            extension = "webp"
        elif "image/png" not in header:
            extension = "png"

        try:
            image_bytes = base64.b64decode(encoded)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Invalid base64 data in screenshot payload") from exc

        if not image_bytes:
            raise ValueError("Empty screenshot payload")

        return image_bytes, extension


# Singleton instance
screenshot_service = ScreenshotService()


