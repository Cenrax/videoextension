/**
 * Service for managing WebSocket connections to the backend.
 */

/// <reference lib="ES2015.Promise" />

export interface WebSocketMessage {
  status?: string;
  action?: string;
  frame_count?: number;
  message?: string;
  [key: string]: unknown;
}

export type WebSocketMessageHandler = (message: WebSocketMessage) => void;
export type WebSocketErrorHandler = (error: Event) => void;
export type WebSocketCloseHandler = () => void;

export class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private messageHandler: WebSocketMessageHandler | null = null;
  private errorHandler: WebSocketErrorHandler | null = null;
  private closeHandler: WebSocketCloseHandler | null = null;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Connect to WebSocket server.
   */
  connect(): Promise<void> {
    // Check if already connected
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve(undefined);
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("WebSocket connected");
          resolve(undefined);
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            if (this.messageHandler) {
              this.messageHandler(message);
            }
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          if (this.errorHandler) {
            this.errorHandler(error);
          }
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("WebSocket disconnected");
          if (this.closeHandler) {
            this.closeHandler();
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server.
   */
  disconnect(): void {
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.send({ action: "stop" });
        this.ws.close();
      }
      this.ws = null;
    }
  }

  /**
   * Send a message to the server.
   */
  send(message: WebSocketMessage | Blob): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket is not connected");
      return;
    }

    if (message instanceof Blob) {
      this.ws.send(message);
    } else {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Check if WebSocket is connected.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Set message handler.
   */
  onMessage(handler: WebSocketMessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Set error handler.
   */
  onError(handler: WebSocketErrorHandler): void {
    this.errorHandler = handler;
  }

  /**
   * Set close handler.
   */
  onClose(handler: WebSocketCloseHandler): void {
    this.closeHandler = handler;
  }
}

