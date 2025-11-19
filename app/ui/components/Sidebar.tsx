

import { useState, useEffect, useRef, useCallback } from "react";
import {
  VideoStreamService,
  WebSocketService,
  FrameCaptureService,
  ScreenshotService,
  DomService,
  type WebSocketMessage,
} from "../services";
import { AudioAnalyzer } from "./AudioAnalyzer";

// Configuration
const WS_URL = "ws://127.0.0.1:8000/api/v1/video-stream";
const API_BASE_URL = "http://127.0.0.1:8000/api/v1";
const FRAME_RATE = 30;
const MAX_SCREENSHOTS = 2;

type CapturedScreenshot = {
  id: string;
  dataUrl: string;
  uploaded: boolean;
  uploading: boolean;
  backendPath?: string;
  error?: string | null;
  verifying?: boolean;
  verificationResult?: any;
};

type StreamAlert = {
  id: number;
  frame_number: number;
  confidence: number;
  findings: string[];
  anomaly_types: string[];
};

const createScreenshotItem = (dataUrl: string): CapturedScreenshot => ({
  id:
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  dataUrl,
  uploaded: false,
  uploading: false,
  backendPath: undefined,
  error: null,
});

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
  const [screenshots, setScreenshots] = useState<CapturedScreenshot[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [streamAlerts, setStreamAlerts] = useState<StreamAlert[]>([]);
  const [latestAnalysis, setLatestAnalysis] = useState<{
    isDeepfake: boolean;
    confidence: number;
    timestamp: number;
  } | null>(null);

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
    screenshotServiceRef.current = new ScreenshotService(
      MAX_SCREENSHOTS,
      `${API_BASE_URL}/screenshots`
    );

    // Set up WebSocket message handler
    wsServiceRef.current.onMessage((message: WebSocketMessage) => {
      if (message.status === "connected") {
        console.log("Ready to stream video");
      } else if (message.status === "received" && message.frame_count) {
        setFrameCount(message.frame_count);
      } else if (message.status === "alert") {
        // Handle deepfake alert
        console.warn("⚠️ Deepfake alert detected!", message);
        const alert: StreamAlert = {
          id: Date.now(),
          frame_number: (message.frame_number as number) || 0,
          confidence: (message.confidence as number) || 0,
          findings: (message.findings as string[]) || [],
          anomaly_types: (message.anomaly_types as string[]) || []
        };
        setStreamAlerts(prev => [...prev, alert]);
        
        // Show browser notification if permitted
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const confidencePercent = (alert.confidence * 100).toFixed(0);
          new Notification("⚠️ Deepfake Alert", {
            body: `Suspicious activity detected! Confidence: ${confidencePercent}%`
          });
        }
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

  // Analyze frame (capture and automatically verify)
  const handleAnalyzeFrame = useCallback(async () => {
    if (!screenshotServiceRef.current) {
      return;
    }

    if (!screenshotServiceRef.current.canTakeScreenshot(screenshots.length)) {
      alert(
        `Maximum ${MAX_SCREENSHOTS} analyses allowed. Please clear existing results first.`
      );
      return;
    }

    if (!videoRef.current || !videoStream) {
      alert("No video stream available");
      return;
    }

    const screenshotDataUrl = screenshotServiceRef.current.captureScreenshot(
      videoRef.current
    );

    if (screenshotDataUrl) {
      const newScreenshot = createScreenshotItem(screenshotDataUrl);
      // Add to state with verifying flag
      setScreenshots((prev) => [{ ...newScreenshot, verifying: true }, ...prev]);
      
      // Automatically verify the frame
      try {
        const response = await fetch(`${API_BASE_URL}/screenshots/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data_url: screenshotDataUrl,
            source: window.location.href,
            metadata: {
              frameCount,
              capturedAt: new Date().toISOString(),
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Verification failed: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("Frame analysis result:", result);

        // Extract analysis from nested structure
        const analysis = result.deepfake_analysis || result;
        const verdict = analysis.overall_verdict || "unknown";
        const confidence = analysis.confidence_score || analysis.confidence || 0;
        
        // Determine if deepfake (suspicious verdicts: "suspicious", "likely_deepfake", "deepfake")
        const isDeepfake = ["suspicious", "likely_deepfake", "deepfake"].includes(verdict.toLowerCase());

        // Update latest analysis state for WebSocket status card
        setLatestAnalysis({
          isDeepfake: isDeepfake,
          confidence: confidence,
          timestamp: Date.now()
        });
        
        console.log(`Analysis: ${verdict}, Deepfake: ${isDeepfake}, Confidence: ${confidence}`);

        // Update with verification result
        setScreenshots((prev) =>
          prev.map((item) =>
            item.id === newScreenshot.id
              ? {
                  ...item,
                  verifying: false,
                  verificationResult: result,
                }
              : item
          )
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Analysis failed";
        console.error("Frame analysis failed:", error);
        setScreenshots((prev) =>
          prev.map((item) =>
            item.id === newScreenshot.id
              ? { ...item, verifying: false, error: message }
              : item
          )
        );
        alert(message);
      }
    }
  }, [videoStream, screenshots.length, frameCount]);

  // Download screenshot
  const handleDownloadScreenshot = useCallback(
    (screenshot: CapturedScreenshot) => {
      if (screenshotServiceRef.current) {
        screenshotServiceRef.current.downloadScreenshot(screenshot.dataUrl);
      }
    },
    []
  );

  // Remove screenshot
  const handleRemoveScreenshot = useCallback((id: string) => {
    setScreenshots((prev) => prev.filter((screenshot) => screenshot.id !== id));
  }, []);

  // Clear all screenshots
  const handleClearScreenshots = useCallback(() => {
    setScreenshots([]);
  }, []);

  // Send screenshot to backend
  const handleSendScreenshot = useCallback(
    async (screenshot: CapturedScreenshot) => {
      if (!screenshotServiceRef.current) {
        return;
      }

      setScreenshots((prev) =>
        prev.map((item) =>
          item.id === screenshot.id
            ? { ...item, uploading: true, error: null }
            : item
        )
      );

      try {
        const response = await screenshotServiceRef.current.uploadScreenshot(
          screenshot.dataUrl,
          {
            source: window.location.href,
            metadata: {
              frameCount,
              capturedAt: new Date().toISOString(),
            },
          }
        );

        setScreenshots((prev) =>
          prev.map((item) =>
            item.id === screenshot.id
              ? {
                  ...item,
                  uploading: false,
                  uploaded: true,
                  backendPath: response.file_path || response.file_name,
                }
              : item
          )
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send screenshot";
        console.error("Screenshot upload failed:", error);
        setScreenshots((prev) =>
          prev.map((item) =>
            item.id === screenshot.id
              ? { ...item, uploading: false, error: message }
              : item
          )
        );
        alert(message);
      }
    },
    [frameCount]
  );

  // Verify screenshot for deepfakes
  const handleVerifyScreenshot = useCallback(
    async (screenshot: CapturedScreenshot) => {
      setScreenshots((prev) =>
        prev.map((item) =>
          item.id === screenshot.id
            ? { ...item, verifying: true, error: null }
            : item
        )
      );

      try {
        const response = await fetch(`${API_BASE_URL}/screenshots/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data_url: screenshot.dataUrl,
            source: window.location.href,
            metadata: {
              frameCount,
              capturedAt: new Date().toISOString(),
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Verification failed: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("Verification result:", result);

        setScreenshots((prev) =>
          prev.map((item) =>
            item.id === screenshot.id
              ? {
                  ...item,
                  verifying: false,
                  verificationResult: result,
                }
              : item
          )
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Verification failed";
        console.error("Screenshot verification failed:", error);
        setScreenshots((prev) =>
          prev.map((item) =>
            item.id === screenshot.id
              ? { ...item, verifying: false, error: message }
              : item
          )
        );
        alert(message);
      }
    },
    [frameCount]
  );

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
        background: "linear-gradient(180deg, #0a0e27 0%, #151b3d 100%)",
        color: "#e2e8f0",
        zIndex: 2147483647,
        boxShadow: "-4px 0 24px rgba(0, 212, 255, 0.15), -2px 0 8px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif",
        backdropFilter: "blur(10px)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px",
          borderBottom: "1px solid rgba(0, 212, 255, 0.2)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          background: "linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(0, 212, 255, 0.05) 100%)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ 
              margin: 0, 
              fontSize: "22px", 
              fontWeight: 700,
              background: "linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "0.5px"
            }}>
              🛡️ GUARDIAN
            </h2>
            <p style={{ 
              margin: "4px 0 0 0", 
              fontSize: "11px", 
              color: "#94a3b8",
              fontWeight: 500,
              letterSpacing: "0.5px"
            }}>
              AI-Powered Deepfake Detection
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#ef4444",
              fontSize: "18px",
              cursor: "pointer",
              padding: "6px 10px",
              borderRadius: "6px",
              transition: "all 0.2s",
              fontWeight: 600,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
              e.currentTarget.style.boxShadow = "0 0 12px rgba(239, 68, 68, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          padding: "20px",
          overflowY: "auto",
          scrollBehavior: "smooth",
        }}
      >
        <div>
          {/* Stream Alert Banner */}
          {streamAlerts.length > 0 && (
            <div style={{
              padding: "16px",
              background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.3) 100%)",
              color: "#fee",
              borderRadius: "12px",
              marginBottom: "20px",
              fontSize: "13px",
              border: "2px solid rgba(239, 68, 68, 0.5)",
              boxShadow: "0 0 24px rgba(239, 68, 68, 0.3), 0 4px 12px rgba(0, 0, 0, 0.4)",
              backdropFilter: "blur(10px)",
            }}>
              <div style={{ fontWeight: 700, marginBottom: "6px", fontSize: "15px", textShadow: "0 0 8px rgba(239, 68, 68, 0.5)" }}>
                🚨 Deepfake Detected in Stream!
              </div>
              <div style={{ fontFamily: "monospace", color: "#fecaca" }}>
                Frame #{streamAlerts[streamAlerts.length - 1].frame_number}
              </div>
              <div style={{ fontSize: "12px", marginTop: "6px", fontFamily: "monospace", color: "#fecaca" }}>
                Confidence: <span style={{ fontWeight: 700, color: "#fee" }}>{(streamAlerts[streamAlerts.length - 1].confidence * 100).toFixed(0)}%</span>
              </div>
              {streamAlerts[streamAlerts.length - 1].findings.length > 0 && (
                <div style={{ fontSize: "11px", marginTop: "8px", lineHeight: "1.5", color: "#fecaca" }}>
                  {streamAlerts[streamAlerts.length - 1].findings[0]}
                </div>
              )}
              <button
                onClick={() => setStreamAlerts([])}
                style={{
                  marginTop: "12px",
                  padding: "6px 12px",
                  fontSize: "11px",
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: "6px",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.25)";
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.15)";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                Dismiss
              </button>
            </div>
          )}
          
          <h2 style={{ 
            marginTop: 0, 
            marginBottom: "20px", 
            fontSize: "18px",
            fontWeight: 700,
            color: "#00d4ff",
            textShadow: "0 0 12px rgba(0, 212, 255, 0.4)",
            letterSpacing: "0.5px"
          }}>
            📹 Video Stream Capture
          </h2>

          {/* Detect Video Stream Button */}
          {!videoStream && (
            <button
              onClick={handleDetectVideoStream}
              disabled={isDetecting}
              style={{
                width: "100%",
                padding: "14px",
                marginBottom: "20px",
                borderRadius: "10px",
                border: "2px solid rgba(0, 212, 255, 0.3)",
                background: isDetecting 
                  ? "linear-gradient(135deg, rgba(74, 85, 104, 0.5) 0%, rgba(45, 55, 72, 0.5) 100%)"
                  : "linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(124, 58, 237, 0.2) 100%)",
                color: "#00d4ff",
                fontSize: "15px",
                fontWeight: 700,
                cursor: isDetecting ? "not-allowed" : "pointer",
                transition: "all 0.3s",
                boxSizing: "border-box",
                boxShadow: isDetecting ? "none" : "0 0 20px rgba(0, 212, 255, 0.3)",
                textShadow: "0 0 8px rgba(0, 212, 255, 0.5)",
                letterSpacing: "0.5px",
              }}
              onMouseEnter={(e) => {
                if (!isDetecting) {
                  e.currentTarget.style.boxShadow = "0 0 30px rgba(0, 212, 255, 0.5)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isDetecting) {
                  e.currentTarget.style.boxShadow = "0 0 20px rgba(0, 212, 255, 0.3)";
                  e.currentTarget.style.transform = "translateY(0)";
                }
              }}
            >
              {isDetecting ? "🔄 Detecting Video Stream..." : "🔍 Detect Video Stream"}
            </button>
          )}

          {/* Stop Capture Button */}
          {videoStream && (
            <button
              onClick={handleStopCapture}
              style={{
                width: "100%",
                padding: "14px",
                marginBottom: "20px",
                borderRadius: "10px",
                border: "2px solid rgba(239, 68, 68, 0.5)",
                background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.3) 100%)",
                color: "#ef4444",
                fontSize: "15px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.3s",
                boxSizing: "border-box",
                boxShadow: "0 0 20px rgba(239, 68, 68, 0.3)",
                textShadow: "0 0 8px rgba(239, 68, 68, 0.5)",
                letterSpacing: "0.5px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 0 30px rgba(239, 68, 68, 0.5)";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 0 20px rgba(239, 68, 68, 0.3)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              ⏹️ Stop Capture
            </button>
          )}

          {/* Analysis Status Card */}
          {videoStream && (
            <div
              style={{
                marginBottom: "20px",
                padding: "16px",
                background: "linear-gradient(135deg, rgba(26, 33, 66, 0.6) 0%, rgba(21, 27, 61, 0.8) 100%)",
                borderRadius: "10px",
                border: latestAnalysis 
                  ? `2px solid ${latestAnalysis.isDeepfake ? "rgba(239, 68, 68, 0.5)" : "rgba(16, 185, 129, 0.5)"}`
                  : `2px solid ${wsConnected ? "rgba(16, 185, 129, 0.3)" : "rgba(148, 163, 184, 0.3)"}`,
                boxShadow: latestAnalysis
                  ? latestAnalysis.isDeepfake 
                    ? "0 0 24px rgba(239, 68, 68, 0.4)" 
                    : "0 0 24px rgba(16, 185, 129, 0.4)"
                  : wsConnected 
                    ? "0 0 20px rgba(16, 185, 129, 0.2)" 
                    : "0 0 20px rgba(148, 163, 184, 0.2)",
                transition: "all 0.3s ease",
              }}
            >
              {/* Analysis Result Display */}
              {latestAnalysis ? (
                <>
                  <div style={{ fontSize: "13px", marginBottom: "10px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      backgroundColor: latestAnalysis.isDeepfake ? "#ef4444" : "#10b981",
                      boxShadow: latestAnalysis.isDeepfake
                        ? "0 0 12px rgba(239, 68, 68, 0.8)" 
                        : "0 0 12px rgba(16, 185, 129, 0.8)",
                      animation: "pulse 2s ease-in-out infinite"
                    }}></span>
                    <span style={{ fontWeight: 700 }}>Analysis Status:</span>
                    <span
                      style={{
                        color: latestAnalysis.isDeepfake ? "#ef4444" : "#10b981",
                        fontWeight: 700,
                        textShadow: latestAnalysis.isDeepfake
                          ? "0 0 8px rgba(239, 68, 68, 0.5)" 
                          : "0 0 8px rgba(16, 185, 129, 0.5)",
                      }}
                    >
                      {latestAnalysis.isDeepfake ? "🚨 DEEPFAKE DETECTED" : "✅ AUTHENTIC"}
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: "#94a3b8", fontFamily: "monospace", marginTop: "8px" }}>
                    Confidence: <span style={{ 
                      color: latestAnalysis.isDeepfake ? "#ef4444" : "#10b981", 
                      fontWeight: 700 
                    }}>
                      {(latestAnalysis.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                </>
              ) : (
                <>
                  {/* WebSocket Status when no analysis yet */}
                  <div style={{ fontSize: "13px", marginBottom: "10px", color: "#94a3b8", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: wsConnected ? "#10b981" : "#94a3b8",
                      boxShadow: wsConnected 
                        ? "0 0 8px rgba(16, 185, 129, 0.6)" 
                        : "none",
                      animation: wsConnected ? "pulse 2s ease-in-out infinite" : "none"
                    }}></span>
                    WebSocket Status:{" "}
                    <span
                      style={{
                        color: wsConnected ? "#10b981" : "#94a3b8",
                        fontWeight: 700,
                        textShadow: wsConnected 
                          ? "0 0 8px rgba(16, 185, 129, 0.5)" 
                          : "none",
                      }}
                    >
                      {wsConnected ? "Connected" : "Ready"}
                    </span>
                  </div>
                  {isStreaming && (
                    <div style={{ fontSize: "13px", color: "#94a3b8", fontFamily: "monospace" }}>
                      Frames Sent: <span style={{ color: "#00d4ff", fontWeight: 700 }}>{frameCount}</span>
                    </div>
                  )}
                </>
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

              {/* Analyze Frame Button */}
              <button
                onClick={handleAnalyzeFrame}
                disabled={screenshots.length >= MAX_SCREENSHOTS}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor:
                    screenshots.length >= MAX_SCREENSHOTS ? "#4a5568" : "#805ad5",
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
                    e.currentTarget.style.backgroundColor = "#6b46c1";
                  }
                }}
                onMouseLeave={(e) => {
                  if (screenshots.length < MAX_SCREENSHOTS) {
                    e.currentTarget.style.backgroundColor = "#805ad5";
                  }
                }}
              >
                🔍 Analyze Frame ({screenshots.length}/{MAX_SCREENSHOTS})
              </button>
            </div>
          )}

          {/* Frame Analyses Display */}
          {screenshots.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Frame Analyses ({screenshots.length}/{MAX_SCREENSHOTS})
              </div>
              {screenshots.map((screenshot, index) => (
                <div
                  key={screenshot.id}
                  style={{
                    marginBottom: "12px",
                    borderRadius: "4px",
                    overflow: "hidden",
                    border: "1px solid #333",
                    position: "relative",
                    backgroundColor: "#121212",
                  }}
                >
                  <img
                    src={screenshot.dataUrl}
                    alt={`Screenshot ${index + 1}`}
                    style={{
                      width: "100%",
                      display: "block",
                      cursor: "pointer",
                    }}
                    onClick={() => handleDownloadScreenshot(screenshot)}
                  />
                  <button
                    onClick={() => handleRemoveScreenshot(screenshot.id)}
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
                  <div
                    style={{
                      padding: "8px",
                      borderTop: "1px solid #333",
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    {/* <button
                      onClick={() => handleSendScreenshot(screenshot)}
                      disabled={screenshot.uploaded || screenshot.uploading}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: "4px",
                        border: "none",
                        backgroundColor: screenshot.uploaded
                          ? "#2f855a"
                          : screenshot.uploading
                          ? "#4a5568"
                          : "#3182ce",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor:
                          screenshot.uploaded || screenshot.uploading
                            ? "not-allowed"
                            : "pointer",
                        transition: "background-color 0.2s",
                      }}
                    >
                      {screenshot.uploaded
                        ? "Sent"
                        : screenshot.uploading
                        ? "Sending..."
                        : "Send to Backend"}
                    </button> */}
                    <button
                      onClick={() => handleVerifyScreenshot(screenshot)}
                      disabled={screenshot.verifying || !!screenshot.verificationResult}
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: "4px",
                        border: "none",
                        backgroundColor: screenshot.verificationResult
                          ? "#2f855a"
                          : screenshot.verifying
                          ? "#4a5568"
                          : "#805ad5",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor:
                          screenshot.verifying || screenshot.verificationResult
                            ? "not-allowed"
                            : "pointer",
                        transition: "background-color 0.2s",
                      }}
                    >
                      {screenshot.verificationResult
                        ? "✓ Verified"
                        : screenshot.verifying
                        ? "Verifying..."
                        : "🔍 Verify"}
                    </button>
                    <button
                      onClick={() => handleDownloadScreenshot(screenshot)}
                      style={{
                        padding: "8px",
                        borderRadius: "4px",
                        border: "1px solid #4a9eff",
                        backgroundColor: "transparent",
                        color: "#4a9eff",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Download
                    </button>
                  </div>
                  
                  {/* Verification Results */}
                  {screenshot.verificationResult && (
                    <div style={{
                      padding: "8px",
                      backgroundColor: "#2a2a2a",
                      borderTop: "1px solid #333",
                      fontSize: "11px"
                    }}>
                      {(() => {
                        const analysis = screenshot.verificationResult.deepfake_analysis;
                        const verdict = analysis?.overall_verdict || "unknown";
                        const confidence = ((analysis?.confidence_score || 0) * 100).toFixed(0);
                        
                        const getVerdictColor = () => {
                          if (verdict === "deepfake_detected") return "#dc3545";
                          if (verdict === "suspicious") return "#ffc107";
                          return "#28a745";
                        };
                        
                        const getVerdictText = () => {
                          if (verdict === "deepfake_detected") return "⚠️ Deepfake Detected";
                          if (verdict === "suspicious") return "⚠️ Suspicious";
                          return "✓ Likely Authentic";
                        };
                        
                        return (
                          <>
                            <div style={{
                              fontWeight: 600,
                              color: getVerdictColor(),
                              marginBottom: "4px"
                            }}>
                              {getVerdictText()} ({confidence}% confidence)
                            </div>
                            
                            {analysis?.critical_findings && analysis.critical_findings.length > 0 && (
                              <div style={{ color: "#aaa", marginTop: "4px" }}>
                                <strong>Key Findings:</strong>
                                <ul style={{ margin: "4px 0", paddingLeft: "16px" }}>
                                  {analysis.critical_findings.slice(0, 3).map((finding: string, i: number) => (
                                    <li key={i}>{finding}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {analysis?.recommendation && (
                              <div style={{ color: "#9ae6b4", marginTop: "4px", fontSize: "10px" }}>
                                {analysis.recommendation}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {screenshot.backendPath && (
                    <div
                      style={{
                        padding: "0 8px 8px",
                        fontSize: "11px",
                        color: "#9ae6b4",
                      }}
                    >
                      Stored as: {screenshot.backendPath}
                    </div>
                  )}
                  {screenshot.error && (
                    <div
                      style={{
                        padding: "0 8px 8px",
                        fontSize: "11px",
                        color: "#feb2b2",
                      }}
                    >
                      {screenshot.error}
                    </div>
                  )}
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

          {/* Audio Analyzer Component */}
          <AudioAnalyzer isVisible={isVisible} />
        </div>
      </div>
    </div>
  );
};
