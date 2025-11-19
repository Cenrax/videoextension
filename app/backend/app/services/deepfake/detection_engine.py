"""
Detection engine for orchestrating deepfake analysis with weighted scoring.
"""
import logging
from typing import List, Dict, Any, Optional
from .gemini_service import gemini_service

logger = logging.getLogger(__name__)


class DetectionEngine:
    """Orchestrates deepfake detection with weighted scoring."""
    
    # Weights for comprehensive analysis (screenshots)
    COMPREHENSIVE_WEIGHTS = {
        'facial': 0.20,
        'lighting': 0.15,
        'texture': 0.15,
        'boundaries': 0.12,
        'background': 0.10,
        'artifacts': 0.10,
        'metadata': 0.08,
        'web_verification': 0.10
    }
    
    # Weights for quick frame analysis (video streams)
    FRAME_WEIGHTS = {
        'facial': 0.35,
        'lighting': 0.25,
        'texture': 0.20,
        'boundaries': 0.20
    }
    
    async def analyze_screenshot(self, image_data: bytes) -> dict:
        """
        Comprehensive analysis for screenshot verification.
        
        Args:
            image_data: Screenshot image bytes
        
        Returns:
            dict: Complete analysis report
        """
        logger.info("Starting comprehensive screenshot analysis")
        
        try:
            # Get Gemini analysis
            gemini_result = await gemini_service.analyze_image_for_deepfake(
                image_data,
                analysis_type="comprehensive"
            )
            
            if "error" in gemini_result:
                logger.error(f"Gemini analysis error: {gemini_result['error']}")
                return {
                    "status": "error",
                    "error": gemini_result["error"],
                    "overall_verdict": "error",
                    "confidence_score": 0.0
                }
            
            # Compute weighted score
            weighted_score = self._compute_comprehensive_score(gemini_result)
            
            # Determine verdict
            verdict = self._determine_verdict(weighted_score)
            
            logger.info(f"Screenshot analysis complete: {verdict} (confidence: {weighted_score:.2f})")
            
            return {
                "status": "success",
                "overall_verdict": verdict,
                "confidence_score": weighted_score,
                "gemini_analysis": gemini_result.get("analysis_by_category", {}),
                "critical_findings": gemini_result.get("critical_findings", []),
                "recommendation": gemini_result.get("recommendation", ""),
                "raw_verdict": gemini_result.get("overall_verdict", "unknown")
            }
            
        except Exception as e:
            logger.error(f"Error in screenshot analysis: {str(e)}", exc_info=True)
            return {
                "status": "error",
                "error": str(e),
                "overall_verdict": "error",
                "confidence_score": 0.0
            }
    
    async def analyze_frame_batch(self, frames: List[bytes]) -> dict:
        """
        Batch analysis for video frames (optimized for real-time).
        
        Args:
            frames: List of frame image bytes
        
        Returns:
            dict: Aggregated analysis
        """
        if not frames:
            logger.warning("No frames provided for analysis")
            return {"status": "no_frames"}
        
        try:
            # Analyze only the last frame (most recent)
            # In production, you might analyze multiple frames and aggregate
            latest_frame = frames[-1]
            
            logger.debug(f"Analyzing batch of {len(frames)} frames (using latest)")
            
            gemini_result = await gemini_service.analyze_image_for_deepfake(
                latest_frame,
                analysis_type="quick"
            )
            
            if "error" in gemini_result:
                logger.error(f"Frame analysis error: {gemini_result['error']}")
                return {
                    "status": "error",
                    "error": gemini_result["error"]
                }
            
            return {
                "status": "success",
                "is_suspicious": gemini_result.get("is_suspicious", False),
                "confidence": gemini_result.get("confidence", 0.0),
                "findings": gemini_result.get("findings", []),
                "anomaly_types": gemini_result.get("anomaly_types", []),
                "frame_quality": gemini_result.get("frame_quality", "unknown")
            }
            
        except Exception as e:
            logger.error(f"Error in frame batch analysis: {str(e)}", exc_info=True)
            return {
                "status": "error",
                "error": str(e)
            }
    
    async def analyze_audio(self, audio_data: bytes, mime_type: str = "audio/webm") -> dict:
        """
        Analyze audio for AI-generated voice detection.
        
        Args:
            audio_data: Audio bytes
            mime_type: MIME type of audio
        
        Returns:
            dict: Analysis result
        """
        logger.info("Starting audio analysis for AI voice detection")
        
        try:
            # Get Gemini audio analysis
            gemini_result = await gemini_service.analyze_audio_for_ai_voice(
                audio_data,
                mime_type=mime_type
            )
            
            if "error" in gemini_result:
                logger.error(f"Gemini audio analysis error: {gemini_result['error']}")
                return {
                    "status": "error",
                    "error": gemini_result["error"],
                    "is_ai_generated": False,
                    "confidence": 0.0
                }
            
            logger.info(
                f"Audio analysis complete: AI={gemini_result.get('is_ai_generated', False)} "
                f"(confidence: {gemini_result.get('confidence', 0):.2f})"
            )
            
            return {
                "status": "success",
                "is_ai_generated": gemini_result.get("is_ai_generated", False),
                "is_suspicious": gemini_result.get("is_suspicious", False),
                "confidence": gemini_result.get("confidence", 0.0),
                "findings": gemini_result.get("findings", []),
                "anomaly_types": gemini_result.get("anomaly_types", []),
                "voice_quality": gemini_result.get("voice_quality", "unknown"),
                "recommendation": gemini_result.get("recommendation", "")
            }
            
        except Exception as e:
            logger.error(f"Error in audio analysis: {str(e)}", exc_info=True)
            return {
                "status": "error",
                "error": str(e),
                "is_ai_generated": False,
                "confidence": 0.0
            }
    
    def should_trigger_alert(
        self, 
        accumulated_results: List[dict],
        threshold: float = 0.7,
        min_suspicious_ratio: float = 0.3
    ) -> bool:
        """
        Decide if real-time alert should be triggered based on accumulated results.
        
        Args:
            accumulated_results: List of frame analysis results
            threshold: Confidence threshold for individual frames (0.0-1.0)
            min_suspicious_ratio: Minimum ratio of suspicious frames to trigger alert
        
        Returns:
            bool: True if alert should be triggered
        """
        if not accumulated_results:
            return False
        
        # Count suspicious frames with high confidence
        suspicious_count = sum(
            1 for r in accumulated_results
            if r.get("status") == "success" 
            and r.get("is_suspicious", False) 
            and r.get("confidence", 0) > threshold
        )
        
        suspicious_ratio = suspicious_count / len(accumulated_results)
        
        logger.debug(
            f"Alert check: {suspicious_count}/{len(accumulated_results)} "
            f"suspicious frames ({suspicious_ratio:.2%})"
        )
        
        return suspicious_ratio >= min_suspicious_ratio
    
    def should_trigger_audio_alert(
        self,
        accumulated_results: List[dict],
        threshold: float = 0.7,
        min_suspicious_ratio: float = 0.5
    ) -> bool:
        """
        Decide if audio alert should be triggered based on accumulated results.
        
        Args:
            accumulated_results: List of audio analysis results
            threshold: Confidence threshold (0.0-1.0)
            min_suspicious_ratio: Minimum ratio of AI-generated detections
        
        Returns:
            bool: True if alert should be triggered
        """
        if not accumulated_results:
            return False
        
        # Count AI-generated audio with high confidence
        ai_count = sum(
            1 for r in accumulated_results
            if r.get("status") == "success"
            and r.get("is_ai_generated", False)
            and r.get("confidence", 0) > threshold
        )
        
        ai_ratio = ai_count / len(accumulated_results)
        
        logger.debug(
            f"Audio alert check: {ai_count}/{len(accumulated_results)} "
            f"AI-generated ({ai_ratio:.2%})"
        )
        
        return ai_ratio >= min_suspicious_ratio
    
    def _compute_comprehensive_score(self, gemini_result: dict) -> float:
        """
        Compute weighted score from comprehensive analysis.
        
        Args:
            gemini_result: Gemini analysis result
        
        Returns:
            float: Weighted confidence score (0.0-1.0)
        """
        analysis = gemini_result.get("analysis_by_category", {})
        
        if not analysis:
            # Fallback to overall confidence if category breakdown not available
            return gemini_result.get("confidence_score", 0.5)
        
        total_score = 0.0
        total_weight = 0.0
        
        for category, weight in self.COMPREHENSIVE_WEIGHTS.items():
            if category in analysis:
                cat_data = analysis[category]
                if isinstance(cat_data, dict):
                    # If category is marked suspicious, use its confidence
                    if cat_data.get("suspicious", False):
                        confidence = cat_data.get("confidence", 0.5)
                        total_score += confidence * weight
                    total_weight += weight
        
        # Return weighted average, or fallback to Gemini's overall score
        if total_weight > 0:
            return total_score / total_weight
        else:
            return gemini_result.get("confidence_score", 0.5)
    
    def _determine_verdict(self, score: float) -> str:
        """
        Determine verdict from confidence score.
        
        Args:
            score: Confidence score (0.0-1.0)
        
        Returns:
            str: Verdict string
        """
        if score >= 0.8:
            return "deepfake_detected"
        elif score >= 0.5:
            return "suspicious"
        else:
            return "likely_authentic"
    
    def get_statistics(self, accumulated_results: List[dict]) -> dict:
        """
        Get statistics from accumulated analysis results.
        
        Args:
            accumulated_results: List of analysis results
        
        Returns:
            dict: Statistics summary
        """
        if not accumulated_results:
            return {
                "total_analyses": 0,
                "suspicious_count": 0,
                "average_confidence": 0.0
            }
        
        suspicious_count = sum(
            1 for r in accumulated_results
            if r.get("is_suspicious", False)
        )
        
        confidences = [
            r.get("confidence", 0.0)
            for r in accumulated_results
            if "confidence" in r
        ]
        
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        
        return {
            "total_analyses": len(accumulated_results),
            "suspicious_count": suspicious_count,
            "suspicious_ratio": suspicious_count / len(accumulated_results),
            "average_confidence": avg_confidence
        }


# Singleton instance
detection_engine = DetectionEngine()
