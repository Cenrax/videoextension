"""
Video processing service for handling video stream frames with deepfake detection.
"""
import logging
from typing import Optional, List
from app.services.deepfake.detection_engine import detection_engine

logger = logging.getLogger(__name__)


class VideoService:
    """Service for processing video stream frames with deepfake detection."""
    
    def __init__(self):
        self.frame_count = 0
        self.is_streaming = False
        self.frame_buffer: List[bytes] = []
        self.analysis_results: List[dict] = []
        self.analyze_every_n_frames = 10  # Analyze every 10th frame to optimize API calls
    
    async def process_frame(self, frame_data: bytes, frame_number: Optional[int] = None) -> dict:
        """
        Process a single video frame with deepfake detection.
        
        Args:
            frame_data: Binary video frame data
            frame_number: Optional frame number (if None, will auto-increment)
        
        Returns:
            dict: Processing result with potential deepfake alerts
        """
        if frame_number is None:
            self.frame_count += 1
            frame_number = self.frame_count
        
        # Buffer frame for analysis
        self.frame_buffer.append(frame_data)
        
        # Keep only last 30 frames in buffer to manage memory
        if len(self.frame_buffer) > 30:
            self.frame_buffer.pop(0)
        
        # Log frame info periodically
        if frame_number % 100 == 0:
            logger.info(f"Processing frame #{frame_number}, size: {len(frame_data)} bytes")
        
        # Analyze every Nth frame to optimize API calls
        if frame_number % self.analyze_every_n_frames == 0:
            logger.info(f"Analyzing frame #{frame_number} for deepfakes")
            
            try:
                # Analyze recent frames
                analysis = await detection_engine.analyze_frame_batch(
                    self.frame_buffer[-10:]  # Last 10 frames
                )
                
                if analysis.get("status") == "success":
                    self.analysis_results.append(analysis)
                    
                    # Keep only last 50 results to manage memory
                    if len(self.analysis_results) > 50:
                        self.analysis_results.pop(0)
                    
                    # Check if alert should be triggered
                    if detection_engine.should_trigger_alert(self.analysis_results):
                        logger.warning(f"DEEPFAKE ALERT triggered at frame #{frame_number}")
                        return {
                            "status": "alert",
                            "frame_number": frame_number,
                            "alert_type": "deepfake_detected",
                            "confidence": analysis.get("confidence", 0.0),
                            "findings": analysis.get("findings", []),
                            "anomaly_types": analysis.get("anomaly_types", [])
                        }
            except Exception as e:
                logger.error(f"Error during frame analysis: {str(e)}")
        
        # Normal response
        return {
            "status": "processed",
            "frame_number": frame_number,
            "frame_size": len(frame_data)
        }
    
    def start_stream(self) -> dict:
        """
        Initialize stream processing with deepfake detection.
        
        Returns:
            dict: Status information
        """
        self.frame_count = 0
        self.is_streaming = True
        self.frame_buffer = []
        self.analysis_results = []
        logger.info("Video stream started with deepfake detection enabled")
        return {"status": "started", "message": "Stream processing with deepfake detection initialized"}
    
    def stop_stream(self) -> dict:
        """
        Stop stream processing and return statistics including deepfake analysis.
        
        Returns:
            dict: Final statistics
        """
        self.is_streaming = False
        total_frames = self.frame_count
        total_analyses = len(self.analysis_results)
        
        suspicious_count = sum(
            1 for r in self.analysis_results
            if r.get("is_suspicious", False)
        )
        
        logger.info(
            f"Video stream stopped. Frames: {total_frames}, "
            f"Analyses: {total_analyses}, Suspicious: {suspicious_count}"
        )
        
        return {
            "status": "stopped",
            "total_frames": total_frames,
            "total_analyses": total_analyses,
            "suspicious_frames": suspicious_count
        }
    
    def get_stats(self) -> dict:
        """
        Get current stream statistics including deepfake analysis.
        
        Returns:
            dict: Current statistics
        """
        suspicious_count = sum(
            1 for r in self.analysis_results
            if r.get("is_suspicious", False)
        )
        
        return {
            "frame_count": self.frame_count,
            "is_streaming": self.is_streaming,
            "analyses_performed": len(self.analysis_results),
            "suspicious_detections": suspicious_count
        }


# Create a singleton instance
video_service = VideoService()

