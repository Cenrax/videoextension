"""
Audio processing service for handling audio stream with AI voice detection.
"""
import logging
from typing import Optional, List
from app.services.deepfake.detection_engine import detection_engine

logger = logging.getLogger(__name__)


class AudioService:
    """Service for processing audio streams with AI voice detection."""
    
    def __init__(self):
        self.chunk_count = 0
        self.is_streaming = False
        self.audio_buffer: List[bytes] = []
        self.analysis_results: List[dict] = []
        self.buffer_duration_seconds = 5  # Analyze every 5 seconds of audio
        self.total_bytes_received = 0
    
    async def process_audio_chunk(
        self, 
        audio_data: bytes, 
        chunk_number: Optional[int] = None
    ) -> dict:
        """
        Process a single audio chunk with AI voice detection.
        
        Args:
            audio_data: Binary audio chunk data
            chunk_number: Optional chunk number (if None, will auto-increment)
        
        Returns:
            dict: Processing result with potential AI voice alerts
        """
        if chunk_number is None:
            self.chunk_count += 1
            chunk_number = self.chunk_count
        
        # Buffer audio chunk
        self.audio_buffer.append(audio_data)
        self.total_bytes_received += len(audio_data)
        
        # Log chunk info periodically
        if chunk_number % 5 == 0:
            logger.info(
                f"Processing audio chunk #{chunk_number}, "
                f"size: {len(audio_data)} bytes, "
                f"total: {self.total_bytes_received} bytes, "
                f"threshold: 100000 bytes"
            )
        
        # Analyze when we have enough buffered audio
        # Reduced threshold for faster analysis (approximately 3-5 seconds of audio)
        if self.total_bytes_received >= 100000:  # ~100KB threshold
            logger.info(f"Analyzing buffered audio at chunk #{chunk_number} ({self.total_bytes_received} bytes)")
            
            try:
                # Combine buffered chunks
                combined_audio = b''.join(self.audio_buffer)
                
                # Analyze audio for AI generation
                analysis = await detection_engine.analyze_audio(combined_audio)
                
                if analysis.get("status") == "success":
                    self.analysis_results.append(analysis)
                    
                    # Keep only last 20 results to manage memory
                    if len(self.analysis_results) > 20:
                        self.analysis_results.pop(0)
                    
                    # Check if alert should be triggered
                    if detection_engine.should_trigger_audio_alert(self.analysis_results):
                        logger.warning(f"AI VOICE ALERT triggered at chunk #{chunk_number}")
                        return {
                            "status": "alert",
                            "chunk_number": chunk_number,
                            "alert_type": "ai_voice_detected",
                            "confidence": analysis.get("confidence", 0.0),
                            "findings": analysis.get("findings", []),
                            "anomaly_types": analysis.get("anomaly_types", [])
                        }
                
                # Clear buffer after analysis
                self.audio_buffer = []
                self.total_bytes_received = 0
                
            except Exception as e:
                logger.error(f"Error during audio analysis: {str(e)}")
                # Clear buffer on error to prevent memory buildup
                self.audio_buffer = []
                self.total_bytes_received = 0
        
        # Normal response
        return {
            "status": "processed",
            "chunk_number": chunk_number,
            "chunk_size": len(audio_data),
            "buffer_size": self.total_bytes_received
        }
    
    def start_stream(self) -> dict:
        """
        Initialize audio stream processing with AI voice detection.
        
        Returns:
            dict: Status information
        """
        self.chunk_count = 0
        self.is_streaming = True
        self.audio_buffer = []
        self.analysis_results = []
        self.total_bytes_received = 0
        logger.info("Audio stream started with AI voice detection enabled")
        return {
            "status": "started", 
            "message": "Audio stream processing with AI voice detection initialized"
        }
    
    async def stop_stream(self) -> dict:
        """
        Stop audio stream processing and return statistics.
        Analyzes any remaining buffered audio before stopping.
        
        Returns:
            dict: Final statistics
        """
        self.is_streaming = False
        
        # Analyze remaining buffered audio if any
        final_analysis = None
        if self.audio_buffer and self.total_bytes_received > 0:
            logger.info(f"Analyzing remaining buffered audio ({self.total_bytes_received} bytes) before stopping")
            try:
                combined_audio = b''.join(self.audio_buffer)
                analysis = await detection_engine.analyze_audio(combined_audio)
                
                if analysis.get("status") == "success":
                    self.analysis_results.append(analysis)
                    final_analysis = analysis
                    logger.info(f"Final analysis complete: AI={analysis.get('is_ai_generated', False)}")
            except Exception as e:
                logger.error(f"Error during final audio analysis: {str(e)}")
        
        total_chunks = self.chunk_count
        total_analyses = len(self.analysis_results)
        
        suspicious_count = sum(
            1 for r in self.analysis_results
            if r.get("is_suspicious", False)
        )
        
        logger.info(
            f"Audio stream stopped. Chunks: {total_chunks}, "
            f"Analyses: {total_analyses}, Suspicious: {suspicious_count}"
        )
        
        result = {
            "status": "stopped",
            "total_chunks": total_chunks,
            "total_analyses": total_analyses,
            "suspicious_chunks": suspicious_count
        }
        
        # Include final analysis if available
        if final_analysis:
            result["final_analysis"] = final_analysis
        
        return result
    
    def get_stats(self) -> dict:
        """
        Get current audio stream statistics.
        
        Returns:
            dict: Current statistics
        """
        suspicious_count = sum(
            1 for r in self.analysis_results
            if r.get("is_suspicious", False)
        )
        
        return {
            "chunk_count": self.chunk_count,
            "is_streaming": self.is_streaming,
            "analyses_performed": len(self.analysis_results),
            "suspicious_detections": suspicious_count,
            "buffer_size": self.total_bytes_received
        }


# Create a singleton instance
audio_service = AudioService()
