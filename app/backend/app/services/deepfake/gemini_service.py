"""
Gemini API service using the new unified Google GenAI SDK.
"""
import sys
import os

# Fix namespace package issue
import google
if not hasattr(google, '__path__'):
    import pkgutil
    google.__path__ = pkgutil.extend_path(google.__path__, google.__name__)

from google import genai
from google.genai import types
import hashlib
import logging
import json
from typing import Optional, Dict, Any
import io

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)


class GeminiService:
    """Service for interacting with Gemini API for deepfake detection."""
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Gemini client.
        
        Args:
            api_key: Gemini API key (defaults to GEMINI_API_KEY env var)
        """
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY not found in environment")
        
        # Initialize client with API key
        self.client = genai.Client(api_key=self.api_key)
        self.cache: Dict[str, Any] = {}
        logger.info("Gemini service initialized successfully")
        
    async def analyze_image_for_deepfake(
        self, 
        image_data: bytes,
        analysis_type: str = "comprehensive"
    ) -> dict:
        """
        Analyze image for deepfake indicators using Gemini 2.5 Flash.
        
        Args:
            image_data: Image bytes (JPEG/PNG)
            analysis_type: "comprehensive" or "quick"
        
        Returns:
            dict: Analysis results with confidence scores
        """
        # Generate cache key
        image_hash = hashlib.md5(image_data).hexdigest()
        cache_key = f"{image_hash}_{analysis_type}"
        
        # Check cache
        if cache_key in self.cache:
            logger.info(f"Cache hit for {cache_key}")
            return self.cache[cache_key]
        
        # Select prompt based on analysis type
        prompt = (self._get_comprehensive_prompt() 
                  if analysis_type == "comprehensive" 
                  else self._get_quick_prompt())
        
        try:
            logger.info(f"Analyzing image with Gemini ({analysis_type} mode)")
            
            # Generate content with inline image data
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(
                        data=image_data,
                        mime_type="image/jpeg"
                    ),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    temperature=0.1,  # Low temperature for deterministic results
                    response_mime_type="application/json"  # Request JSON response
                )
            )
            
            # Parse JSON response
            result = self._parse_response(response)
            
            # Cache result
            self.cache[cache_key] = result
            logger.info(f"Analysis complete: {result.get('overall_verdict', 'N/A')}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error analyzing image with Gemini: {str(e)}", exc_info=True)
            return {
                "error": str(e),
                "is_suspicious": False,
                "confidence": 0.0,
                "overall_verdict": "error"
            }
    
    async def analyze_video_frame(
        self,
        frame_data: bytes,
        frame_number: int
    ) -> dict:
        """
        Quick analysis for video frames (optimized for real-time).
        
        Args:
            frame_data: Frame image bytes
            frame_number: Frame sequence number
        
        Returns:
            dict: Quick analysis results
        """
        logger.debug(f"Analyzing video frame #{frame_number}")
        return await self.analyze_image_for_deepfake(
            frame_data,
            analysis_type="quick"
        )
    
    async def analyze_audio_for_ai_voice(
        self,
        audio_data: bytes,
        mime_type: str = "audio/webm"
    ) -> dict:
        """
        Analyze audio for AI-generated voice detection using Gemini 2.5 Flash.
        
        Args:
            audio_data: Audio bytes (WebM, MP3, WAV, etc.)
            mime_type: MIME type of the audio data
        
        Returns:
            dict: Analysis results with confidence scores
        """
        # Generate cache key
        audio_hash = hashlib.md5(audio_data).hexdigest()
        cache_key = f"audio_{audio_hash}"
        
        # Check cache
        if cache_key in self.cache:
            logger.info(f"Cache hit for audio {cache_key}")
            return self.cache[cache_key]
        
        prompt = self._get_audio_analysis_prompt()
        
        try:
            logger.info(f"Analyzing audio with Gemini (size: {len(audio_data)} bytes)")
            
            # Generate content with audio data
            response = self.client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    prompt,
                    types.Part.from_bytes(
                        data=audio_data,
                        mime_type=mime_type
                    )
                ],
                config=types.GenerateContentConfig(
                    temperature=0.1,  # Low temperature for deterministic results
                    response_mime_type="application/json"  # Request JSON response
                )
            )
            
            # Parse JSON response
            result = self._parse_response(response)
            
            # Cache result
            self.cache[cache_key] = result
            logger.info(f"Audio analysis complete: {result.get('is_ai_generated', 'N/A')}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error analyzing audio with Gemini: {str(e)}", exc_info=True)
            return {
                "error": str(e),
                "is_suspicious": False,
                "confidence": 0.0,
                "is_ai_generated": False
            }
    
    def _get_comprehensive_prompt(self) -> str:
        """Get comprehensive analysis prompt for screenshots."""
        return """
Perform comprehensive deepfake detection on this image.

Analyze these aspects:

1. **Facial Features**:
   - Eye reflections (should match lighting direction)
   - Skin texture (natural pores vs AI smoothing)
   - Teeth/gums (AI often struggles with dental details)
   - Facial hair consistency
   - Facial symmetry and proportions

2. **Lighting & Shadows**:
   - Shadow direction consistency
   - Light source coherence
   - Natural light falloff
   - Face vs background lighting harmony

