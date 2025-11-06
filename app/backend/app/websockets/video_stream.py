"""
WebSocket API endpoints for real-time notifications and messaging.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging
from app.services.websocket_service import websocket_service
from app.services.video_service import video_service

logger = logging.getLogger(__name__)

# Create WebSocket API router
websocket_router = APIRouter()


@websocket_router.websocket("/video-stream", name="video-stream")
async def video_stream(websocket: WebSocket):
    """
    WebSocket endpoint to receive video stream from extension.
    All business logic is handled by services.
    """
    # Connect using websocket service
    await websocket_service.connect(websocket)
    
    try:
        # Send initial acknowledgment
        await websocket_service.send_message(
            websocket,
            {"status": "connected", "message": "Ready to receive video stream"}
        )
        
        # Main message loop
        while True:
            # Receive data from client
            data = await websocket.receive()
            
            # Process message using websocket service
            response = await websocket_service.process_message(
                websocket,
                data,
                video_service
            )
            
            # Send response if available
            if response:
                await websocket_service.send_message(websocket, response)
    
    except WebSocketDisconnect:
        logger.info("Video stream client disconnected")
        video_service.stop_stream()
    except Exception as e:
        logger.error(f"Error in video stream websocket: {str(e)}")
        video_service.stop_stream()
    finally:
        await websocket_service.disconnect(websocket)
