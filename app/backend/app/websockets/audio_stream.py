"""
WebSocket endpoint for real-time audio streaming with AI voice detection.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import logging
import json
import base64
from app.services.websocket_service import websocket_service
from app.services.audio_service import audio_service

logger = logging.getLogger(__name__)

# Create WebSocket API router
audio_websocket_router = APIRouter()


@audio_websocket_router.websocket("/audio-stream", name="audio-stream")
async def audio_stream(websocket: WebSocket):
    """
    WebSocket endpoint to receive audio stream from extension for AI voice detection.
    All business logic is handled by services.
    """
    # Connect using websocket service
    await websocket_service.connect(websocket)
    
    try:
        # Send initial acknowledgment
        await websocket_service.send_message(
            websocket,
            {"status": "connected", "message": "Ready to receive audio stream"}
        )
        
        # Start audio stream
        audio_service.start_stream()
        
        # Main message loop
        while True:
            # Receive data from client
            data = await websocket.receive()
            
            # Process audio message
            response = await process_audio_message(websocket, data)
            
            # Send response if available
            if response:
                await websocket_service.send_message(websocket, response)
    
    except WebSocketDisconnect:
        logger.info("Audio stream client disconnected")
        await audio_service.stop_stream()
    except Exception as e:
        logger.error(f"Error in audio stream websocket: {str(e)}")
        await audio_service.stop_stream()
    finally:
        await websocket_service.disconnect(websocket)


async def process_audio_message(websocket: WebSocket, data: dict) -> dict | None:
    """
    Process incoming audio WebSocket message (binary or text).
    
    Args:
        websocket: WebSocket connection instance
        data: Received data dictionary
    
    Returns:
        dict: Response message or None
    """
    # Handle binary audio chunks
    if "bytes" in data:
        audio_data = data["bytes"]
        logger.debug(f"Received binary audio chunk, size: {len(audio_data)} bytes")
        
        result = await audio_service.process_audio_chunk(audio_data)
        
        # If it's an alert, send it immediately
        if result.get("status") == "alert":
            logger.warning(f"🚨 AI VOICE ALERT: {result}")
            return result
        
        # Send acknowledgment periodically
        if result["chunk_number"] % 20 == 0:
            return {
                "status": "received",
                "chunk_count": result["chunk_number"],
                "buffer_size": result.get("buffer_size", 0),
                "message": f"Processed {result['chunk_number']} audio chunks"
            }
        return None
    
    # Handle text/JSON messages
    elif "text" in data:
        try:
            message = json.loads(data["text"])
            
            # Handle base64-encoded audio chunk
            if "audio" in message:
                audio_data = base64.b64decode(message["audio"])
                logger.debug(f"Received base64 audio, size: {len(audio_data)} bytes")
                
                result = await audio_service.process_audio_chunk(audio_data)
                
                # If it's an alert, return immediately
                if result.get("status") == "alert":
                    logger.warning(f"🚨 AI VOICE ALERT: {result}")
                    return result
                
                return {
                    "status": "received",
                    "chunk_count": result["chunk_number"]
                }
            
            # Handle control messages
            elif "action" in message:
                return await handle_audio_control_message(message)
            
            else:
                logger.warning(f"Unknown audio message type: {message}")
                return {"status": "error", "message": "Unknown message type"}
                
        except json.JSONDecodeError:
            logger.warning("Received invalid JSON message")
            return {"status": "error", "message": "Invalid JSON format"}
        except Exception as e:
            logger.error(f"Error processing audio text message: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    return None


async def handle_audio_control_message(message: dict) -> dict:
    """
    Handle control messages for audio stream.
    
    Args:
        message: Control message dictionary
    
    Returns:
        dict: Response message
    """
    action = message.get("action")
    
    if action == "start":
        result = audio_service.start_stream()
        logger.info("Audio stream started via control message")
        return result
    
    elif action == "stop":
        result = await audio_service.stop_stream()
        logger.info("Audio stream stopped via control message")
        return result
    
    elif action == "stats":
        stats = audio_service.get_stats()
        logger.info(f"Audio stats requested: {stats}")
        return {"status": "stats", "data": stats}
    
    else:
        logger.warning(f"Unknown audio control action: {action}")
        return {"status": "error", "message": f"Unknown action: {action}"}