3. **Boundaries & Edges**:
   - Face-to-hair transition smoothness
   - Neck-to-collar blending
   - Ear-to-hair boundaries
   - Unnatural edge artifacts

4. **Texture Analysis**:
   - Skin texture consistency
   - Artificial smoothing detection
   - Resolution consistency across areas

5. **Background**:
   - Perspective consistency
   - Depth-of-field naturalness
   - Background-subject lighting harmony

6. **Artifacts**:
   - Compression anomalies
   - GAN-specific patterns
   - Unnatural color gradients
   - Frequency domain irregularities

Return JSON in this exact format:
{
  "overall_verdict": "authentic|suspicious|deepfake",
  "confidence_score": 0.85,
  "analysis_by_category": {
    "facial": {
      "suspicious": true,
      "confidence": 0.9,
      "findings": ["Unnatural eye reflections", "Overly smooth skin texture"]
    },
    "lighting": {
      "suspicious": false,
      "confidence": 0.3,
      "findings": ["Lighting appears consistent"]
    },
    "texture": {
      "suspicious": true,
      "confidence": 0.8,
      "findings": ["Artificial smoothing detected"]
    },
    "boundaries": {
      "suspicious": false,
      "confidence": 0.4,
      "findings": []
    },
    "background": {
      "suspicious": false,
      "confidence": 0.2,
      "findings": []
    },
    "artifacts": {
      "suspicious": true,
      "confidence": 0.7,
      "findings": ["GAN-specific frequency patterns"]
    }
  },
  "critical_findings": ["Unnatural eye reflections", "Artificial smoothing detected", "GAN patterns"],
  "recommendation": "High confidence deepfake detection. Multiple indicators suggest AI generation."
}
"""
    
    def _get_quick_prompt(self) -> str:
        """Quick analysis prompt for video frames."""
        return """
Quick deepfake check on this video frame.

Focus on:
1. Facial anomalies (eyes, skin, mouth)
2. Lighting inconsistencies
3. Obvious blending artifacts
4. Unnatural boundaries

Return JSON:
{
  "is_suspicious": true,
  "confidence": 0.75,
  "findings": ["Unnatural eye reflections", "Skin texture too smooth"],
  "anomaly_types": ["facial", "texture"],
  "frame_quality": "good"
}
"""
    
    def _get_audio_analysis_prompt(self) -> str:
        """Audio analysis prompt for AI-generated voice detection."""
        return """
Analyze this audio clip to determine if the voice is AI-generated or synthetic.

Focus on these indicators of AI-generated speech:

1. **Prosody & Intonation**:
   - Unnatural pitch variations
   - Robotic or monotone delivery
   - Inconsistent emotional expression
   - Mechanical rhythm patterns

2. **Voice Quality**:
   - Synthetic timbre or texture
   - Unnatural resonance
   - Frequency artifacts
   - Digital processing artifacts

3. **Speech Patterns**:
   - Unnatural pauses or timing
   - Inconsistent breathing sounds
   - Missing or artificial breath sounds
   - Robotic articulation

4. **Background & Noise**:
   - Absence of natural ambient noise
   - Artificial silence between words
   - Digital noise patterns
   - Unnatural audio compression

5. **Consistency**:
   - Voice characteristic changes mid-speech
   - Unnatural transitions between phonemes
   - Inconsistent audio quality

6. **Natural Human Markers**:
   - Presence of natural vocal fry
   - Authentic emotional inflections
   - Natural hesitations or filler words
   - Organic breathing patterns

Return JSON in this exact format:
{
  "is_ai_generated": true,
  "confidence": 0.85,
  "is_suspicious": true,
  "findings": [
    "Unnatural prosody detected",
    "Missing natural breathing sounds",
    "Robotic rhythm patterns"
  ],
  "anomaly_types": ["prosody", "breathing", "rhythm"],
  "voice_quality": "synthetic",
  "recommendation": "High confidence AI-generated voice. Multiple synthetic indicators detected."
}
"""
    
    def _parse_response(self, response) -> dict:
        """
        Parse Gemini response to dict.
        
        Args:
            response: Gemini API response
        
        Returns:
            dict: Parsed response
        """
        try:
            # Log the raw response for debugging
            logger.info(f"Raw Gemini response type: {type(response)}")
            logger.info(f"Response attributes: {dir(response)}")
            
            text = response.text
            logger.info(f"Response text: {text[:500]}")  # First 500 chars
            
            # Try to parse as JSON
            parsed = json.loads(text)
            logger.info(f"Successfully parsed JSON: {parsed}")
            return parsed
        except json.JSONDecodeError as e:
            # Fallback if not valid JSON
            logger.warning(f"Response not valid JSON: {str(e)}")
            logger.warning(f"Response text: {text}")
            text_lower = text.lower()
            return {
                "raw_response": text,
                "is_suspicious": "deepfake" in text_lower or "suspicious" in text_lower,
                "confidence": 0.5,
                "overall_verdict": "suspicious" if "suspicious" in text_lower else "unknown",
                "error": "Failed to parse JSON response"
            }
        except Exception as e:
            logger.error(f"Error parsing response: {str(e)}")
            logger.error(f"Response object: {response}")
            return {
                "error": f"Parse error: {str(e)}",
                "is_suspicious": False,
                "confidence": 0.0
            }


# Singleton instance
gemini_service = GeminiService()
