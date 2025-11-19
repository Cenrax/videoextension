/**
 * Audio Stream Service
 * Handles audio capture from microphone or tab audio and streaming to backend
 */

export interface AudioStreamConfig {
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export interface AudioAnalysisResult {
  status: string;
  chunk_count?: number;
  buffer_size?: number;
  message?: string;
  alert_type?: string;
  confidence?: number;
  findings?: string[];
  anomaly_types?: string[];
}

export class AudioStreamService {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private isRecording = false;
  private onDataCallback: ((data: Blob) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  /**
   * Start capturing audio from microphone
   */
  async startMicrophoneCapture(config: AudioStreamConfig = {}): Promise<void> {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: config.sampleRate || 48000,
          channelCount: config.channelCount || 1,
          echoCancellation: config.echoCancellation ?? true,
          noiseSuppression: config.noiseSuppression ?? true,
          autoGainControl: config.autoGainControl ?? true,
        },
        video: false,
      });

      await this.setupMediaRecorder();
      console.log("✅ Microphone audio capture started");
    } catch (error) {
      console.error("❌ Failed to start microphone capture:", error);
      this.handleError(
        new Error(`Microphone access denied: ${error.message}`)
      );
      throw error;
    }
  }

  /**
   * Start capturing audio from current tab (Chrome extension API)
   */
  async startTabAudioCapture(): Promise<void> {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.id) {
        throw new Error("No active tab found");
      }

      // Capture tab audio using chrome.tabCapture API
      this.mediaStream = await new Promise<MediaStream>(
        (resolve, reject) => {
          chrome.tabCapture.capture(
            {
              audio: true,
              video: false,
            },
            (stream) => {
              if (chrome.runtime.lastError) {
                reject(
                  new Error(chrome.runtime.lastError.message)
                );
              } else if (stream) {
                resolve(stream);
              } else {
                reject(new Error("Failed to capture tab audio"));
              }
            }
          );
        }
      );

      await this.setupMediaRecorder();
      console.log("✅ Tab audio capture started");
    } catch (error) {
      console.error("❌ Failed to start tab audio capture:", error);
      this.handleError(
        new Error(`Tab audio capture failed: ${error.message}`)
      );
      throw error;
    }
  }

  /**
   * Setup MediaRecorder to record audio chunks
   */
  private async setupMediaRecorder(): Promise<void> {
    if (!this.mediaStream) {
      throw new Error("No media stream available");
    }

    // Determine supported MIME type
    const mimeType = this.getSupportedMimeType();
    console.log(`📼 Using MIME type: ${mimeType}`);

    // Create MediaRecorder
    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType,
      audioBitsPerSecond: 128000, // 128 kbps
    });

    // Handle data available event (audio chunks)
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && this.onDataCallback) {
        this.onDataCallback(event.data);
      }
    };

    // Handle errors
    this.mediaRecorder.onerror = (event) => {
      console.error("MediaRecorder error:", event);
      this.handleError(new Error("MediaRecorder error"));
    };

    // Start recording with timeslice (send chunks every 1 second)
    this.mediaRecorder.start(1000);
    this.isRecording = true;
  }

  /**
   * Get supported audio MIME type
   */
  private getSupportedMimeType(): string {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Fallback
    return "audio/webm";
  }

  /**
   * Stop audio capture
   */
  stopCapture(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log("🛑 Audio capture stopped");
  }

  /**
   * Set callback for audio data chunks
   */
  onData(callback: (data: Blob) => void): void {
    this.onDataCallback = callback;
  }

  /**
   * Set callback for errors
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    if (this.onErrorCallback) {
      this.onErrorCallback(error);
    }
  }

  /**
   * Check if currently recording
   */
  isActive(): boolean {
    return this.isRecording;
  }

  /**
   * Get audio visualization data (for UI waveform)
   */
  async getAudioVisualization(): Promise<AnalyserNode | null> {
    if (!this.mediaStream) {
      return null;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    const source = this.audioContext.createMediaStreamSource(
      this.mediaStream
    );
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    return analyser;
  }
}

// Singleton instance
export const audioStreamService = new AudioStreamService();
