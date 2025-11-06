/**
 * Service for capturing and streaming video frames.
 */

import { WebSocketService } from "./websocketService";

export interface FrameCaptureConfig {
  frameRate: number;
  quality: number;
}

export class FrameCaptureService {
  private intervalId: number | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private wsService: WebSocketService | null = null;
  private config: FrameCaptureConfig;
  private frameCount: number = 0;
  private onFrameCountUpdate: ((count: number) => void) | null = null;

  constructor(config: FrameCaptureConfig = { frameRate: 30, quality: 0.8 }) {
    this.config = config;
  }

  /**
   * Initialize frame capture with video element and WebSocket service.
   */
  initialize(
    videoElement: HTMLVideoElement,
    wsService: WebSocketService
  ): void {
    this.videoElement = videoElement;
    this.wsService = wsService;
    this.canvas = document.createElement("canvas");
  }

  /**
   * Start capturing and streaming frames.
   */
  start(): void {
    if (this.intervalId) {
      return; // Already capturing
    }

    if (!this.videoElement || !this.wsService || !this.wsService.isConnected()) {
      throw new Error(
        "Video element and WebSocket service must be initialized and connected"
      );
    }

    // Send start action
    this.wsService.send({ action: "start" });

    const frameInterval = 1000 / this.config.frameRate;

    this.intervalId = window.setInterval(() => {
      this.captureAndSendFrame();
    }, frameInterval);
  }

  /**
   * Stop capturing and streaming frames.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.wsService) {
      this.wsService.send({ action: "stop" });
    }
  }

  /**
   * Capture a single frame and send it via WebSocket.
   */
  private captureAndSendFrame(): void {
    if (
      !this.videoElement ||
      !this.wsService ||
      !this.canvas ||
      !this.wsService.isConnected()
    ) {
      return;
    }

    const video = this.videoElement;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    // Set canvas dimensions
    this.canvas.width = video.videoWidth;
    this.canvas.height = video.videoHeight;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);

    // Convert canvas to blob and send as binary
    this.canvas.toBlob(
      (blob) => {
        if (blob && this.wsService?.isConnected()) {
          this.wsService.send(blob);
          this.frameCount++;
          if (this.onFrameCountUpdate) {
            this.onFrameCountUpdate(this.frameCount);
          }
        }
      },
      "image/jpeg",
      this.config.quality
    );
  }

  /**
   * Get current frame count.
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * Reset frame count.
   */
  resetFrameCount(): void {
    this.frameCount = 0;
  }

  /**
   * Set callback for frame count updates.
   */
  onFrameCount(callback: (count: number) => void): void {
    this.onFrameCountUpdate = callback;
  }

  /**
   * Cleanup resources.
   */
  cleanup(): void {
    this.stop();
    this.videoElement = null;
    this.wsService = null;
    this.canvas = null;
    this.frameCount = 0;
  }
}

