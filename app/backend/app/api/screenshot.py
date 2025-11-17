"""
Screenshot REST endpoints.
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.services import screenshot_service


class ScreenshotPayload(BaseModel):
    data_url: str = Field(..., description="Base64 data URL for the screenshot")
    source: str | None = Field(default=None, description="Source identifier e.g. tab URL")
    metadata: dict | None = Field(
        default=None, description="Additional metadata sent by the client"
    )


screenshot_router = APIRouter(tags=["screenshots"])


@screenshot_router.post(
    "/screenshots",
    summary="Receive screenshot",
    status_code=status.HTTP_201_CREATED,
)
async def upload_screenshot(payload: ScreenshotPayload):
    """
    Accept a base64 data URL screenshot from the browser extension.
    """
    try:
        result = screenshot_service.save_from_data_url(
            data_url=payload.data_url,
            source=payload.source,
            metadata=payload.metadata,
        )
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
