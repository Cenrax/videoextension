"""
Screenshot REST endpoints with deepfake verification.
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
import base64
import logging
from datetime import datetime

from app.services import screenshot_service
from app.services.deepfake.detection_engine import detection_engine

logger = logging.getLogger(__name__)


class ScreenshotPayload(BaseModel):
    data_url: str = Field(..., description="Base64 data URL for the screenshot")
    source: str | None = Field(default=None, description="Source identifier e.g. tab URL")
    metadata: dict | None = Field(
        default=None, description="Additional metadata sent by the client"
    )


screenshot_router = APIRouter(tags=["screenshots"])


@screenshot_router.post(
    "/screenshots",
    summary="Upload screenshot",
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


@screenshot_router.post(
    "/screenshots/verify",
    summary="Verify screenshot for deepfakes",
    status_code=status.HTTP_200_OK,
)
async def verify_screenshot(payload: ScreenshotPayload):
    """
    Verify screenshot for deepfake detection.
    Returns comprehensive analysis report.
    """
    try:
        # Save screenshot first
        logger.info("Saving screenshot for verification")
        saved = screenshot_service.save_from_data_url(
            data_url=payload.data_url,
            source=payload.source,
            metadata=payload.metadata,
        )
        
        # Extract image bytes from data URL
        if payload.data_url.startswith("data:image"):
            # Format: data:image/png;base64,<data>
            header, encoded = payload.data_url.split(",", 1)
            image_bytes = base64.b64decode(encoded)
        else:
            raise ValueError("Invalid data URL format")
        
        # Perform deepfake analysis
        logger.info(f"Analyzing screenshot: {saved['file_name']}")
        analysis = await detection_engine.analyze_screenshot(image_bytes)
        
        logger.info(
            f"Verification complete: {analysis.get('overall_verdict', 'unknown')} "
            f"(confidence: {analysis.get('confidence_score', 0):.2f})"
        )
        
        return {
            "screenshot_info": saved,
            "deepfake_analysis": analysis,
            "analyzed_at": datetime.utcnow().isoformat(),
            "status": "success"
        }
        
    except ValueError as exc:
        logger.error(f"Validation error: {str(exc)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc)
        ) from exc
    except Exception as exc:
        logger.error(f"Verification error: {str(exc)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Verification failed: {str(exc)}"
        ) from exc
