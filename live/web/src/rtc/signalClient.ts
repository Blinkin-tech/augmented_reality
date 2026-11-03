import { nextDelay, giveUp } from "./backoff";

export type SignalMessage = { type: "offer" | "answer" | "ice"; [k: string]: unknown };
export type SignalStatus = "connecting" | "open" | "reconnecting" | "lost";

export interface SignalHandlers {
  onJoined(m: any): void;
  onPeerJoined(): void;
  onPeerLeft(): void;
  onSignal(m: SignalMessage): void;
  onEnded(): void;
  onStatus(s: SignalStatus): void;
  onError?(message: string): void;
  /** Called when the server closes the socket with an application code (4xxx), before the status update. */
  onClosed?(code: number, reason: string): void;
}

export interface SignalOptions {
  WebSocketImpl?: typeof WebSocket;
  now?: () => number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

const CONNECTING = 0;
const OPEN = 1;

export class SignalClient {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private downSince = 0;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly WS: typeof WebSocket;
  private readonly now: () => number;
  private readonly later: typeof setTimeout;
  private readonly clearLater: typeof clearTimeout;

  constructor(private url: string, private h: SignalHandlers, opts: SignalOptions = {}) {
    this.WS = opts.WebSocketImpl ?? WebSocket;
    this.now = opts.now ?? Date.now;
    this.later = opts.setTimeoutImpl ?? setTimeout;
    this.clearLater = opts.clearTimeoutImpl ?? clearTimeout;
    this.h.onStatus("connecting");
    this.connect();
  }

  private connect(): void {
    const ws = new this.WS(this.url);
    this.ws = ws;
    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.attempt = 0;
      this.downSince = 0;
      this.h.onStatus("open");
    };
    ws.onmessage = (e: MessageEvent) => {
      if (ws !== this.ws) return;
      let m: any;
      try { m = JSON.parse(e.data as string); } catch { return; }
      switch (m?.type) {
        case "joined": this.h.onJoined(m); break;
        case "peer-joined": this.h.onPeerJoined(); break;
        case "peer-left": this.h.onPeerLeft(); break;
        case "error": this.h.onError?.(m.message); break;
        case "offer": case "answer": case "ice": this.h.onSignal(m); break;
      }
    };
    ws.onclose = (e: CloseEvent) => {
      if (ws !== this.ws || this.closed) return;
      if (e.code === 4000) { this.h.onEnded(); return; }
      if (e.code >= 4000 && e.code < 5000) this.h.onClosed?.(e.code, e.reason);
      if (e.code === 4404) { this.h.onStatus("lost"); return; }
      // 4409 "role taken" usually means our previous socket is not dead yet on the server;
      // the server heartbeat frees the slot, so retry inside the normal backoff window.
      if (!this.downSince) this.downSince = this.now();
      if (giveUp(this.now() - this.downSince)) { this.h.onStatus("lost"); return; }
      this.h.onStatus("reconnecting");
      this.timer = this.later(() => { this.timer = undefined; if (!this.closed) this.connect(); }, nextDelay(this.attempt++));
    };
  }

  send(m: object): void {
    if (this.ws && this.ws.readyState === OPEN) this.ws.send(JSON.stringify(m));
  }

  close(): void {
    this.closed = true;
    if (this.timer !== undefined) { this.clearLater(this.timer); this.timer = undefined; }
    const rs = this.ws?.readyState;
    if (rs === undefined || rs === CONNECTING || rs === OPEN) this.ws?.close();
  }
}
