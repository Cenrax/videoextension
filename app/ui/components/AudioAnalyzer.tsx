/**
 * Audio Analyzer Component
 * UI for capturing and analyzing audio for AI-generated voice detection
 */

import { useState, useEffect, useRef } from "react";
import {
  audioStreamService,
  audioWebSocketService,
  type AudioAnalysisResult,
} from "../services";

interface AudioAnalyzerProps {
  isVisible: boolean;
}

export const AudioAnalyzer = ({ isVisible }: AudioAnalyzerProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [bufferSize, setBufferSize] = useState(0);
  const [audioAlert, setAudioAlert] = useState<AudioAnalysisResult | null>(null);
  const [latestAnalysis, setLatestAnalysis] = useState<{
    isAI: boolean;
    confidence: number;
    timestamp: number;
  } | null>(null);
  const [captureMode, setCaptureMode] = useState<"microphone" | "tab">("microphone");
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!isVisible) return;

    // Setup WebSocket callbacks
    audioWebSocketService.onConnect(() => {
      console.log("✅ Audio WebSocket connected");
      setIsConnected(true);
    });

    audioWebSocketService.onDisconnect(() => {
      console.log("🔌 Audio WebSocket disconnected");
      setIsConnected(false);
    });

    audioWebSocketService.onMessage((result: AudioAnalysisResult) => {
      console.log("📨 Audio analysis result:", result);

      if (result.status === "alert") {
        // AI voice detected!
        setIsAnalyzing(false);
        setAudioAlert(result);
        setLatestAnalysis({
          isAI: true,
          confidence: result.confidence || 0,
          timestamp: Date.now(),
        });

        // Show browser notification
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const confidencePercent = ((result.confidence || 0) * 100).toFixed(0);
          new Notification("🚨 AI Voice Detected", {
            body: `AI-generated voice detected! Confidence: ${confidencePercent}%`,
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='75' font-size='75'>🎤</text></svg>",
          });
        }
      } else if (result.status === "stopped" && (result as any).final_analysis) {
        // Handle final analysis when stopping
        setIsAnalyzing(false);
        const finalAnalysis = (result as any).final_analysis;
        console.log("📊 Final analysis received:", finalAnalysis);
        
        const isAI = finalAnalysis.is_ai_generated || false;
        const confidence = finalAnalysis.confidence || 0;
        
        setLatestAnalysis({
          isAI,
          confidence,
          timestamp: Date.now(),
        });
        
        // Show alert if AI detected in final analysis
        if (isAI && confidence > 0.7) {
          setAudioAlert({
            status: "alert",
            confidence,
            findings: finalAnalysis.findings || [],
            anomaly_types: finalAnalysis.anomaly_types || [],
          });
        }
      } else if (result.status === "received") {
        setChunkCount(result.chunk_count || 0);
        setBufferSize(result.buffer_size || 0);
        
        // Check if buffer is getting close to analysis threshold
        if ((result.buffer_size || 0) >= 80000) {
          setIsAnalyzing(true);
        }
      }
    });

    audioWebSocketService.onError((error) => {
      console.error("❌ Audio WebSocket error:", error);
      setError(error.message);
    });

    return () => {
      stopRecording();
      
      // Clean up timers
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
      }
    };
  }, [isVisible]);

  // Audio visualization
  useEffect(() => {
    if (!isRecording || !canvasRef.current) return;

    const drawVisualization = async () => {
      const analyser = await audioStreamService.getAudioVisualization();
      if (!analyser || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = "rgba(10, 14, 39, 0.3)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

          const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
          gradient.addColorStop(0, "#00d4ff");
          gradient.addColorStop(1, "#7c3aed");

          ctx.fillStyle = gradient;
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

          x += barWidth + 1;
        }
      };

      draw();
    };

    drawVisualization();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      setError(null);

      // Connect to WebSocket if not connected
      if (!isConnected) {
        await audioWebSocketService.connect();
      }

      // Setup audio data callback
      audioStreamService.onData((audioBlob) => {
        audioWebSocketService.sendAudioChunk(audioBlob);
      });

      audioStreamService.onError((error) => {
        setError(error.message);
        stopRecording();
      });

      // Start audio capture based on mode
      if (captureMode === "microphone") {
        await audioStreamService.startMicrophoneCapture();
      } else {
        await audioStreamService.startTabAudioCapture();
      }

      // Send start control message
      audioWebSocketService.sendControlMessage("start");

      setIsRecording(true);
      setChunkCount(0);
      setBufferSize(0);
      setAudioAlert(null);
      setLatestAnalysis(null);

      // Start 5-second countdown
      setCountdown(5);
      let timeLeft = 5;

      countdownIntervalRef.current = setInterval(() => {
        timeLeft -= 1;
        setCountdown(timeLeft);
        
        if (timeLeft <= 0) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
        }
      }, 1000);

      // Auto-stop after 5 seconds
      autoStopTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, 5000);

    } catch (error) {
      console.error("Failed to start recording:", error);
      setError(error instanceof Error ? error.message : "Failed to start recording");
      
      // Clean up timers on error
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
        autoStopTimeoutRef.current = null;
      }
    }
  };

  const stopRecording = () => {
    // Always set analyzing state when stopping (backend will analyze buffered audio)
    setIsAnalyzing(true);
    
    audioStreamService.stopCapture();
    
    // Clear timers
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }
    
    setCountdown(null);
    
    audioWebSocketService.sendControlMessage("stop");
    setIsRecording(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const dismissAlert = () => {
    setAudioAlert(null);
  };

  if (!isVisible) return null;

  return (
    <div
      style={{
        padding: "20px",
        background: "linear-gradient(135deg, rgba(26, 33, 66, 0.6) 0%, rgba(21, 27, 61, 0.8) 100%)",
        borderRadius: "12px",
        border: "2px solid rgba(0, 212, 255, 0.3)",
        marginTop: "20px",
        position: "relative",
      }}
    >
      {/* Countdown Overlay */}
      {countdown !== null && countdown > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10, 14, 39, 0.95)",
            borderRadius: "12px",
            zIndex: 1000,
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              fontSize: "120px",
              fontWeight: 900,
              color: "#00d4ff",
              textShadow: "0 0 40px rgba(0, 212, 255, 0.8), 0 0 80px rgba(0, 212, 255, 0.4)",
              animation: "pulse 1s ease-in-out",
              lineHeight: 1,
            }}
          >
            {countdown}
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.1); opacity: 0.8; }
            }
          `}</style>
        </div>
      )}

      <h3
        style={{
          margin: "0 0 16px 0",
          fontSize: "16px",
          fontWeight: 700,
          color: "#00d4ff",
          textShadow: "0 0 12px rgba(0, 212, 255, 0.4)",
          letterSpacing: "0.5px",
        }}
      >
        🎤 Audio AI Detection
      </h3>

      {/* Alert Banner */}
      {audioAlert && (
        <div
          style={{
            padding: "16px",
            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.3) 100%)",
            color: "#fee",
            borderRadius: "12px",
            marginBottom: "16px",
            fontSize: "13px",
            border: "2px solid rgba(239, 68, 68, 0.5)",
            boxShadow: "0 0 24px rgba(239, 68, 68, 0.3)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "6px", fontSize: "15px" }}>
            🚨 AI-Generated Voice Detected!
          </div>
          <div style={{ fontSize: "12px", marginTop: "6px", fontFamily: "monospace", color: "#fecaca" }}>
            Confidence: <span style={{ fontWeight: 700, color: "#fee" }}>
              {((audioAlert.confidence || 0) * 100).toFixed(0)}%
            </span>
          </div>
          {audioAlert.findings && audioAlert.findings.length > 0 && (
            <div style={{ fontSize: "11px", marginTop: "8px", lineHeight: "1.5", color: "#fecaca" }}>
              {audioAlert.findings[0]}
            </div>
          )}
          <button
            onClick={dismissAlert}
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
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div
          style={{
            padding: "12px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#ef4444",
            fontSize: "12px",
            marginBottom: "16px",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Capture Mode Selection */}
      {!isRecording && (
        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "8px", display: "block" }}>
            Audio Source:
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setCaptureMode("microphone")}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: captureMode === "microphone" 
                  ? "2px solid rgba(0, 212, 255, 0.5)" 
                  : "2px solid rgba(148, 163, 184, 0.3)",
                background: captureMode === "microphone"
                  ? "rgba(0, 212, 255, 0.2)"
                  : "rgba(26, 33, 66, 0.5)",
                color: captureMode === "microphone" ? "#00d4ff" : "#94a3b8",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              🎙️ Microphone
            </button>
            <button
              onClick={() => setCaptureMode("tab")}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: captureMode === "tab" 
                  ? "2px solid rgba(0, 212, 255, 0.5)" 
                  : "2px solid rgba(148, 163, 184, 0.3)",
                background: captureMode === "tab"
                  ? "rgba(0, 212, 255, 0.2)"
                  : "rgba(26, 33, 66, 0.5)",
                color: captureMode === "tab" ? "#00d4ff" : "#94a3b8",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              🔊 Tab Audio
            </button>
          </div>
        </div>
      )}

      {/* Audio Visualization */}
      {isRecording && (
        <canvas
          ref={canvasRef}
          width={360}
          height={100}
          style={{
            width: "100%",
            height: "100px",
            borderRadius: "8px",
            marginBottom: "16px",
            background: "rgba(10, 14, 39, 0.8)",
            border: "1px solid rgba(0, 212, 255, 0.2)",
          }}
        />
      )}

      {/* Status Display */}
      {(isRecording || isAnalyzing) && (
        <div
          style={{
            padding: "12px",
            background: "rgba(26, 33, 66, 0.6)",
            borderRadius: "8px",
            marginBottom: "16px",
            border: latestAnalysis
              ? `2px solid ${latestAnalysis.isAI ? "rgba(239, 68, 68, 0.5)" : "rgba(16, 185, 129, 0.5)"}`
              : isAnalyzing
              ? "2px solid rgba(124, 58, 237, 0.5)"
              : "2px solid rgba(16, 185, 129, 0.3)",
          }}
        >
          {isAnalyzing && !latestAnalysis ? (
            <>
              <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    border: "2px solid rgba(124, 58, 237, 0.3)",
                    borderTop: "2px solid #7c3aed",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                <span style={{ color: "#7c3aed", fontWeight: 700 }}>
                  Analyzing with Guardian AI
                </span>
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                Detecting AI-generated voice patterns
              </div>
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </>
          ) : latestAnalysis ? (
            <>
              <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                Analysis Status:{" "}
                <span
                  style={{
                    color: latestAnalysis.isAI ? "#ef4444" : "#10b981",
                    fontWeight: 700,
                  }}
                >
                  {latestAnalysis.isAI ? "🚨 AI VOICE" : "✅ HUMAN"}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", fontFamily: "monospace" }}>
                Confidence:{" "}
                <span style={{ color: latestAnalysis.isAI ? "#ef4444" : "#10b981", fontWeight: 700 }}>
                  {(latestAnalysis.confidence * 100).toFixed(1)}%
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "8px" }}>
                <span style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#10b981",
                  marginRight: "8px",
                  boxShadow: "0 0 8px rgba(16, 185, 129, 0.6)",
                }}></span>
                Recording & Buffering...
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", fontFamily: "monospace" }}>
                Chunks: <span style={{ color: "#00d4ff", fontWeight: 700 }}>{chunkCount}</span>
                {" | "}
                Buffer: <span style={{ color: "#00d4ff", fontWeight: 700 }}>
                  {(bufferSize / 1000).toFixed(0)}KB
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Control Buttons */}
      {!isRecording && !isAnalyzing ? (
        <button
          onClick={startRecording}
          disabled={!isConnected && isRecording}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "10px",
            border: "2px solid rgba(0, 212, 255, 0.3)",
            background: "linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(124, 58, 237, 0.2) 100%)",
            color: "#00d4ff",
            fontSize: "15px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.3s",
            boxShadow: "0 0 20px rgba(0, 212, 255, 0.3)",
            textShadow: "0 0 8px rgba(0, 212, 255, 0.5)",
          }}
        >
          🎤 Start Audio Analysis (5s)
        </button>
      ) : isAnalyzing ? (
        <button
          disabled
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "10px",
            border: "2px solid rgba(124, 58, 237, 0.5)",
            background: "linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(99, 102, 241, 0.3) 100%)",
            color: "#7c3aed",
            fontSize: "15px",
            fontWeight: 700,
            cursor: "not-allowed",
            transition: "all 0.3s",
            boxShadow: "0 0 20px rgba(124, 58, 237, 0.3)",
            textShadow: "0 0 8px rgba(124, 58, 237, 0.5)",
            opacity: 0.8,
          }}
        >
          🤖 Analyzing...
        </button>
      ) : (
        <button
          onClick={stopRecording}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "10px",
            border: "2px solid rgba(239, 68, 68, 0.5)",
            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.3) 100%)",
            color: "#ef4444",
            fontSize: "15px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.3s",
            boxShadow: "0 0 20px rgba(239, 68, 68, 0.3)",
            textShadow: "0 0 8px rgba(239, 68, 68, 0.5)",
          }}
        >
          ⏹️ Stop Recording
        </button>
      )}

      {/* Info Text */}
      <div
        style={{
          marginTop: "12px",
          fontSize: "11px",
          color: "#64748b",
          textAlign: "center",
          lineHeight: "1.5",
        }}
      >
        {isRecording 
          ? "Recording will auto-stop after 5 seconds..."
          : captureMode === "microphone" 
          ? "Records for 5 seconds and analyzes microphone input"
          : "Records for 5 seconds and analyzes tab audio"}
      </div>
    </div>
  );
};
