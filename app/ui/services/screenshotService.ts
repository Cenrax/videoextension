/**
 * Service for managing screenshots from video streams.
 */

export interface ScreenshotUploadResult {
  status: string;
  file_name: string;
  file_path?: string;
  size_bytes?: number;
  stored_at?: string;
  source?: string | null;
}

export interface ScreenshotUploadOptions {
  source?: string;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

export class ScreenshotService {
  private maxScreenshots: number;
  private uploadEndpoint?: string;

  constructor(maxScreenshots: number = 2, uploadEndpoint?: string) {
    this.maxScreenshots = maxScreenshots;
    this.uploadEndpoint = uploadEndpoint;
  }

  /**
   * Capture a screenshot from a video element.
   */
  captureScreenshot(videoElement: HTMLVideoElement): string | null {
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  }

  /**
   * Download a screenshot.
   */
  downloadScreenshot(dataUrl: string, filename?: string): void {
    const link = document.createElement("a");
    link.download = filename || `screenshot-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }

  /**
   * Upload screenshot to backend if endpoint configured.
   */
  async uploadScreenshot(
    dataUrl: string,
    options?: ScreenshotUploadOptions
  ): Promise<ScreenshotUploadResult> {
    if (!this.uploadEndpoint) {
      throw new Error("Upload endpoint is not configured");
    }

    const response = await fetch(this.uploadEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data_url: dataUrl,
        source: options?.source,
        metadata: options?.metadata,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.detail || "Failed to upload screenshot");
    }

    return (await response.json()) as ScreenshotUploadResult;
  }

  /**
   * Check if maximum screenshots reached.
   */
  canTakeScreenshot(currentCount: number): boolean {
    return currentCount < this.maxScreenshots;
  }

  /**
   * Get maximum allowed screenshots.
   */
  getMaxScreenshots(): number {
    return this.maxScreenshots;
  }
}

