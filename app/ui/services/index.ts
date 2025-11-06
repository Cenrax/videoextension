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

export { ScreenshotService } from "./screenshotService";

export { DomService } from "./domService";

