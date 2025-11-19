/**
 * Services module exports.
 */
export { VideoStreamService } from "./videoStreamService";
export type { StreamCaptureResult } from "./videoStreamService";

export { WebSocketService } from "./websocketService";
export type {
  WebSocketMessage,
  WebSocketMessageHandler,
  WebSocketErrorHandler,
  WebSocketCloseHandler,
} from "./websocketService";

export { FrameCaptureService } from "./frameCaptureService";
export type { FrameCaptureConfig } from "./frameCaptureService";

export {
  ScreenshotService,
  type ScreenshotUploadResult,
  type ScreenshotUploadOptions,
} from "./screenshotService";

export { DomService } from "./domService";

export { AudioStreamService, audioStreamService } from "./audioStreamService";
export type {
  AudioStreamConfig,
  AudioAnalysisResult,
} from "./audioStreamService";

export {
  AudioWebSocketService,
  audioWebSocketService,
} from "./audioWebSocketService";
export type { AudioWebSocketConfig } from "./audioWebSocketService";

