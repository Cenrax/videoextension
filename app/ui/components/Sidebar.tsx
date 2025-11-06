

import { useState, useEffect, useRef, useCallback } from "react";
import {
  VideoStreamService,
  WebSocketService,
  FrameCaptureService,
  ScreenshotService,
  DomService,
  type WebSocketMessage,
} from "../services";

// Configuration
const WS_URL = "ws://localhost:8000/api/v1/video-stream";
const FRAME_RATE = 30;
const MAX_SCREENSHOTS = 2;

interface SidebarProps {
  isVisible: boolean;
  isRefresh: boolean;
  onClose: () => void;
}

export const Sidebar = ({
  isVisible,
  isRefresh,
  onClose,
}: SidebarProps) => {
  // State
  const [isDetecting, setIsDetecting] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [frameCount, setFrameCount] = useState(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const wsServiceRef = useRef<WebSocketService | null>(null);
  const frameCaptureServiceRef = useRef<FrameCaptureService | null>(null);
  const screenshotServiceRef = useRef<ScreenshotService | null>(null);

  // Initialize services
  useEffect(() => {
    wsServiceRef.current = new WebSocketService(WS_URL);
    frameCaptureServiceRef.current = new FrameCaptureService({
      frameRate: FRAME_RATE,
      quality: 0.8,
    });
    screenshotServiceRef.current = new ScreenshotService(MAX_SCREENSHOTS);

    // Set up WebSocket message handler
    wsServiceRef.current.onMessage((message: WebSocketMessage) => {
      if (message.status === "connected") {
        console.log("Ready to stream video");
      } else if (message.status === "received" && message.frame_count) {
        setFrameCount(message.frame_count);
      }
    });

    // Set up WebSocket error handler
    wsServiceRef.current.onError(() => {
      setWsConnected(false);
    });

    // Set up WebSocket close handler
    wsServiceRef.current.onClose(() => {
      setWsConnected(false);
      setIsStreaming(false);
      if (frameCaptureServiceRef.current) {
        frameCaptureServiceRef.current.stop();
      }
    });

    // Set up frame count callback
    if (frameCaptureServiceRef.current) {
      frameCaptureServiceRef.current.onFrameCount((count) => {
        setFrameCount(count);
      });
    }

    return () => {
      // Cleanup
      if (frameCaptureServiceRef.current) {
        frameCaptureServiceRef.current.cleanup();
      }
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
      }
    };
  }, []);

  // Handle sidebar visibility
  useEffect(() => {
    if (isVisible) {
      DomService.wrapBody();
      if (isRefresh) {
        handleStopCapture();
      }
    } else {
      DomService.unwrapBody();
      handleStopCapture();
    }

    return () => {
      DomService.unwrapBody();
      handleStopCapture();
    };
  }, [isVisible, isRefresh]);

  // Set video/audio stream sources
  useEffect(() => {
    if (videoStream && videoRef.current) {
      videoRef.current.srcObject = videoStream;
    } else if (!videoStream && videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (audioStream && audioRef.current) {
      audioRef.current.srcObject = audioStream;
    } else if (!audioStream && audioRef.current) {
      audioRef.current.srcObject = null;
    }

    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
    };
  }, [videoStream, audioStream]);

  // Detect and capture video stream
  const handleDetectVideoStream = useCallback(() => {
    setIsDetecting(true);
    const result = VideoStreamService.detectAndCaptureVideoStream();

    if (result.success && result.stream) {
      setVideoStream(result.stream);
    } else {
      alert(result.error || "Failed to detect video stream");
    }
    setIsDetecting(false);
  }, []);

  // Detect and capture audio stream
  const handleDetectAudioStream = useCallback(() => {
    setIsDetecting(true);
    const result = VideoStreamService.detectAndCaptureAudioStream();

    if (result.success && result.stream) {
      setAudioStream(result.stream);
    } else {
      alert(result.error || "Failed to detect audio stream");
    }
    setIsDetecting(false);
  }, []);

  // Stop capture
  const handleStopCapture = useCallback(() => {
    if (frameCaptureServiceRef.current) {
      frameCaptureServiceRef.current.stop();
    }
    if (wsServiceRef.current) {
      wsServiceRef.current.disconnect();
    }
    setIsStreaming(false);
    setWsConnected(false);
    setVideoStream(null);
    setAudioStream(null);
    setScreenshots([]);
  }, []);

  // Start streaming
  const handleStartStreaming = useCallback(async () => {
    if (!videoStream) {
      alert("Please detect video stream first");
      return;
    }

    if (!videoRef.current) {
      alert("Video element not ready");
      return;
    }

    const wsService = wsServiceRef.current;
    const frameService = frameCaptureServiceRef.current;

    if (!wsService || !frameService) {
      alert("Services not initialized");
      return;
    }

    try {
      // Connect WebSocket if not connected
      if (!wsService.isConnected()) {
        await wsService.connect();
        setWsConnected(true);
      }

      // Initialize frame capture service
      frameService.initialize(videoRef.current, wsService);
      frameService.resetFrameCount();

      // Start capturing frames
      frameService.start();
      setIsStreaming(true);
    } catch (error) {
      console.error("Error starting stream:", error);
      alert("Failed to connect to backend server. Make sure it's running.");
      setWsConnected(false);
    }
  }, [videoStream]);

  // Stop streaming
  const handleStopStreaming = useCallback(() => {
    if (frameCaptureServiceRef.current) {
      frameCaptureServiceRef.current.stop();
    }
    if (wsServiceRef.current) {
      wsServiceRef.current.disconnect();
    }
    setIsStreaming(false);
    setWsConnected(false);
  }, []);

  // Take screenshot
  const handleTakeScreenshot = useCallback(() => {
    if (!screenshotServiceRef.current) {
      return;
    }

    if (!screenshotServiceRef.current.canTakeScreenshot(screenshots.length)) {
      alert(
        `Maximum ${MAX_SCREENSHOTS} screenshots allowed. Please clear existing screenshots first.`
      );
      return;
    }

    if (!videoRef.current || !videoStream) {
      alert("No video stream available");
      return;
    }

    const screenshot = screenshotServiceRef.current.captureScreenshot(
      videoRef.current
    );

    if (screenshot) {
      setScreenshots((prev) => [screenshot, ...prev]);
    } else {
      alert("Video stream not ready yet");
    }
  }, [screenshots.length, videoStream]);

  // Download screenshot
  const handleDownloadScreenshot = useCallback((screenshot: string) => {
    if (screenshotServiceRef.current) {
      screenshotServiceRef.current.downloadScreenshot(screenshot);
    }
  }, []);

  // Remove screenshot
  const handleRemoveScreenshot = useCallback((index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Clear all screenshots
  const handleClearScreenshots = useCallback(() => {
    setScreenshots([]);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "400px",
        height: "100vh",
        backgroundColor: "#1a1a1a",
        color: "#fff",
        zIndex: 2147483647,
        boxShadow: "-2px 0 8px rgba(0,0,0,0.2)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #333",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
          Call Tracker
        </h2>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#fff",
            fontSize: "20px",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: "4px",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#333")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          padding: "16px",
          overflowY: "auto",
        }}
      >
        <div style={{ padding: 16 }}>
          <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "16px" }}>
            Video Stream Capture
          </h2>

          {/* Detect Video Stream Button */}
          {!videoStream && (
            <button
              onClick={handleDetectVideoStream}
              disabled={isDetecting}
              style={{
                width: "100%",
                padding: "12px",
                marginBottom: "16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: isDetecting ? "#4a5568" : "#4a9eff",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: isDetecting ? "not-allowed" : "pointer",
                transition: "background-color 0.2s",
                boxSizing: "border-box",
              }}
              onMouseEnter={(e) => {
                if (!isDetecting) {
                  e.currentTarget.style.backgroundColor = "#357abd";
                }
              }}
              onMouseLeave={(e) => {
                if (!isDetecting) {
                  e.currentTarget.style.backgroundColor = "#4a9eff";
                }
              }}
            >
              {isDetecting ? "Detecting Video Stream..." : "🔍 Detect Video Stream"}
            </button>
          )}

          {/* Stop Capture Button */}
          {videoStream && (
            <button
              onClick={handleStopCapture}
              style={{
                width: "100%",
                padding: "12px",
                marginBottom: "16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#dc3545",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background-color 0.2s",
                boxSizing: "border-box",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#c82333")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "#dc3545")
              }
            >
              Stop Capture
            </button>
          )}

          {/* WebSocket Connection Status */}
          {videoStream && (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px",
                backgroundColor: "#2a2a2a",
                borderRadius: "6px",
              }}
            >
              <div style={{ fontSize: "12px", marginBottom: "8px", color: "#aaa" }}>
                WebSocket Status:{" "}
                <span
                  style={{
                    color: wsConnected ? "#28a745" : "#dc3545",
                    fontWeight: 600,
                  }}
                >
                  {wsConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              {isStreaming && (
                <div style={{ fontSize: "12px", color: "#aaa" }}>
                  Frames Sent: {frameCount}
                </div>
              )}
            </div>
          )}

          {/* Start/Stop Streaming Buttons */}
          {videoStream && (
            <div style={{ marginBottom: "16px" }}>
              {!isStreaming ? (
                <button
                  onClick={handleStartStreaming}
                  disabled={!videoStream}
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginBottom: "8px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: wsConnected ? "#28a745" : "#4a9eff",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: videoStream ? "pointer" : "not-allowed",
                    transition: "background-color 0.2s",
                    boxSizing: "border-box",
                  }}
                  onMouseEnter={(e) => {
                    if (videoStream) {
                      e.currentTarget.style.backgroundColor = wsConnected
                        ? "#218838"
                        : "#357abd";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (videoStream) {
                      e.currentTarget.style.backgroundColor = wsConnected
                        ? "#28a745"
                        : "#4a9eff";
                    }
                  }}
                >
                  {wsConnected ? "▶ Start Streaming" : "🔌 Connect & Stream"}
                </button>
              ) : (
                <button
                  onClick={handleStopStreaming}
                  style={{
                    width: "100%",
                    padding: "12px",
                    marginBottom: "8px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: "#dc3545",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "background-color 0.2s",
                    boxSizing: "border-box",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "#c82333")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "#dc3545")
                  }
                >
                  ⏹ Stop Streaming
                </button>
              )}
            </div>
          )}

          {/* Video Stream Preview */}
          {videoStream && (
            <div style={{ marginBottom: "16px" }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: "100%",
                  borderRadius: "6px",
                  backgroundColor: "#000",
                  maxHeight: "300px",
                  marginBottom: "8px",
                }}
              />

              {/* Take Screenshot Button */}
              <button
                onClick={handleTakeScreenshot}
                disabled={screenshots.length >= MAX_SCREENSHOTS}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor:
                    screenshots.length >= MAX_SCREENSHOTS ? "#4a5568" : "#28a745",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor:
                    screenshots.length >= MAX_SCREENSHOTS
                      ? "not-allowed"
                      : "pointer",
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (screenshots.length < MAX_SCREENSHOTS) {
                    e.currentTarget.style.backgroundColor = "#218838";
                  }
                }}
                onMouseLeave={(e) => {
                  if (screenshots.length < MAX_SCREENSHOTS) {
                    e.currentTarget.style.backgroundColor = "#28a745";
                  }
                }}
              >
                📷 Take Screenshot ({screenshots.length}/{MAX_SCREENSHOTS})
              </button>
            </div>
          )}

          {/* Screenshots Display */}
          {screenshots.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Screenshots ({screenshots.length}/{MAX_SCREENSHOTS})
              </div>
              {screenshots.map((screenshot, index) => (
                <div
                  key={index}
                  style={{
                    marginBottom: "8px",
                    borderRadius: "4px",
                    overflow: "hidden",
                    border: "1px solid #333",
                    position: "relative",
                  }}
                >
                  <img
                    src={screenshot}
                    alt={`Screenshot ${index + 1}`}
                    style={{
                      width: "100%",
                      display: "block",
                      cursor: "pointer",
                    }}
                    onClick={() => handleDownloadScreenshot(screenshot)}
                  />
                  <button
                    onClick={() => handleRemoveScreenshot(index)}
                    style={{
                      position: "absolute",
                      top: "4px",
                      right: "4px",
                      background: "rgba(220, 53, 69, 0.9)",
                      border: "none",
                      color: "#fff",
                      borderRadius: "50%",
                      width: "24px",
                      height: "24px",
                      cursor: "pointer",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {screenshots.length > 0 && (
                <button
                  onClick={handleClearScreenshots}
                  style={{
                    width: "100%",
                    padding: "8px",
                    marginTop: "8px",
                    borderRadius: "4px",
                    border: "1px solid #dc3545",
                    backgroundColor: "transparent",
                    color: "#dc3545",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Clear All
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
