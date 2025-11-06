/**
 * Service for managing screenshots from video streams.
 */

export class ScreenshotService {
  private maxScreenshots: number;

  constructor(maxScreenshots: number = 2) {
    this.maxScreenshots = maxScreenshots;
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

