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
}

export interface SignalOptions {
  WebSocketImpl?: typeof WebSocket;
  now?: () => number;
  setTimeoutImpl?: typeof setTimeout;
}

const OPEN = 1;

export class SignalClient {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private downSince = 0;
  private closed = false;
  private readonly WS: typeof WebSocket;
  private readonly now: () => number;
  private readonly later: typeof setTimeout;

  constructor(private url: string, private h: SignalHandlers, opts: SignalOptions = {}) {
    this.WS = opts.WebSocketImpl ?? WebSocket;
    this.now = opts.now ?? Date.now;
    this.later = opts.setTimeoutImpl ?? setTimeout;
    this.h.onStatus("connecting");
    this.connect();
  }

  private connect(): void {
    const ws = new this.WS(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.downSince = 0;
      this.h.onStatus("open");
    };
    ws.onmessage = (e: MessageEvent) => {
      let m: any;
      try { m = JSON.parse(e.data as string); } catch { return; }
      switch (m?.type) {
        case "joined": this.h.onJoined(m); break;
        case "peer-joined": this.h.onPeerJoined(); break;
        case "peer-left": this.h.onPeerLeft(); break;
        case "offer": case "answer": case "ice": this.h.onSignal(m); break;
      }
    };
    ws.onclose = (e: CloseEvent) => {
      if (this.closed) return;
      if (e.code === 4000) { this.h.onEnded(); return; }
      if (e.code === 4404 || e.code === 4409) { this.h.onStatus("lost"); return; }
      if (!this.downSince) this.downSince = this.now();
      if (giveUp(this.now() - this.downSince)) { this.h.onStatus("lost"); return; }
      this.h.onStatus("reconnecting");
      this.later(() => { if (!this.closed) this.connect(); }, nextDelay(this.attempt++));
    };
  }

  send(m: object): void {
    if (this.ws && this.ws.readyState === OPEN) this.ws.send(JSON.stringify(m));
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
