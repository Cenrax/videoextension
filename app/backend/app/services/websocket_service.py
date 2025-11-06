"""
WebSocket service for handling video stream connections and message processing.
"""
import logging
import json
import base64
from typing import Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketService:
    """Service for managing WebSocket connections and processing messages."""
    
    def __init__(self):
        self.active_connections: set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket) -> None:
        """
        Accept and register a new WebSocket connection.
        
        Args:
            websocket: WebSocket connection instance
        """
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total connections: {len(self.active_connections)}")
    
    async def disconnect(self, websocket: WebSocket) -> None:
        """
        Remove a WebSocket connection.
        
        Args:
            websocket: WebSocket connection instance
        """
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Remaining connections: {len(self.active_connections)}")
    
    async def send_message(self, websocket: WebSocket, message: dict) -> None:
        """
        Send a JSON message to a WebSocket client.
        
        Args:
            websocket: WebSocket connection instance
            message: Dictionary to send as JSON
        """
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending message to WebSocket: {str(e)}")
            raise
    
    async def handle_binary_frame(
        self, 
        websocket: WebSocket, 
        frame_data: bytes,
        video_service
    ) -> dict:
        """
        Handle incoming binary video frame.
        
        Args:
            websocket: WebSocket connection instance
            frame_data: Binary video frame data
            video_service: VideoService instance for processing
        
        Returns:
            dict: Processing result
        """
        logger.debug(f"Received binary frame, size: {len(frame_data)} bytes")
        
        # Process the frame using video service
        result = await video_service.process_frame(frame_data)
        
        return result
    
    async def handle_text_message(
        self,
        websocket: WebSocket,
        text_data: str,
        video_service
    ) -> Optional[dict]:
        """
        Handle incoming text/JSON message.
        
        Args:
            websocket: WebSocket connection instance
            text_data: Text message content
            video_service: VideoService instance for processing
        
        Returns:
            dict: Response message or None
        """
        try:
            message = json.loads(text_data)
            
            # Handle base64-encoded video frame
            if "frame" in message:
                frame_data = base64.b64decode(message["frame"])
                logger.debug(f"Received base64 frame, size: {len(frame_data)} bytes")
                
                # Process the frame using video service
                result = await video_service.process_frame(frame_data)
                
                return {
                    "status": "received",
                    "frame_count": result["frame_number"]
                }
            
            # Handle control messages
            elif "action" in message:
                return await self._handle_control_message(websocket, message, video_service)
            
            else:
                logger.warning(f"Unknown message type: {message}")
                return {"status": "error", "message": "Unknown message type"}
                
        except json.JSONDecodeError:
            logger.warning("Received invalid JSON message")
            return {"status": "error", "message": "Invalid JSON format"}
        except Exception as e:
            logger.error(f"Error processing text message: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    async def _handle_control_message(
        self,
        websocket: WebSocket,
        message: dict,
        video_service
    ) -> dict:
        """
        Handle control messages (start, stop, ping, stats).
        
        Args:
            websocket: WebSocket connection instance
            message: Message dictionary with action
            video_service: VideoService instance
        
        Returns:
            dict: Response message
        """
        action = message["action"]
        logger.info(f"Received control message: {action}")
        
        if action == "start":
            result = video_service.start_stream()
            return {"status": "streaming_started", **result}
        elif action == "stop":
            result = video_service.stop_stream()
            return {"status": "streaming_stopped", **result}
        elif action == "ping":
            return {"status": "pong"}
        elif action == "stats":
            stats = video_service.get_stats()
            return {"status": "stats", **stats}
        else:
            return {"status": "error", "message": f"Unknown action: {action}"}
    
    async def process_message(
        self,
        websocket: WebSocket,
        data: dict,
        video_service
    ) -> Optional[dict]:
        """
        Process incoming WebSocket message (binary or text).
        
        Args:
            websocket: WebSocket connection instance
            data: Received data dictionary
            video_service: VideoService instance
        
        Returns:
            dict: Response message or None
        """
        # Handle binary frames
        if "bytes" in data:
            result = await self.handle_binary_frame(websocket, data["bytes"], video_service)
            
            # Send acknowledgment periodically
            if result["frame_number"] % 30 == 0:
                return {
                    "status": "received",
                    "frame_count": result["frame_number"],
                    "message": f"Processed {result['frame_number']} frames"
                }
            return None
        
        # Handle text/JSON messages
        elif "text" in data:
            return await self.handle_text_message(websocket, data["text"], video_service)
        
        return None
    
    def get_connection_count(self) -> int:
        """Get the number of active connections."""
        return len(self.active_connections)


# Create a singleton instance
websocket_service = WebSocketService()

