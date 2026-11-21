import { randomInt } from "node:crypto";
import type { WebSocket } from "ws";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export interface Snapshot {
  id: string;
  file: string;
  takenAt: number;
}

export interface Session {
  code: string;
  createdAt: number;
  state: "waiting" | "live" | "ended";
  snapshots: Snapshot[];
  agentSocket?: WebSocket;
  customerSocket?: WebSocket;
}

export function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(opts: { ttlMs: number; now?: () => number }) {
    this.ttlMs = opts.ttlMs;
    this.now = opts.now ?? Date.now;
  }

  create(): Session {
    let code = generateCode();
    while (this.sessions.has(code)) code = generateCode();
    const session: Session = {
      code,
      createdAt: this.now(),
      state: "waiting",
      snapshots: [],
    };
    this.sessions.set(code, session);
    return session;
  }

  get(code: string): Session | undefined {
    return this.sessions.get(normalizeCode(code));
  }

  end(code: string): boolean {
    const session = this.get(code);
    if (!session) return false;
    this.endSession(session);
    return true;
  }

  expire(): string[] {
    const cutoff = this.now() - this.ttlMs;
    const expired: string[] = [];
    for (const session of this.sessions.values()) {
      if (session.state !== "ended" && session.createdAt <= cutoff) {
        this.endSession(session);
        expired.push(session.code);
      }
    }
    return expired;
  }

  private endSession(session: Session): void {
    session.state = "ended";
    session.agentSocket?.close(4000, "session ended");
    session.customerSocket?.close(4000, "session ended");
  }
}
