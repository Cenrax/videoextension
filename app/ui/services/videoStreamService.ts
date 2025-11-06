/**
 * Service for detecting and capturing video/audio streams from the page.
 */

export interface StreamCaptureResult {
  success: boolean;
  stream: MediaStream | null;
  error?: string;
}

export class VideoStreamService {
  /**
   * Detect and capture video stream from page video elements.
   */
  static detectAndCaptureVideoStream(): StreamCaptureResult {
    const videoElements = document.querySelectorAll("video");

    if (videoElements.length === 0) {
      return {
        success: false,
        stream: null,
        error: "No video elements found on this page",
      };
    }

    // Try to get MediaStream from video elements
    let capturedStream: MediaStream | null = null;

    for (const videoElement of Array.from(videoElements)) {
      // Check if video has a MediaStream (srcObject)
      if (videoElement.srcObject instanceof MediaStream) {
        capturedStream = videoElement.srcObject;
        break;
      }

      // Try to capture stream from video element
      try {
        const videoWithCapture = videoElement as HTMLVideoElement & {
          captureStream?: () => MediaStream;
        };
        if (
          videoWithCapture.captureStream &&
          typeof videoWithCapture.captureStream === "function"
        ) {
          capturedStream = videoWithCapture.captureStream();
          break;
        }
      } catch (error) {
        console.warn("Failed to capture stream from video element:", error);
      }
    }

    if (capturedStream) {
      return {
        success: true,
        stream: capturedStream,
      };
    }

    return {
      success: false,
      stream: null,
      error:
        "Could not detect active video stream. Make sure a video call is playing.",
    };
  }

  /**
   * Detect and capture audio stream from page audio elements.
   */
  static detectAndCaptureAudioStream(): StreamCaptureResult {
    const audioElements = document.querySelectorAll("audio");

    if (audioElements.length === 0) {
      return {
        success: false,
        stream: null,
        error: "No audio elements found on this page",
      };
    }

    let capturedAudioStream: MediaStream | null = null;

    for (const audioElement of Array.from(audioElements)) {
      if (audioElement.srcObject instanceof MediaStream) {
        capturedAudioStream = audioElement.srcObject;
        break;
      }
    }

    if (capturedAudioStream) {
      return {
        success: true,
        stream: capturedAudioStream,
      };
    }

    return {
      success: false,
      stream: null,
      error: "Could not detect active audio stream",
    };
  }
}

