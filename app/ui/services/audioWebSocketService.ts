/**
 * Audio WebSocket Service
 * Manages WebSocket connection for streaming audio to backend for AI voice detection
 */

import type { AudioAnalysisResult } from "./audioStreamService";

export interface AudioWebSocketConfig {
  url?: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export class AudioWebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts: number;
  private reconnectDelay: number;
  private currentAttempt = 0;
  private isConnected = false;
  private messageCallbacks: ((data: AudioAnalysisResult) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private connectCallbacks: (() => void)[] = [];
  private disconnectCallbacks: (() => void)[] = [];

  constructor(config: AudioWebSocketConfig = {}) {
    this.url = config.url || "ws://localhost:8000/api/v1/audio-stream";
    this.reconnectAttempts = config.reconnectAttempts || 3;
    this.reconnectDelay = config.reconnectDelay || 2000;
  }

  /**
   * Connect to audio WebSocket endpoint
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`🔌 Connecting to audio WebSocket: ${this.url}`);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("✅ Audio WebSocket connected");
          this.isConnected = true;
          this.currentAttempt = 0;
          this.connectCallbacks.forEach((cb) => cb());
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as AudioAnalysisResult;
            console.log("📨 Audio analysis result:", data);
            this.messageCallbacks.forEach((cb) => cb(data));
          } catch (error) {
            console.error("Failed to parse audio message:", error);
          }
        };

        this.ws.onerror = (event) => {
          console.error("❌ Audio WebSocket error:", event);
          const error = new Error("Audio WebSocket connection error");
          this.errorCallbacks.forEach((cb) => cb(error));
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("🔌 Audio WebSocket disconnected");
          this.isConnected = false;
          this.disconnectCallbacks.forEach((cb) => cb());

          // Attempt reconnection
          if (this.currentAttempt < this.reconnectAttempts) {
            this.currentAttempt++;
            console.log(
              `🔄 Reconnecting audio WebSocket (attempt ${this.currentAttempt}/${this.reconnectAttempts})...`
            );
            setTimeout(() => {
              this.connect().catch(console.error);
            }, this.reconnectDelay);
          }
        };
      } catch (error) {
        console.error("Failed to create audio WebSocket:", error);
        reject(error);
      }
    });
  }

  /**
   * Send audio chunk to backend
   */
  sendAudioChunk(audioBlob: Blob): void {
    if (!this.isConnected || !this.ws) {
      console.warn("⚠️ Audio WebSocket not connected, cannot send audio");
      return;
    }

    // Send binary audio data directly
    this.ws.send(audioBlob);
  }

  /**
   * Send control message
   */
  sendControlMessage(action: "start" | "stop" | "stats"): void {
    if (!this.isConnected || !this.ws) {
      console.warn("⚠️ Audio WebSocket not connected");
      return;
    }

    const message = JSON.stringify({ action });
    this.ws.send(message);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.sendControlMessage("stop");
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      console.log("🔌 Audio WebSocket disconnected");
    }
  }

  /**
   * Register callback for analysis results
   */
  onMessage(callback: (data: AudioAnalysisResult) => void): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * Register callback for errors
   */
  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Register callback for connection
   */
  onConnect(callback: () => void): void {
    this.connectCallbacks.push(callback);
  }

  /**
   * Register callback for disconnection
   */
  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  /**
   * Check if connected
   */
  connected(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
export const audioWebSocketService = new AudioWebSocketService();
